import { formatOperand } from './optimizer.js';

export function generateTargetCode(instructions) {
  const code = [];
  let nextRegister = 0;
  const registers = new Map();
  const registerFor = (name) => {
    if (!registers.has(name)) registers.set(name, `R${nextRegister++}`);
    return registers.get(name);
  };
  const emit = (opcode, operands, source) => code.push({ number: code.length + 1, opcode, operands, text: `${opcode}${operands.length ? ` ${operands.join(', ')}` : ''}`, source });
  const load = (value, register, source) => {
    if (value && typeof value === 'object' && value.literal) emit('LOADI', [register, JSON.stringify(value.value)], source);
    else if (typeof value !== 'string') emit('LOADI', [register, String(value)], source);
    else emit('LOAD', [register, `[${value}]`], source);
  };

  for (const instruction of instructions) {
    const source = instruction.source;
    if (instruction.op === 'label') { emit('LABEL', [instruction.name], source); continue; }
    if (instruction.op === 'jump') { emit('JMP', [instruction.target], source); continue; }
    if (instruction.op === 'branchFalse') {
      const register = registerFor(`$condition${code.length}`);
      load(instruction.condition, register, source);
      emit('JZ', [register, instruction.target], source);
      continue;
    }
    if (instruction.op === 'return') {
      if (instruction.value === null) emit('RET', [], source);
      else {
        const register = registerFor('$return');
        load(instruction.value, register, source);
        emit('RET', [register], source);
      }
      continue;
    }
    const destination = registerFor(instruction.dest);
    if (instruction.op === 'assign') {
      load(instruction.value, destination, source);
      emit('STORE', [`[${formatOperand(instruction.dest)}]`, destination], source);
      continue;
    }
    if (instruction.op === 'unary') {
      load(instruction.value, destination, source);
      emit(instruction.operator === '-' ? 'NEG' : instruction.operator === '!' ? 'NOT' : 'MOV', [destination], source);
      emit('STORE', [`[${formatOperand(instruction.dest)}]`, destination], source);
      continue;
    }
    if (instruction.op === 'binary') {
      const left = registerFor(`$left${code.length}`);
      const right = registerFor(`$right${code.length}`);
      load(instruction.left, left, source);
      load(instruction.right, right, source);
      const opcode = ({ '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '<': 'CMP_LT', '<=': 'CMP_LE', '>': 'CMP_GT', '>=': 'CMP_GE', '==': 'CMP_EQ', '!=': 'CMP_NE', '&&': 'AND', '||': 'OR' })[instruction.operator] ?? 'OP';
      emit(opcode, [destination, left, right], source);
      emit('STORE', [`[${formatOperand(instruction.dest)}]`, destination], source);
    }
  }
  return code;
}
