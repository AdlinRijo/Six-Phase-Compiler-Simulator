# Six-Phase-Compiler-Simulator

> An interactive, educational compiler visualization studio and pipeline simulator for a documented C-like programming language subset.

---

## 📌 Overview

**Six-Phase-Compiler-Simulator** is a web-based educational workbench that brings classical compiler design theory to life. Instead of treating compilation as a black box, it decomposes the entire translation process into six distinct sequential phases. Users can select built-in programs or write custom C-like code, run compilation, and interactively explore each phase through animated step-by-step visual representations, symbol tables, interactive Abstract Syntax Tree (AST) graphs, three-address intermediate code (3AC/IR), multi-pass optimizations, and pseudo-assembly target generation.

---

## 🛠️ Tech Stack

| Category | Technology | Description |
|---|---|---|
| **Language Runtime** | **JavaScript (ES2022 / ES Modules)** | Modern vanilla JavaScript compiler core, decoupled from any UI frameworks. |
| **Build & Dev Tooling** | **Vite 6** | Ultra-fast local dev server with Hot Module Replacement (HMR) and optimized rollup production bundling. |
| **Code Editor** | **CodeMirror 6** (`@codemirror/*`) | Extensible modern code editor with syntax highlighting, line numbers, cursor diagnostics, and tab indentation. |
| **Animation Engine** | **Anime.js 4** | High-performance animation engine orchestrating synchronized step-by-step phase visual reveals. |
| **Styling & Design System** | **Vanilla CSS3** | Custom bright, crisp design system with responsive layouts, CSS variables, glassmorphism, and accessible contrast. |
| **Visual Rendering** | **Native SVG & DOM** | Interactive pannable and zoomable AST tree visualization, structured data tables, and live badges. |
| **Testing Framework** | **Vitest 5 & JSDOM** | Fast unit and integration test suite covering lexing, parsing, semantic checking, optimization, code generation, and UI state flows. |

---

## 📂 Source Code Tree

```
Six-Phase-Compiler-Simulator/
│
├── index.html                       # Application HTML entry point & viewport meta
├── package.json                     # Project manifest, dependencies & npm scripts
├── package-lock.json                # Deterministic lockfile for npm dependencies
├── vite.config.js                   # Vite configuration (port, plugins, build options)
├── README.md                        # Complete project documentation & guide
│
├── src/                             # Application source code
│   │
│   ├── main.js                      # Application entry point, UI state, rendering, and DOM event listeners
│   ├── app-state.js                 # Global simulator state container (options, active phase, speed)
│   ├── examples.js                  # Curated C-like example programs (Arithmetic, Loops, Conditions, etc.)
│   │
│   ├── styles/
│   │   └── main.css                 # Bright modern design system, layout rules, animations, and tokens
│   │
│   ├── compiler/                    # Pure, decoupled compiler pipeline modules
│   │   ├── pipeline.js              # Central compiler driver orchestrating all 6 phases
│   │   ├── lexer.js                 # Phase 1: Lexical Analyzer (Scanner & Tokenizer)
│   │   ├── parser.js                # Phase 2: Syntax Analyzer (Recursive-Descent Parser & AST builder)
│   │   ├── semantic-analyzer.js     # Phase 3: Semantic Analyzer & Type Checker
│   │   ├── symbol-table.js          # Lexical scope hierarchy & symbol resolution table
│   │   ├── ir-generator.js          # Phase 4: Intermediate Representation (Three-Address Code) generator
│   │   ├── optimizer.js             # Phase 5: Multi-pass Machine-Independent IR Optimizer
│   │   ├── code-generator.js        # Phase 6: Target Code Generator (Virtual Register Pseudo-Assembly)
│   │   ├── interpreter.js           # Bounded virtual execution engine for original & optimized IR comparison
│   │   └── diagnostics.js           # Structured compiler diagnostic errors, warnings & positions
│   │
│   └── animations/
│       └── animation-controller.js  # Playback engine (play, pause, step-forward, step-back, speed control)
│
└── tests/                           # Automated test suites
    ├── compiler.test.js             # Comprehensive compiler pipeline & phase unit tests (26 tests)
    ├── animation-controller.test.js # Playback controller state & timing tests (2 tests)
    └── app.test.js                  # End-to-end DOM rendering and two-page UI workflow test (1 test)
```

