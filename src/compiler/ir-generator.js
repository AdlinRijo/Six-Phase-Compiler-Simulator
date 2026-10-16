export function generateIR(ast) {
  const instructions = [];
  let tempId = 0;
  let labelId = 0;
  const temp = () => `%t${++tempId}`;
  const label = (prefix = 'L') => `${prefix}${++labelId}`;
  const emit = (op, fields, node) => instructions.push({ id: instructions.length + 1, op, ...fields, source: { start: node?.start ?? 0, end: node?.end ?? 0 } });

  function expression(node) {
    if (!node) return null;
    if (node.kind === 'Literal') {
      if (node.dataType === 'char') {
        const character = [...node.value][0] ?? '\0';
        const escaped = character.replace(/[\0\n\r\t\b\f\v\\']/g, (value) => ({
          '\0': '\\0', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b',
          '\f': '\\f', '\v': '\\v', '\\': '\\\\', "'": "\\'"
        })[value]);
        const display = `'${escaped}'`;
        return { literal: true, value: character.codePointAt(0), display };
      }
      if (node.dataType === 'string') return { literal: true, value: node.value, display: JSON.stringify(node.value) };
      return node.value;
    }
    if (node.kind === 'Identifier') return node.name;
    if (node.kind === 'UnaryExpression') {
      if (['++', '--'].includes(node.operator)) {
        const value = expression(node.argument);
        const previous = node.prefix ? null : temp();
        if (previous) emit('assign', { dest: previous, value }, node);
        const result = temp();
        emit('binary', { dest: result, left: value, operator: node.operator === '++' ? '+' : '-', right: 1 }, node);
        emit('assign', { dest: value, value: result }, node);
        return node.prefix ? result : previous;
      }
      const value = expression(node.argument);
      const result = temp();
      emit('unary', { dest: result, operator: node.operator, value }, node);
      return result;
    }
    if (node.kind === 'BinaryExpression') {
      if (['=', '+=', '-='].includes(node.operator)) {
        const target = node.left.name;
        const right = expression(node.right);
        if (node.operator === '=') emit('assign', { dest: target, value: right }, node);
        else emit('binary', { dest: target, left: target, operator: node.operator[0], right }, node);
        return target;
      }
      if (node.operator === '&&' || node.operator === '||') {
        const result = temp();
        const evaluateRight = label('logic');
        const falseBranch = label('false');
        const end = label('logicend');
        const left = expression(node.left);
        if (node.operator === '&&') {
          emit('branchFalse', { condition: left, target: falseBranch }, node.left);
          const right = expression(node.right);
          emit('branchFalse', { condition: right, target: falseBranch }, node.right);
          emit('assign', { dest: result, value: true }, node);
          emit('jump', { target: end }, node);
          emit('label', { name: falseBranch }, node);
          emit('assign', { dest: result, value: false }, node);
          emit('label', { name: end }, node);
        } else {
          emit('branchFalse', { condition: left, target: evaluateRight }, node.left);
          emit('assign', { dest: result, value: true }, node);
          emit('jump', { target: end }, node);
          emit('label', { name: evaluateRight }, node);
          const right = expression(node.right);
          emit('branchFalse', { condition: right, target: falseBranch }, node.right);
          emit('assign', { dest: result, value: true }, node);
          emit('jump', { target: end }, node);
          emit('label', { name: falseBranch }, node);
          emit('assign', { dest: result, value: false }, node);
          emit('label', { name: end }, node);
        }
        return result;
      }
      const left = expression(node.left);
      const right = expression(node.right);
      const result = temp();
      emit('binary', { dest: result, left, operator: node.operator, right }, node);
      return result;
    }
    return null;
  }
  function statement(node) {
    if (node.kind === 'Program') { node.body.forEach(statement); return; }
    if (node.kind === 'Block') { node.statements.forEach(statement); return; }
    if (node.kind === 'Declaration') {
      if (node.initializer) emit('assign', { dest: node.name, value: expression(node.initializer) }, node);
      return;
    }
    if (node.kind === 'ExpressionStatement') { expression(node.expression); return; }
    if (node.kind === 'If') {
      const otherwise = label('else');
      const end = label('endif');
      emit('branchFalse', { condition: expression(node.test), target: node.alternate ? otherwise : end }, node.test);
      statement(node.consequent);
      if (node.alternate) { emit('jump', { target: end }, node); emit('label', { name: otherwise }, node); statement(node.alternate); }
      emit('label', { name: end }, node);
      return;
    }
    if (node.kind === 'While') {
      const head = label('while');
      const end = label('endwhile');
      emit('label', { name: head }, node);
      emit('branchFalse', { condition: expression(node.test), target: end }, node.test);
      statement(node.body);
      emit('jump', { target: head }, node);
      emit('label', { name: end }, node);
      return;
    }
    if (node.kind === 'For') {
      if (node.initializer) statement(node.initializer);
      const head = label('for');
      const end = label('endfor');
      emit('label', { name: head }, node);
      if (node.test) emit('branchFalse', { condition: expression(node.test), target: end }, node.test);
      statement(node.body);
      if (node.update) expression(node.update);
      emit('jump', { target: head }, node);
      emit('label', { name: end }, node);
      return;
    }
    if (node.kind === 'Return') emit('return', { value: expression(node.value) }, node);
  }
  statement(ast);
  return instructions;
}
