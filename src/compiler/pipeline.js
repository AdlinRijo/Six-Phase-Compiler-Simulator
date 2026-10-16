import { tokenize } from './lexer.js';
import { parse } from './parser.js';
import { analyzeSemantics } from './semantic-analyzer.js';
import { generateIR } from './ir-generator.js';
import { optimize } from './optimizer.js';
import { generateTargetCode } from './code-generator.js';
import { executeIR } from './interpreter.js';

const MAX_SOURCE_LENGTH = 100_000;

export function compile(source) {
  if (source.length > MAX_SOURCE_LENGTH) {
    return {
      source,
      tokens: [],
      ast: { kind: 'Program', body: [], start: 0, end: 0 },
      symbols: [],
      references: [],
      ir: [],
      optimization: optimize([]),
      target: [],
      execution: null,
      optimizedExecution: null,
      diagnostics: [{
        severity: 'error',
        message: `Source exceeds the ${MAX_SOURCE_LENGTH.toLocaleString()} character safety limit.`,
        phase: 'Lexical Analysis',
        line: 1,
        column: 1,
        start: 0,
        end: 0
      }],
      phases: [
        { id: 'lex', name: 'Lexical Analysis', status: 'error', count: 0 },
        { id: 'parse', name: 'Syntax Analysis', status: 'blocked', count: 0 },
        { id: 'semantic', name: 'Semantic Analysis', status: 'blocked', count: 0 },
        { id: 'ir', name: 'Intermediate Code', status: 'blocked', count: 0 },
        { id: 'optimize', name: 'Code Optimization', status: 'blocked', count: 0 },
        { id: 'target', name: 'Target Generation', status: 'blocked', count: 0 }
      ]
    };
  }
  const lexical = tokenize(source);
  const syntax = parse(lexical.tokens);
  const semantic = analyzeSemantics(syntax.ast);
  const diagnostics = [...lexical.diagnostics, ...syntax.diagnostics, ...semantic.diagnostics];
  const blocked = diagnostics.some((item) => item.severity === 'error');
  const ir = blocked ? [] : generateIR(syntax.ast);
  const optimization = optimize(ir);
  const target = generateTargetCode(optimization.optimized);
  let execution = null;
  let optimizedExecution = null;
  if (!blocked) {
    try {
      execution = executeIR(ir);
      optimizedExecution = executeIR(optimization.optimized);
    } catch (error) {
      diagnostics.push({
        severity: 'warning',
        message: error.message,
        phase: 'Execution Trace',
        line: 1,
        column: 1,
        start: 0,
        end: 0
      });
    }
  }
  return {
    source,
    tokens: lexical.tokens.filter((token) => !['comment', 'whitespace', 'eof'].includes(token.type)),
    ast: syntax.ast,
    symbols: semantic.symbols,
    references: semantic.references,
    ir,
    optimization,
    target,
    execution,
    optimizedExecution,
    diagnostics,
    phases: [
      { id: 'lex', name: 'Lexical Analysis', status: lexical.diagnostics.some((item) => item.severity === 'error') ? 'error' : 'complete', count: lexical.tokens.filter((token) => !['comment', 'whitespace', 'eof'].includes(token.type)).length },
      { id: 'parse', name: 'Syntax Analysis', status: syntax.diagnostics.length ? 'error' : 'complete', count: countNodes(syntax.ast) },
      { id: 'semantic', name: 'Semantic Analysis', status: semantic.diagnostics.some((item) => item.severity === 'error') ? 'error' : 'complete', count: semantic.symbols.length },
      { id: 'ir', name: 'Intermediate Code', status: blocked ? 'blocked' : 'complete', count: ir.length },
      { id: 'optimize', name: 'Code Optimization', status: blocked ? 'blocked' : 'complete', count: optimization.transformations.length },
      { id: 'target', name: 'Target Generation', status: blocked ? 'blocked' : 'complete', count: target.length }
    ]
  };
}

function countNodes(node) {
  if (!node || typeof node !== 'object') return 0;
  return 1 + Object.entries(node).reduce((total, [key, value]) => {
    if (key === 'token' || key === 'source') return total;
    return total + (Array.isArray(value) ? value.reduce((sum, child) => sum + countNodes(child), 0) : countNodes(value));
  }, 0);
}
