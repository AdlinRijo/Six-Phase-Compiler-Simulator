# Six-Phase-Compiler-Simulator

Six-Phase-Compiler-Simulator is a browser-based, educational compiler studio for a documented C-like language subset. The compiler core is written in vanilla JavaScript and is independent of the CodeMirror editor, SVG visualizations, and Anime.js playback.

## Run locally

```sh
npm install
npm run dev
```

Create an optimized static bundle with `npm run build`, and run the compiler unit tests with `npm test`. Use the Vite development server or serve the generated `dist/` directory from a static web server; opening `index.html` directly is not supported for the bundled ES modules.

Use Node.js 20 or newer with npm.

Dependencies are installed from npm and bundled into the local Vite output. The app does not require a backend, external AI service, or runtime font/CDN requests.

## Language subset

The scanner recognizes identifiers, keywords, integer and decimal numbers, strings and character literals, operators, punctuation, comments, and whitespace. Whitespace and comments are retained as scanner trivia and are omitted from the parser's significant-token stream.

The parser supports scalar declarations (`int`, `float`, `char`, `bool`), blocks, assignments, prefix/postfix increment and decrement, arithmetic and comparison expressions, `if`/`else`, `while`, `for`, and `return`. It does not implement functions, pointers, arrays, structs, preprocessor directives, or native code execution. Deeply nested statements/expressions and inputs larger than 100,000 characters are rejected with diagnostics rather than being allowed to exhaust the browser stack or memory.

The six pipeline phases are lexical analysis, syntax analysis, semantic analysis, intermediate-code generation, conservative optimization, and educational pseudo-assembly generation. The bounded IR interpreter compares original and optimized behavior for valid examples; it is not a general-purpose C runtime. Pseudo-assembly is instructional output, not executable machine code.

## Project layout

- `src/compiler/` — lexer, recursive-descent/precedence parser, semantic checks, three-address IR, optimizer passes, pseudo-assembly, and bounded IR interpreter.
- `src/animations/` — playback lifecycle and synchronization for phase-result animations.
- `src/main.js` and `src/styles/` — CodeMirror editor, SVG/table views, controls, and responsive workbench.
- `tests/` — unit tests for each compiler stage and optimization pass, including original/optimized execution checks.
