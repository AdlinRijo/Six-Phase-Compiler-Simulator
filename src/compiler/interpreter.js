import { formatInstruction } from './optimizer.js';

export function executeIR(instructions, maxSteps = 10000) {
  const labels = new Map(instructions.flatMap((instruction, index) => instruction.op === 'label' ? [[instruction.name, index]] : []));
  const variables = Object.create(null);
  const trace = [];
  let returned = null;
  let pc = 0;
  while (pc < instructions.length && trace.length < maxSteps) {
    const instruction = instructions[pc];
    const read = (value) => value && typeof value === 'object' && value.literal ? value.value : typeof value === 'string' ? variables[value] : value;
    trace.push({ pc, instruction: formatInstruction(instruction), source: instruction.source });
    switch (instruction.op) {
      case 'assign': variables[instruction.dest] = read(instruction.value); break;
      case 'unary': {
        const value = read(instruction.value);
        variables[instruction.dest] = instruction.operator === '-' ? -value : instruction.operator === '!' ? !value : value;
        break;
      }
      case 'binary': {
        const a = read(instruction.left); const b = read(instruction.right);
        const operations = {
          '+': () => a + b, '-': () => a - b, '*': () => a * b,
          '/': () => a / b, '%': () => a % b, '<': () => a < b,
          '<=': () => a <= b, '>': () => a > b, '>=': () => a >= b,
          '==': () => a === b, '!=': () => a !== b, '&&': () => Boolean(a && b),
          '||': () => Boolean(a || b)
        };
        variables[instruction.dest] = operations[instruction.operator]?.();
        break;
      }
      case 'branchFalse': if (!read(instruction.condition)) { pc = labels.get(instruction.target) ?? pc; continue; } break;
      case 'jump': pc = labels.get(instruction.target) ?? pc; continue;
      case 'return': returned = instruction.value === null ? null : read(instruction.value); return { variables, trace, returnValue: returned, halted: true };
      case 'label': break;
      default: throw new Error(`Cannot execute IR operation “${instruction.op}”.`);
    }
    pc++;
  }
  if (trace.length >= maxSteps && pc < instructions.length) throw new Error(`Execution stopped after ${maxSteps} steps (possible infinite loop).`);
  return { variables, trace, returnValue: returned, halted: true };
}
