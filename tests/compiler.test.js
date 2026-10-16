import { describe, expect, it } from 'vitest';
import { tokenize } from '../src/compiler/lexer.js';
import { parse } from '../src/compiler/parser.js';
import { analyzeSemantics } from '../src/compiler/semantic-analyzer.js';
import { generateIR } from '../src/compiler/ir-generator.js';
import {
  algebraicSimplification,
  commonSubexpressionElimination,
  constantFolding,
  constantPropagation,
  deadCodeElimination,
  formatInstruction,
  optimize,
  unreachableCodeElimination
} from '../src/compiler/optimizer.js';
import { generateTargetCode } from '../src/compiler/code-generator.js';
import { executeIR } from '../src/compiler/interpreter.js';
import { compile } from '../src/compiler/pipeline.js';

function astFor(source) {
  const { tokens } = tokenize(source);
  return parse(tokens).ast;
}

describe('lexer', () => {
  it('records token kinds and exact source coordinates while skipping whitespace', () => {
    const result = tokenize('int total = 12;\n// note\nreturn total;');
    expect(result.tokens.filter((token) => token.type !== 'whitespace').map((token) => token.type)).toEqual(['keyword', 'identifier', 'operator', 'number', 'punctuation', 'comment', 'keyword', 'identifier', 'punctuation', 'eof']);
    expect(result.tokens.find((token) => token.lexeme === 'return')).toMatchObject({ line: 3, column: 1, start: 24 });
    expect(result.tokens.some((token) => token.type === 'whitespace')).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports malformed input and unterminated strings', () => {
    const result = tokenize('int n = @;\n"unfinished');
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toMatchObject({ phase: 'Lexical Analysis', line: 1, column: 9 });
  });
});

describe('parser', () => {
  it('uses precedence and parses blocks, conditionals, and loops', () => {
    const { ast, diagnostics } = parse(tokenize('int x = 2 + 3 * 4; if (x > 2) { x = x - 1; } while (x > 0) x--;').tokens);
    expect(diagnostics).toEqual([]);
    expect(ast.body[0].initializer.operator).toBe('+');
    expect(ast.body[0].initializer.right.operator).toBe('*');
    expect(ast.body[1].kind).toBe('If');
    expect(ast.body[2].kind).toBe('While');
  });

  it('recovers from a missing semicolon and reports a source position', () => {
    const result = parse(tokenize('int value = 10\nreturn value;').tokens);
    expect(result.diagnostics[0]).toMatchObject({ phase: 'Syntax Analysis', line: 2, column: 1 });
  });
});

describe('semantic analysis', () => {
  it('checks declarations, scopes, references, and type compatibility', () => {
    const result = analyzeSemantics(astFor('int count = 1; { float count = 2.0; count = count + 1.0; } count = count + 1;'));
    expect(result.diagnostics).toEqual([]);
    expect(result.symbols.map((symbol) => [symbol.name, symbol.scopeId])).toEqual([['count', 0], ['count', 1]]);
    expect(result.references.length).toBe(2);
  });

  it('warns on reads before initialization and does not assume branches or loops always execute', () => {
    const result = analyzeSemantics(astFor('int value; if (true) value = 1; return value;'));
    expect(result.diagnostics.some((item) => item.severity === 'warning' && item.message.includes('before it is initialized'))).toBe(true);
    const postfix = analyzeSemantics(astFor('int value; value++;'));
    expect(postfix.diagnostics.some((item) => item.severity === 'warning' && item.message.includes('before it is initialized'))).toBe(true);
    const assignedOnBothPaths = analyzeSemantics(astFor('int value; if (true) value = 1; else value = 2; return value;'));
    expect(assignedOnBothPaths.diagnostics.some((item) => item.severity === 'warning')).toBe(false);
  });

  it('reports undeclared names, duplicates, and invalid type assignments', () => {
    const result = analyzeSemantics(astFor('int value; int value; value = "hello"; missing = 2;'));
    expect(result.diagnostics.map((item) => item.message)).toEqual(expect.arrayContaining([
      '“value” is already declared in this scope.',
      'Cannot assign string to int.',
      '“missing” is not declared in this scope.'
    ]));
    const invalidComparison = analyzeSemantics(astFor('bool result = "left" == "right";'));
    expect(invalidComparison.diagnostics.some((item) => item.message.includes('compatible scalar operands'))).toBe(true);
  });
});