---

## 🔬 The Six Compiler Phases Explained

The simulator implements the canonical six-phase compiler model:

```
Source Code
    │
    ▼
[ 1. Lexical Analysis ]        ──▶ Tokens Stream (Keywords, Identifiers, Literals, Operators)
    │
    ▼
[ 2. Syntax Analysis ]         ──▶ Abstract Syntax Tree (AST)
    │
    ▼
[ 3. Semantic Analysis ]       ──▶ Decorated AST + Symbol Table & Scope Resolution
    │
    ▼
[ 4. Intermediate Code (IR) ]  ──▶ Three-Address Code (3AC / Quadruples)
    │
    ▼
[ 5. Code Optimization ]       ──▶ Optimized IR (Constant Folding, Dead Code Elimination, etc.)
    │
    ▼
[ 6. Target Generation ]       ──▶ Pseudo-Assembly with Register Allocation
```

### 1. Lexical Analysis (`lexer.js`)
- **Role**: Scans raw source code character-by-character into a linear sequence of meaningful tokens.
- **Features**:
  - Classifies tokens into `keyword` (`int`, `float`, `char`, `bool`, `if`, `else`, `while`, `for`, `return`), `identifier`, `number` (integer and decimal), `operator` (`+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!`, `=`, `++`, `--`), `punctuation` (`;`, `,`, `(`, `)`, `{`, `}`), `comment`, and `whitespace`.
  - Preserves token line numbers, column offsets, start/end byte indices, and raw values.
  - Generates clear diagnostics on unknown characters or unclosed strings.

### 2. Syntax Analysis (`parser.js`)
- **Role**: Validates grammatical structure according to language grammar rules and builds an Abstract Syntax Tree (AST).
- **Features**:
  - Implements a recursive-descent parser with precedence climbing for binary expressions.
  - Produces structured AST nodes: `VariableDeclaration`, `AssignmentStatement`, `BinaryExpression`, `UnaryExpression`, `IfStatement`, `WhileStatement`, `ForStatement`, `BlockStatement`, `ReturnStatement`.
  - Visualized in the UI as an interactive, draggable vector SVG tree graph with node inspection.

### 3. Semantic Analysis (`semantic-analyzer.js` & `symbol-table.js`)
- **Role**: Enforces language rules that cannot be captured by context-free grammars alone.
- **Features**:
  - Manages a hierarchical Symbol Table with lexical scoping (parent/child scopes).
  - Checks for undeclared variables, duplicate declarations in the same scope, and type compatibility.
  - Supports implicit coercions where valid and raises errors on type mismatches (e.g., assigning a boolean to a float).
  - Tracks symbol references, data types, initialization status, and scope depths.

### 4. Intermediate Code Generation (`ir-generator.js`)
- **Role**: Translates high-level AST constructs into a linear, machine-independent Three-Address Code (3AC) format.
- **Features**:
  - Generates instructions with at most two source operands and one destination operand.
  - Synthesizes temporary variables (`t0`, `t1`, `t2`, ...) and unique jump labels (`L0`, `L1`, `L2`, ...).
  - Generates quadruples: `op`, `arg1`, `arg2`, `result` for arithmetic, assignments, conditional jumps (`if_false`), and unconditional jumps (`goto`).

### 5. Code Optimization (`optimizer.js`)
- **Role**: Improves execution efficiency and code size without altering program semantics.
- **Features**:
  - **Constant Folding**: Evaluates constant expressions at compile-time (e.g., `3 + 5 * 2` $\rightarrow$ `13`).
  - **Constant Propagation**: Tracks values of constants assigned to variables and propagates them forward.
  - **Dead Code Elimination**: Removes instructions whose results are never read or branches that can never be reached.
  - **Algebraic Simplifications**: Simplifies identities like `x + 0` $\rightarrow$ `x`, `x * 1` $\rightarrow$ `x`, and `x * 0` $\rightarrow$ `0`.
  - Side-by-side comparison displays original IR vs. optimized IR along with detailed transformation explanations.

