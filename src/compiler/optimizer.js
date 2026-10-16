const isLiteral = (value) => typeof value === 'number' || typeof value === 'boolean' || (value && typeof value === 'object' && value.literal === true);
const literalValue = (value) => value && typeof value === 'object' && value.literal ? value.value : value;
const literal = (value) => ({ literal: true, value });
const isVariable = (value) => typeof value === 'string';
const numericValue = (value) => isLiteral(value) && typeof literalValue(value) === 'number';
const safeNumber = (value, inputs) => Number.isFinite(value) && (inputs.some(Number.isInteger) ? Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647 : true);

function transform(instructions, fn) {
  const changes = [];
  const result = [];
  for (const instruction of instructions) {
    const next = fn(instruction, changes);
    if (next) result.push(next);
  }
  return { instructions: result.map((instruction, index) => ({ ...instruction, id: index + 1 })), changes };
}

export function constantFolding(instructions) {
  return transform(instructions, (instruction, changes) => {
    if (instruction.op !== 'binary' || !numericValue(instruction.left) || !numericValue(instruction.right)) return instruction;
    const a = literalValue(instruction.left);
    const b = literalValue(instruction.right);
    let value;
    switch (instruction.operator) {
      case '+': value = a + b; break;
      case '-': value = a - b; break;
      case '*': value = a * b; break;
      case '/': if (b === 0) return instruction; value = a / b; break;
      case '%': if (b === 0) return instruction; value = a % b; break;
      case '<': value = a < b; break;
      case '<=': value = a <= b; break;
      case '>': value = a > b; break;
      case '>=': value = a >= b; break;
      case '==': value = a === b; break;
      case '!=': value = a !== b; break;
      default: return instruction;
    }
    if (typeof value === 'number' && !safeNumber(value, [a, b])) return instruction;
    changes.push({ kind: 'fold', instructionId: instruction.id, source: instruction.source, before: instruction, after: { op: 'assign', dest: instruction.dest, value }, explanation: `${a} ${instruction.operator} ${b} evaluates to ${value}.` });
    return { op: 'assign', dest: instruction.dest, value, source: instruction.source };
  });
}

export function algebraicSimplification(instructions) {
  return transform(instructions, (instruction, changes) => {
    if (instruction.op !== 'binary') return instruction;
    let value;
    if (['+', '-'].includes(instruction.operator) && numericValue(instruction.right) && literalValue(instruction.right) === 0) value = instruction.left;
    else if (instruction.operator === '+' && numericValue(instruction.left) && literalValue(instruction.left) === 0) value = instruction.right;
    else if (instruction.operator === '*' && numericValue(instruction.right) && literalValue(instruction.right) === 1) value = instruction.left;
    else if (instruction.operator === '*' && numericValue(instruction.left) && literalValue(instruction.left) === 1) value = instruction.right;
    if (value === undefined) return instruction;
    const after = { op: 'assign', dest: instruction.dest, value, source: instruction.source };
    changes.push({ kind: 'simplify', instructionId: instruction.id, source: instruction.source, before: instruction, after, explanation: `Identity rule: ${instruction.operator} with ${literalValue(instruction.operator === '+' || instruction.operator === '-' ? instruction.right : instruction.right)} leaves the other operand unchanged.` });
    return after;
  });
}

export function constantPropagation(instructions) {
  const known = new Map();
  const changes = [];
  const result = [];
  const resolve = (value) => isVariable(value) && known.has(value) ? known.get(value) : value;
  for (const instruction of instructions) {
    if (instruction.op === 'label' || instruction.op === 'jump' || instruction.op === 'branchFalse') known.clear();
    let next = { ...instruction };
    if (instruction.op === 'binary') {
      next.left = resolve(instruction.left);
      next.right = resolve(instruction.right);
    } else if (instruction.op === 'assign') next.value = resolve(instruction.value);
    else if (instruction.op === 'unary') next.value = resolve(instruction.value);
    else if (instruction.op === 'branchFalse') next.condition = resolve(instruction.condition);
    else if (instruction.op === 'return' && instruction.value !== null) next.value = resolve(instruction.value);
    if (JSON.stringify(next) !== JSON.stringify(instruction)) changes.push({ kind: 'propagate', instructionId: instruction.id, source: instruction.source, before: instruction, after: next, explanation: 'A variable use is replaced with its known constant value.' });
    if (instruction.dest) known.delete(instruction.dest);
    if (next.op === 'assign' && isLiteral(next.value) && isVariable(next.dest)) known.set(next.dest, next.value);
    result.push(next);
  }
  return { instructions: result.map((instruction, index) => ({ ...instruction, id: index + 1 })), changes };
}