describe('intermediate code generation', () => {
  it('lowers precedence and control flow into three-address instructions', () => {
    const instructions = generateIR(astFor('int n = 2 + 3 * 4; if (n > 3) n = n - 1; return n;'));
    expect(instructions.some((instruction) => instruction.op === 'binary' && instruction.operator === '*')).toBe(true);
    expect(instructions.some((instruction) => instruction.op === 'branchFalse')).toBe(true);
    expect(instructions.at(-1).op).toBe('return');
    expect(formatInstruction(instructions[0])).toContain('3 * 4');
  });

  it('preserves the old value of postfix increment expressions', () => {
    const instructions = generateIR(astFor('int i = 1; int old = i++; return old;'));
    expect(instructions.map(formatInstruction)).toEqual(['i = 1', 't1 = i', 't2 = i + 1', 'i = t2', 'old = t1', 'return old']);
  });

  it('lowers logical operators with short-circuit control flow', () => {
    const instructions = generateIR(astFor('int value = 0; bool result = false && (value = 1); return value;'));
    expect(instructions.some((instruction) => instruction.op === 'branchFalse')).toBe(true);
    expect(instructions.some((instruction) => instruction.op === 'label')).toBe(true);
  });
});

describe('optimizer passes', () => {
  it('folds constants but leaves division by zero and signed overflow alone', () => {
    const result = constantFolding([
      { id: 1, op: 'binary', dest: '%t1', left: 3, operator: '*', right: 4, source: { start: 0, end: 1 } },
      { id: 2, op: 'binary', dest: '%t2', left: 1, operator: '/', right: 0, source: { start: 1, end: 2 } },
      { id: 3, op: 'binary', dest: '%t3', left: 2147483647, operator: '+', right: 1, source: { start: 2, end: 3 } }
    ]);
    expect(result.instructions[0]).toMatchObject({ op: 'assign', value: 12 });
    expect(result.instructions.slice(1)).toHaveLength(2);
    expect(result.changes).toHaveLength(1);
  });

  it('propagates known literal values', () => {
    const result = constantPropagation([
      { id: 1, op: 'assign', dest: 'x', value: 8 },
      { id: 2, op: 'binary', dest: '%t1', left: 'x', operator: '+', right: 1 }
    ]);
    expect(result.instructions[1].left).toBe(8);
    expect(result.changes).toHaveLength(1);
  });

  it('reuses equivalent expressions in a basic block', () => {
    const result = commonSubexpressionElimination([
      { id: 1, op: 'binary', dest: '%t1', left: 'a', operator: '*', right: 'b' },
      { id: 2, op: 'binary', dest: '%t2', left: 'a', operator: '*', right: 'b' }
    ]);
    expect(result.instructions[1]).toMatchObject({ op: 'assign', dest: '%t2', value: '%t1' });
    expect(result.changes[0].kind).toBe('reuse');
  });

  it('applies identities without rewriting unsafe expressions', () => {
    const result = algebraicSimplification([
      { id: 1, op: 'binary', dest: '%t1', left: 'x', operator: '*', right: 1 },
      { id: 2, op: 'binary', dest: '%t2', left: 'x', operator: '/', right: 1 }
    ]);
    expect(result.instructions[0]).toMatchObject({ op: 'assign', value: 'x' });
    expect(result.instructions[1].op).toBe('binary');
  });

  it('removes unused temporaries and unreachable instructions', () => {
    const dead = deadCodeElimination([
      { id: 1, op: 'binary', dest: '%t1', left: 'a', operator: '+', right: 1 },
      { id: 2, op: 'assign', dest: 'result', value: 'a' }
    ]);
    expect(dead.instructions.map((instruction) => instruction.dest)).toEqual(['result']);
    const unreachable = unreachableCodeElimination([
      { id: 1, op: 'return', value: 1 },
      { id: 2, op: 'assign', dest: 'x', value: 2 },
      { id: 3, op: 'label', name: 'end' }
    ]);
    expect(unreachable.instructions.map((instruction) => instruction.op)).toEqual(['return', 'label']);
    expect(unreachable.changes).toHaveLength(1);
  });

  it('runs the passes in sequence and records only real transformations', () => {
    const result = optimize(generateIR(astFor('int answer = 2 + 3 * 4; return answer;')));
    expect(result.transformations.length).toBeGreaterThan(0);
    expect(result.optimized.some((instruction) => instruction.op === 'assign' && instruction.dest === 'answer' && instruction.value === 14)).toBe(true);
  });
});

