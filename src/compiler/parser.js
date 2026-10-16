import { diagnostic } from './diagnostics.js';

const types = new Set(['int', 'float', 'char', 'bool', 'void']);
const precedence = { '=': 1, '+=': 1, '-=': 1, '||': 2, '&&': 3, '==': 4, '!=': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '/': 7, '%': 7 };
const characterEscapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0', "'": "'", '"': '"', '\\': '\\' };

function decodeCharacter(value) {
  return value.replace(/\\(.)/g, (_, escaped) => characterEscapes[escaped] ?? escaped);
}

export class ParseError extends Error {
  constructor(message, token) { super(message); this.token = token; }
}

export function parse(tokens) {
  tokens = tokens.filter((token) => !['comment', 'whitespace'].includes(token.type));
  let current = 0;
  let statementNesting = 0;
  let expressionNesting = 0;
  let unaryNesting = 0;
  const diagnostics = [];
  const peek = () => tokens[current];
  const previous = () => tokens[current - 1];
  const atEnd = () => peek().type === 'eof';
  const check = (lexeme) => !atEnd() && peek().lexeme === lexeme;
  const advance = () => { if (!atEnd()) current++; return previous(); };
  const match = (...lexemes) => lexemes.some((lexeme) => check(lexeme) && (advance(), true));
  const consume = (lexeme, message = `Expected “${lexeme}”.`) => {
    if (check(lexeme)) return advance();
    throw new ParseError(message, peek());
  };
  const isType = () => types.has(peek().lexeme);

  function synchronize() {
    if (!atEnd()) advance();
    while (!atEnd()) {
      if (previous().lexeme === ';' || check('}')) return;
      if (['if', 'while', 'for', 'return', 'int', 'float', 'char', 'bool'].includes(peek().lexeme)) return;
      advance();
    }
  }
  function declarationOrStatement() {
    if (isType()) return declaration();
    return statement();
  }
  function declaration() {
    const typeToken = advance();
    const name = consumeIdentifier();
    let initializer = null;
    if (match('=')) initializer = expression();
    const end = consume(';');
    return { kind: 'Declaration', name: name.lexeme, dataType: typeToken.lexeme, initializer, start: typeToken.start, end: end.end, token: name };
  }
  function consumeIdentifier() {
    if (peek().type === 'identifier') return advance();
    throw new ParseError('Expected an identifier.', peek());
  }
  function statement() {
    if (++statementNesting > 128) {
      statementNesting--;
      throw new ParseError('Statement nesting exceeds the safe parser limit (128).', peek());
    }
    try { return parseStatement(); }
    finally { statementNesting--; }
  }
  function parseStatement() {
    if (match('{')) {
      const open = previous();
      const statements = [];
      while (!check('}') && !atEnd()) statements.push(declarationOrStatement());
      const close = consume('}', 'Expected “}” to close this block.');
      return { kind: 'Block', statements, start: open.start, end: close.end, token: open };
    }
    if (match('if')) {
      const token = previous();
      const start = token.start;
      consume('('); const test = expression(); consume(')');
      const consequent = statement();
      const alternate = match('else') ? statement() : null;
      return { kind: 'If', test, consequent, alternate, start, end: (alternate ?? consequent).end, token };
    }
    if (match('while')) {
      const token = previous();
      const start = token.start;
      consume('('); const test = expression(); consume(')');
      const body = statement();
      return { kind: 'While', test, body, start, end: body.end, token };
    }
    if (match('for')) {
      const token = previous();
      const start = token.start;
      consume('(');
      let initializer = null;
      if (isType()) initializer = declaration();
      else if (!check(';')) { const expr = expression(); consume(';'); initializer = { kind: 'ExpressionStatement', expression: expr, start: expr.start, end: expr.end }; }
      else advance();
      const test = check(';') ? null : expression();
      consume(';');
      const update = check(')') ? null : expression();
      consume(')');
      const body = statement();
      return { kind: 'For', initializer, test, update, body, start, end: body.end, token };
    }
    if (match('return')) {
      const token = previous();
      const start = token.start;
      const value = check(';') ? null : expression();
      const end = consume(';');
      return { kind: 'Return', value, start, end: end.end, token };
    }
    const expr = expression();
    const end = consume(';');
    return { kind: 'ExpressionStatement', expression: expr, start: expr.start, end: end.end, token: expr.token ?? tokens.find((token) => token.start === expr.start) };
  }
  function expression(min = 1) {
    if (++expressionNesting > 256) {
      expressionNesting--;
      throw new ParseError('Expression nesting exceeds the safe parser limit (256).', peek());
    }
    try { return parseExpression(min); }
    finally { expressionNesting--; }
  }
  function parseExpression(min) {
    let left = unary();
    while (precedence[peek().lexeme] >= min) {
      const operator = advance();
      const prec = precedence[operator.lexeme];
      const right = expression(prec + (prec === 1 ? 0 : 1));
      left = { kind: 'BinaryExpression', operator: operator.lexeme, left, right, start: left.start, end: right.end, token: operator };
    }
    return left;
  }
  function unary() {
    if (++unaryNesting > 128) {
      unaryNesting--;
      throw new ParseError('Unary expression nesting exceeds the safe parser limit (128).', peek());
    }
    try { return parseUnary(); }
    finally { unaryNesting--; }
  }
  function parseUnary() {
    if (match('!', '-', '+', '++', '--')) {
      const token = previous();
      const argument = unary();
      return { kind: 'UnaryExpression', operator: token.lexeme, argument, prefix: true, start: token.start, end: argument.end, token };
    }
    return primary();
  }
  function primary() {
    if (match('(')) {
      const open = previous(); const expr = expression(); const close = consume(')');
      return { ...expr, grouped: true, start: open.start, end: close.end };
    }
    if (match('true', 'false')) return { kind: 'Literal', value: previous().lexeme === 'true', dataType: 'bool', start: previous().start, end: previous().end, token: previous() };
    if (peek().type === 'number') {
      const token = advance();
      return { kind: 'Literal', value: Number(token.lexeme), dataType: token.lexeme.includes('.') || /[eE]/.test(token.lexeme) ? 'float' : 'int', start: token.start, end: token.end, token };
    }
    if (peek().type === 'string') {
      const token = advance();
      const isCharacter = token.lexeme[0] === "'";
      return { kind: 'Literal', value: isCharacter ? decodeCharacter(token.lexeme.slice(1, -1)) : token.lexeme.slice(1, -1), dataType: isCharacter ? 'char' : 'string', start: token.start, end: token.end, token };
    }
    if (peek().type === 'identifier') {
      const token = advance();
      let node = { kind: 'Identifier', name: token.lexeme, start: token.start, end: token.end, token };
      if (match('++', '--')) node = { kind: 'UnaryExpression', operator: previous().lexeme, argument: node, prefix: false, start: node.start, end: previous().end, token: previous() };
      return node;
    }
    throw new ParseError('Expected an expression.', peek());
  }

  const body = [];
  while (!atEnd()) {
    try { body.push(declarationOrStatement()); }
    catch (error) {
      if (!(error instanceof ParseError)) throw error;
      diagnostics.push(diagnostic(error.message, error.token, 'Syntax Analysis'));
      synchronize();
    }
  }
  return { ast: { kind: 'Program', body, start: 0, end: peek().end }, diagnostics };
}
