import { diagnostic } from './diagnostics.js';
import { SymbolTable } from './symbol-table.js';

const numeric = new Set(['int', 'float', 'char']);

export function analyzeSemantics(ast) {
  const table = new SymbolTable();
  const diagnostics = [];
  const references = [];
  const report = (message, node, severity = 'error') => diagnostics.push(diagnostic(message, node?.token ?? node, 'Semantic Analysis', severity));
  const compatible = (target, value) => target === value || (numeric.has(target) && numeric.has(value)) || value === 'unknown';
  const initializationState = () => new Map(table.rows.map((symbol) => [symbol, symbol.initialized]));
  const restoreInitialization = (snapshot) => snapshot.forEach((initialized, symbol) => { symbol.initialized = initialized; });
  const recordReference = (symbol, node) => {
    symbol.references.push({ start: node.start, end: node.end, line: node.token?.line ?? 1 });
    references.push({ name: symbol.name, declarationLine: symbol.line, start: node.start, end: node.end });
  };

  function checkExpression(node, write = false) {
    if (!node) return 'void';
    if (node.kind === 'Literal') return node.dataType;
    if (node.kind === 'Identifier') {
      const symbol = table.resolve(node.name);
      if (!symbol) { report(`“${node.name}” is not declared in this scope.`, node); return 'unknown'; }
      if (write) symbol.initialized = true;
      else {
        recordReference(symbol, node);
        if (!symbol.initialized) report(`“${node.name}” may be read before it is initialized.`, node, 'warning');
      }
      return symbol.dataType;
    }
    if (node.kind === 'UnaryExpression') {
      const modifies = ['++', '--'].includes(node.operator);
      const type = checkExpression(node.argument);
      if (modifies && node.argument.kind === 'Identifier') {
        const symbol = table.resolve(node.argument.name);
        if (symbol) symbol.initialized = true;
      }
      if (node.operator === '!') {
        if (!numeric.has(type) && type !== 'bool' && type !== 'unknown') report('Logical negation requires a scalar operand.', node);
        return 'bool';
      }
      if (!numeric.has(type) && type !== 'unknown') report(`Operator “${node.operator}” requires a numeric operand.`, node);
      return type;
    }
    if (node.kind === 'BinaryExpression') {
      if (['=', '+=', '-='].includes(node.operator)) {
        if (node.left.kind !== 'Identifier') report('The left side of an assignment must be a variable.', node.left);
        const symbol = node.left.kind === 'Identifier' ? table.resolve(node.left.name) : null;
        if (node.left.kind === 'Identifier' && !symbol) report(`“${node.left.name}” is not declared in this scope.`, node.left);
        const leftType = symbol?.dataType ?? 'unknown';
        if (node.operator !== '=' && node.left.kind === 'Identifier' && symbol) checkExpression(node.left);
        const rightType = checkExpression(node.right);
        if (!compatible(leftType, rightType)) report(`Cannot assign ${rightType} to ${leftType}.`, node);
        if (node.operator !== '=' && !numeric.has(leftType) && leftType !== 'unknown') report(`Operator “${node.operator}” requires a numeric variable.`, node);
        if (symbol) symbol.initialized = true;
        return leftType;
      }
      if (node.operator === '&&' || node.operator === '||') {
        const leftType = checkExpression(node.left);
        const beforeRight = initializationState();
        const rightType = checkExpression(node.right);
        restoreInitialization(beforeRight);
        if ((!numeric.has(leftType) && leftType !== 'bool' && leftType !== 'unknown') || (!numeric.has(rightType) && rightType !== 'bool' && rightType !== 'unknown')) {
          report(`Operator “${node.operator}” requires scalar operands.`, node);
        }
        return 'bool';
      }
      const leftType = checkExpression(node.left);
      const rightType = checkExpression(node.right);
      if (['==', '!=', '<', '<=', '>', '>='].includes(node.operator)) {
        const equality = ['==', '!='].includes(node.operator);
        const numericOperands = numeric.has(leftType) && numeric.has(rightType);
        const matchingScalars = equality && leftType === rightType && ['bool', 'char'].includes(leftType);
        if (!numericOperands && !matchingScalars && leftType !== 'unknown' && rightType !== 'unknown') {
          report(`Operator “${node.operator}” requires compatible scalar operands.`, node);
        }
        return 'bool';
      }
      if ((!numeric.has(leftType) || !numeric.has(rightType)) && leftType !== 'unknown' && rightType !== 'unknown') report(`Operator “${node.operator}” requires numeric operands.`, node);
      return leftType === 'float' || rightType === 'float' ? 'float' : leftType;
    }
    return 'unknown';
  }
  function visitStatement(node) {
    if (node.kind === 'Program') { node.body.forEach(visitStatement); return; }
    if (node.kind === 'Block') {
      table.enterScope();
      node.statements.forEach(visitStatement);
      table.exitScope();
      return;
    }
    if (node.kind === 'Declaration') {
      if (node.dataType === 'void') report('Variables cannot have type void.', node);
      const symbol = table.declare(node.name, node.dataType, node.token, false);
      if (!symbol) report(`“${node.name}” is already declared in this scope.`, node);
      if (node.initializer) {
        if (node.initializer.kind === 'Literal' && node.initializer.dataType === 'char' && [...node.initializer.value].length !== 1) {
          report('Character literals must contain exactly one character.', node.initializer);
        }
        const valueType = checkExpression(node.initializer);
        if (!compatible(node.dataType, valueType)) report(`Cannot initialize ${node.dataType} with ${valueType}.`, node);
        if (symbol) symbol.initialized = true;
      }
      return;
    }
    if (node.kind === 'ExpressionStatement') { checkExpression(node.expression); return; }
    if (node.kind === 'If' || node.kind === 'While') {
      const conditionType = checkExpression(node.test);
      if (conditionType !== 'bool' && conditionType !== 'unknown' && !numeric.has(conditionType)) report('Condition must be a scalar value.', node.test);
      if (node.kind === 'If') {
        const beforeBranches = initializationState();
        visitStatement(node.consequent);
        const afterConsequent = initializationState();
        restoreInitialization(beforeBranches);
        if (node.alternate) visitStatement(node.alternate);
        const afterAlternate = node.alternate ? initializationState() : beforeBranches;
        for (const [symbol, initialized] of beforeBranches) {
          symbol.initialized = (afterConsequent.get(symbol) ?? initialized) && (afterAlternate.get(symbol) ?? initialized);
        }
      } else {
        const beforeBody = initializationState();
        visitStatement(node.body);
        restoreInitialization(beforeBody);
      }
      return;
    }
    if (node.kind === 'For') {
      table.enterScope();
      if (node.initializer) visitStatement(node.initializer);
      if (node.test) checkExpression(node.test);
      const beforeBody = initializationState();
      visitStatement(node.body);
      if (node.update) checkExpression(node.update);
      restoreInitialization(beforeBody);
      table.exitScope();
      return;
    }
    if (node.kind === 'Return') checkExpression(node.value);
  }
  visitStatement(ast);
  return { symbols: table.rows, diagnostics, references };
}
