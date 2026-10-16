import { diagnostic } from './diagnostics.js';

const keywords = new Set(['int', 'float', 'char', 'bool', 'void', 'if', 'else', 'while', 'for', 'return', 'true', 'false']);
const twoCharacterOperators = new Set(['==', '!=', '<=', '>=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=']);
const oneCharacter = new Set('+-*/%=!<>&|'.split(''));
const punctuation = new Set('(){}[],;'.split(''));

export function tokenize(source) {
  const tokens = [];
  const diagnostics = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const advance = () => {
    const ch = source[i++];
    if (ch === '\n') { line++; column = 1; } else column++;
    return ch;
  };
  const emit = (type, start, startLine, startColumn) => tokens.push({
    type, lexeme: source.slice(start, i), start, end: i, line: startLine, column: startColumn
  });

  while (i < source.length) {
    const ch = source[i];
    const start = i;
    const startLine = line;
    const startColumn = column;

    if (/\s/.test(ch)) {
      advance();
      while (i < source.length && /\s/.test(source[i])) advance();
      emit('whitespace', start, startLine, startColumn);
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance();
      emit('comment', start, startLine, startColumn);
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      advance(); advance();
      let closed = false;
      while (i < source.length) {
        if (source[i] === '*' && source[i + 1] === '/') {
          advance(); advance(); closed = true; break;
        }
        advance();
      }
      emit('comment', start, startLine, startColumn);
      if (!closed) diagnostics.push(diagnostic('Unterminated block comment.', { start, end: i, line: startLine, column: startColumn }, 'Lexical Analysis'));
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      advance();
      while (i < source.length && /[A-Za-z0-9_]/.test(source[i])) advance();
      const word = source.slice(start, i);
      emit(keywords.has(word) ? 'keyword' : 'identifier', start, startLine, startColumn);
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(source[i + 1] ?? ''))) {
      advance();
      while (i < source.length && /\d/.test(source[i])) advance();
      if (source[i] === '.' && /\d/.test(source[i + 1] ?? '')) {
        advance();
        while (i < source.length && /\d/.test(source[i])) advance();
      }
      if (/[eE]/.test(source[i] ?? '')) {
        const exponent = i;
        advance();
        if (/[+-]/.test(source[i] ?? '')) advance();
        if (!/\d/.test(source[i] ?? '')) {
          while (i < source.length && /[A-Za-z0-9_.]/.test(source[i])) advance();
          emit('invalid', start, startLine, startColumn);
          diagnostics.push(diagnostic('Malformed numeric literal.', { start, end: i, line: startLine, column: startColumn }, 'Lexical Analysis'));
          continue;
        }
        while (i < source.length && /\d/.test(source[i])) advance();
        if (i === exponent) advance();
      }
      emit('number', start, startLine, startColumn);
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = advance();
      let escaped = false;
      let closed = false;
      while (i < source.length) {
        const current = advance();
        if (current === '\n' && !escaped) break;
        if (current === quote && !escaped) { closed = true; break; }
        if (current === '\\' && !escaped) escaped = true;
        else escaped = false;
      }
      emit('string', start, startLine, startColumn);
      if (!closed) diagnostics.push(diagnostic('Unterminated string literal.', { start, end: i, line: startLine, column: startColumn }, 'Lexical Analysis'));
      continue;
    }
    const pair = source.slice(i, i + 2);
    if (twoCharacterOperators.has(pair)) {
      advance(); advance(); emit('operator', start, startLine, startColumn); continue;
    }
    if (oneCharacter.has(ch)) { advance(); emit('operator', start, startLine, startColumn); continue; }
    if (punctuation.has(ch)) { advance(); emit('punctuation', start, startLine, startColumn); continue; }

    advance();
    emit('invalid', start, startLine, startColumn);
    diagnostics.push(diagnostic(`Unexpected character “${ch}”.`, { start, end: i, line: startLine, column: startColumn }, 'Lexical Analysis'));
  }

  tokens.push({ type: 'eof', lexeme: '', start: i, end: i, line, column });
  return { tokens, diagnostics };
}