### 6. Target Code Generation (`code-generator.js`)
- **Role**: Maps optimized IR instructions to target architecture instructions using virtual machine registers.
- **Features**:
  - Allocates registers (`R0`, `R1`, `R2`, ...) using a virtual register pool.
  - Emits instructional assembly instructions: `LOAD`, `STORE`, `ADD`, `SUB`, `MUL`, `DIV`, `CMP`, `JMP`, `JZ`, `JNZ`, `RET`.
  - Generates memory references for program variables (`[x]`, `[y]`) and register-level operations for intermediate calculations.

---

## ⚡ Execution Verification (`interpreter.js`)

To guarantee educational accuracy and demonstrate that optimizations preserve runtime behavior, the simulator includes a **Bounded IR Interpreter**:
- Executes both the unoptimized IR and the optimized IR in an isolated virtual runtime.
- Verifies that final variable states match across both representations.
- Protects against infinite loops via iteration limits (max 1,000 steps).
- Shows real-time execution traces, step counts, and runtime cycle comparisons in the UI.

---

## 🎨 User Interface & Experience Architecture

The simulator features a modern **two-page workflow**:

1. **Input & Configuration Page**:
   - Clean, bright UI with soft shadows, crisp slate text, and vibrant indigo accents.
   - **Premade Examples Grid**: Quick-select common programs (Arithmetic, Nested Loops, Conditionals, etc.).
   - **CodeMirror 6 Editor**: High-contrast light-mode code editor with syntax highlighting, line numbers, and cursor stats.
   - **Start Compilation Button**: Initiates analysis and switches to results mode.
   - **Language Guide Modal**: In-app documentation detailing supported C-like features.

2. **Sequential Phase Results Page**:
   - **6 Dedicated Phase Tabs**: Direct access to each compiler stage with individual completion badges.
   - **Automated Sequential Walkthrough**: When compilation starts, phases are animated step-by-step one after another.
   - **Playback Controls**: Play, Pause, Step-Forward, Step-Back, Restart, and adjustable animation speeds (0.5×, 1×, 1.5×, 2×).
   - **Navigation**: Click "← Back to Editor" at any time to return and tweak source code.

---

## 📝 Supported C-like Language Subset

The simulator supports a focused, documented procedural C subset:

```c
// Variable declarations & scalar types
int a = 10;
float rate = 3.14;
bool flag = true;
char letter = 'x';

// Arithmetic & boolean logic
int b = (a * 2) + 5;
bool ok = (b > 15) && !flag;

// Control flow
if (a > 5) {
    b = b + 1;
} else {
    b = b - 1;
}

// Iteration
while (a > 0) {
    a = a - 1;
}

for (int i = 0; i < 5; i = i + 1) {
    b = b + i;
}

return b;
```

> **Note**: For educational clarity, features such as pointers, arrays, structs, macros/preprocessor directives, and external dynamic linkers are excluded.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: Version 20.0.0 or higher
- **npm**: Version 10.0.0 or higher

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/Six-Phase-Compiler-Simulator.git
cd Six-Phase-Compiler-Simulator
npm install
```

### Running Development Server

Start Vite local development server:

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173`.

### Running Tests

Execute the Vitest test suite:

```bash
npm test
```

### Building for Production

Compile optimized static production bundle into `dist/`:

```bash
npm run build
```

---

## 🧪 Automated Testing

The project includes 29 automated tests verifying correctness across all levels:

1. **`tests/compiler.test.js`** (26 tests):
   - Tokenization of literals, comments, and complex operators.
   - AST generation for expressions, loops, and conditional statements.
   - Symbol table resolution and type-mismatch diagnostics.
   - IR generation, constant folding, and dead-code elimination.
   - Assembly emission and register allocation.
   - Virtual IR execution trace and runtime correctness checks.

2. **`tests/animation-controller.test.js`** (2 tests):
   - Step navigation, playback speed scaling, and finish callbacks.

3. **`tests/app.test.js`** (1 test):
   - UI mounting, branding verification, two-page navigation flow, and results inspection.

---

## 📄 License

This project is licensed under the MIT License.