export function commonSubexpressionElimination(instructions) {
  const expressions = new Map();
  const changes = [];
  const result = [];
  for (const instruction of instructions) {
    if (instruction.op === 'label' || instruction.op === 'jump' || instruction.op === 'branchFalse') expressions.clear();
    if (instruction.dest) {
      for (const [key, value] of expressions) {
        if (key.split('|').includes(instruction.dest)) expressions.delete(key);
        if (value === instruction.dest) expressions.delete(key);
      }
    }
    if (instruction.op === 'binary' && !['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(instruction.operator)) {
      const operands = [instruction.left, instruction.right];
      const canReorder = ['+', '*'].includes(instruction.operator);
      const keyParts = operands.map((value) => JSON.stringify(value));
      if (canReorder) keyParts.sort();
      const key = `${instruction.operator}|${keyParts.join('|')}`;
      if (expressions.has(key)) {
        const existing = expressions.get(key);
        const after = { op: 'assign', dest: instruction.dest, value: existing, source: instruction.source };
        changes.push({ kind: 'reuse', instructionId: instruction.id, source: instruction.source, before: instruction, after, explanation: `Reuses ${existing}; this expression was already computed in the current basic block.` });
        result.push(after);
        continue;
      }
      if (!operands.some((value) => isVariable(value))) expressions.set(key, instruction.dest);
      else expressions.set(key, instruction.dest);
    }
    result.push(instruction);
  }
  return { instructions: result.map((instruction, index) => ({ ...instruction, id: index + 1 })), changes };
}

export function deadCodeElimination(instructions) {
  const used = new Set();
  const reversed = [];
  const changes = [];
  const operands = (instruction) => {
    if (instruction.op === 'binary') return [instruction.left, instruction.right];
    if (instruction.op === 'assign') return [instruction.value];
    if (instruction.op === 'unary') return [instruction.value];
    if (instruction.op === 'branchFalse') return [instruction.condition];
    if (instruction.op === 'return') return [instruction.value];
    return [];
  };
  for (const instruction of [...instructions].reverse()) {
    const removable = instruction.dest?.startsWith('%t') && !used.has(instruction.dest) && ['assign', 'binary', 'unary'].includes(instruction.op);
    if (removable) {
      changes.push({ kind: 'remove', instructionId: instruction.id, source: instruction.source, before: instruction, after: null, explanation: `${instruction.dest} is never read, so this pure temporary computation is unused.` });
      continue;
    }
    if (instruction.dest) used.delete(instruction.dest);
    operands(instruction).filter(isVariable).forEach((source) => used.add(source));
    reversed.push(instruction);
  }
  const result = reversed.reverse();
  return { instructions: result.map((instruction, index) => ({ ...instruction, id: index + 1 })), changes };
}

export function unreachableCodeElimination(instructions) {
  let unreachable = false;
  return transform(instructions, (instruction, changes) => {
    if (instruction.op === 'label') unreachable = false;
    if (unreachable && instruction.op !== 'label') {
      changes.push({ kind: 'unreachable', instructionId: instruction.id, source: instruction.source, before: instruction, after: null, explanation: 'This instruction cannot be reached after an unconditional transfer of control.' });
      return null;
    }
    if (instruction.op === 'jump' || instruction.op === 'return') unreachable = true;
    return instruction;
  });
}

export function optimize(instructions) {
  const passes = [
    ['Constant folding', constantFolding],
    ['Constant propagation', constantPropagation],
    ['Constant folding after propagation', constantFolding],
    ['Constant propagation after folding', constantPropagation],
    ['Common subexpression elimination', commonSubexpressionElimination],
    ['Algebraic simplification', algebraicSimplification],
    ['Dead-code elimination', deadCodeElimination],
    ['Unreachable-code elimination', unreachableCodeElimination]
  ];
  let current = instructions.map((instruction) => ({ ...instruction }));
  const transformations = [];
  const passResults = [];
  for (const [name, pass] of passes) {
    const result = pass(current);
    current = result.instructions;
    transformations.push(...result.changes.map((change) => ({ ...change, pass: name })));
    passResults.push({ name, instructions: current.map((instruction) => ({ ...instruction })), changes: result.changes });
  }
  return { original: instructions, optimized: current, transformations, passResults };
}

export function formatOperand(value) {
  if (value && typeof value === 'object' && value.literal) return value.display ?? JSON.stringify(value.value);
  if (typeof value === 'string') return value.startsWith('%t') ? value.slice(1) : value;
  return String(value);
}

export function formatInstruction(instruction) {
  switch (instruction.op) {
    case 'assign': return `${formatOperand(instruction.dest)} = ${formatOperand(instruction.value)}`;
    case 'binary': return `${formatOperand(instruction.dest)} = ${formatOperand(instruction.left)} ${instruction.operator} ${formatOperand(instruction.right)}`;
    case 'unary': return `${formatOperand(instruction.dest)} = ${instruction.operator}${formatOperand(instruction.value)}`;
    case 'branchFalse': return `ifFalse ${formatOperand(instruction.condition)} goto ${instruction.target}`;
    case 'jump': return `goto ${instruction.target}`;
    case 'label': return `${instruction.name}:`;
    case 'return': return instruction.value === null ? 'return' : `return ${formatOperand(instruction.value)}`;
    default: return 'unknown instruction';
  }
}