describe('target code generation', () => {
  it('emits educational load, arithmetic, store, and return instructions with source mappings', () => {
    const target = generateTargetCode(generateIR(astFor('int a = 2; int b = a + 3; return b;')));
    expect(target.some((line) => line.opcode === 'LOADI')).toBe(true);
    expect(target.some((line) => line.opcode === 'ADD')).toBe(true);
    expect(target.some((line) => line.opcode === 'STORE')).toBe(true);
    expect(target.some((line) => line.opcode === 'RET')).toBe(true);
    expect(target.every((line) => typeof line.source.start === 'number')).toBe(true);
  });
});

describe('complete compiler pipeline', () => {
  it('connects all six real phases and preserves behavior after optimization', () => {
    const result = compile('int a = 5; int b = 3; int c = a + b * 2; return c;');
    expect(result.phases.map((phase) => phase.status)).toEqual(Array(6).fill('complete'));
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.ir.length).toBeGreaterThan(0);
    expect(result.execution.returnValue).toBe(11);
    expect(result.optimizedExecution.returnValue).toBe(11);
    expect(result.execution.variables.c).toBe(result.optimizedExecution.variables.c);
  });

  it.each([
    ['if and else', 'int n = 2; if (n > 1) n = n + 3; else n = 0; return n;', 5],
    ['while loop', 'int n = 0; while (n < 4) n++; return n;', 4],
    ['for loop', 'int total = 0; for (int i = 0; i < 4; i++) total = total + i; return total;', 6],
    ['postfix value', 'int i = 1; int old = i++; return old * 10 + i;', 12],
    ['short-circuit assignment', 'int n = 0; bool result = false && (n = 1); return n;', 0],
    ['common expression', 'int a = 4; int b = 7; int c = a * b + a * b; return c;', 56],
    ['character promotion', "char letter = 'A'; int code = letter + 1; return code;", 66]
  ])('preserves optimized behavior for %s programs', (_, source, expected) => {
    const result = compile(source);
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    expect(result.execution.returnValue).toBe(expected);
    expect(result.optimizedExecution.returnValue).toBe(expected);
  });

  it('blocks later phases for source errors and bounds execution of infinite loops', () => {
    const invalid = compile('int n = missing; return n;');
    expect(invalid.diagnostics.some((item) => item.message.includes('not declared'))).toBe(true);
    expect(invalid.phases[3].status).toBe('blocked');
    expect(invalid.ir).toEqual([]);

    const looping = compile('while (1) { int n = 1; }');
    expect(looping.execution).toBeNull();
    expect(looping.diagnostics.some((item) => item.phase === 'Execution Trace')).toBe(true);

    const oversized = compile(' '.repeat(100001));
    expect(oversized.diagnostics[0].message).toContain('safety limit');
    expect(oversized.phases[1].status).toBe('blocked');
  });
});
