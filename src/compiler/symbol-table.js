export class SymbolTable {
  constructor() {
    this.scopes = [{ id: 0, parent: null, symbols: [] }];
    this.current = this.scopes[0];
    this.nextId = 1;
  }

  enterScope() {
    const scope = { id: this.nextId++, parent: this.current, symbols: [] };
    this.scopes.push(scope);
    this.current = scope;
    return scope;
  }

  exitScope() {
    if (this.current.parent) this.current = this.current.parent;
  }

  declare(name, dataType, token, initialized = false) {
    if (this.current.symbols.some((symbol) => symbol.name === name)) return null;
    const symbol = {
      name,
      dataType,
      scopeId: this.current.id,
      line: token?.line ?? 1,
      column: token?.column ?? 1,
      start: token?.start ?? 0,
      end: token?.end ?? token?.start ?? 0,
      initialized,
      references: []
    };
    this.current.symbols.push(symbol);
    return symbol;
  }

  resolve(name) {
    for (let scope = this.current; scope; scope = scope.parent) {
      const found = scope.symbols.find((symbol) => symbol.name === name);
      if (found) return found;
    }
    return null;
  }

  get rows() {
    return this.scopes.flatMap(({ symbols }) => symbols);
  }
}
