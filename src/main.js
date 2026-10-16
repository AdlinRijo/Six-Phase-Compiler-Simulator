import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { StreamLanguage } from '@codemirror/language';
import { c } from '@codemirror/legacy-modes/mode/clike';
import { compile } from './compiler/pipeline.js';
import { formatInstruction, formatOperand } from './compiler/optimizer.js';
import { AnimationController } from './animations/animation-controller.js';
import { examples, starterSource } from './examples.js';
import { state } from './app-state.js';
import './styles/main.css';

const app = document.querySelector('#app');
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const phaseConfig = [
  { id: 'lex', name: 'Lexical Analysis', icon: '⌁', short: 'Lexer' },
  { id: 'parse', name: 'Syntax Analysis', icon: '⌘', short: 'Parser' },
  { id: 'semantic', name: 'Semantic Analysis', icon: '◉', short: 'Semantic' },
  { id: 'ir', name: 'Intermediate Code', icon: '≋', short: 'IR Gen' },
  { id: 'optimize', name: 'Code Optimization', icon: '✳', short: 'Optimizer' },
  { id: 'target', name: 'Target Generation', icon: '▤', short: 'Target' }
];

let controller;
let activeSteps = [];
let toastTimer;
let selectedExampleId = examples[0]?.id ?? null;
let animationPhaseIndex = 0;
let isAnimatingPipeline = false;

// ─── Build HTML ───
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Home">
      <span class="brand-mark">6</span>
      <span class="brand-name">Six-Phase-Compiler-Simulator<b>Simulation & Architecture Studio</b></span>
    </a>
    <button class="nav-back-btn" data-action="back-to-input">← Back to Editor</button>
    <span class="topbar-spacer"></span>
    <div class="topbar-controls">
      <div class="playback">
        <button class="icon-btn" data-action="restart" title="Restart">⟲</button>
        <button class="icon-btn" data-action="step-back" title="Step back">‹</button>
        <button class="icon-btn play-main" data-action="play" title="Play">▶</button>
        <button class="icon-btn" data-action="pause" title="Pause">⏸</button>
        <button class="icon-btn" data-action="step-forward" title="Step forward">›</button>
      </div>
      <div class="speed-control">
        <span>Speed</span>
        <select id="speed-select">
          <option value="0.5">0.5×</option>
          <option value="1" selected>1×</option>
          <option value="1.5">1.5×</option>
          <option value="2">2×</option>
        </select>
      </div>
    </div>
    <span id="compile-status" class="compile-status-pill"><span class="dot"></span>Ready</span>
  </header>

  <!-- ═══ INPUT PAGE ═══ -->
  <main class="input-page" id="input-page">
    <div class="page-header">
      <div class="badge"><span class="dot"></span>COMPILER ARCHITECTURE SIMULATOR</div>
      <h1>Six-Phase-Compiler-Simulator</h1>
      <p>Select a premade program or write custom C-like code, then click Start Compilation to watch each phase execute with live step-by-step animations.</p>
    </div>

    <section class="examples-section">
      <div class="section-label">Premade Examples</div>
      <div class="examples-grid" id="examples-grid">
        ${examples.map((ex) => `
          <button class="example-card${ex.id === selectedExampleId ? ' selected' : ''}" data-example="${ex.id}">
            <span class="card-check">✓</span>
            <div class="card-title">${escapeHTML(ex.label)}</div>
            <div class="card-preview">${escapeHTML(ex.source)}</div>
          </button>
        `).join('')}
      </div>
    </section>

    <section class="editor-section">
      <div class="section-label">Source Code Editor</div>
      <div class="editor-card">
        <div class="editor-card-header">
          <div class="left">
            <span class="code-icon">&lt;/&gt;</span>
            <span class="label">Source Code</span>
            <span class="lang-pill">C</span>
          </div>
          <div class="right">
            <span id="cursor-position">Ln 1, Col 1</span>
            <span>·</span>
            <span id="source-stats">0 lines · 0 chars</span>
          </div>
        </div>
        <div class="editor-frame"><div id="editor"></div></div>
        <div class="editor-card-footer">
          <span><span class="status-square"></span> C-like subset</span>
          <span>UTF-8</span>
        </div>
      </div>
    </section>

    <div class="start-section">
      <button class="btn-start" data-action="start-compilation">
        <span class="glyph">▶</span> Start Compilation
      </button>
      <button class="btn-secondary" data-action="help">? Language Guide</button>
    </div>
    <input id="file-input" type="file" accept=".c,.h,.txt,text/plain">
  </main>

  <!-- ═══ RESULTS PAGE ═══ -->
  <div class="results-page" id="results-page">
    <div class="phase-tabs-strip" id="phase-tabs-strip">
      ${phaseConfig.map((p, i) => `
        <button class="phase-tab${i === 0 ? ' active' : ''}" data-phase="${p.id}">
          <span class="tab-num">${String(i + 1).padStart(2, '0')}</span>
          <span>${p.name}</span>
          <span class="tab-status" id="tab-status-${p.id}"></span>
        </button>
      `).join('')}
    </div>
    <div class="phase-content-area" id="phase-content-area">
      ${phaseConfig.map((p, i) => `
        <div class="phase-panel${i === 0 ? ' active' : ''}" data-panel="${p.id}" id="panel-${p.id}">
          <div class="phase-panel-header">
            <div class="phase-info">
              <span class="phase-label">PHASE ${String(i + 1).padStart(2, '0')} / 06</span>
              <span class="phase-name">${p.name}</span>
            </div>
            <div class="phase-stats" id="stats-${p.id}"></div>
          </div>
          <div class="phase-panel-body" id="body-${p.id}">
            <div class="phase-loading"><div class="spinner"></div>Waiting for compilation…</div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <div class="modal-backdrop" id="help-modal" hidden>
    <section class="help-modal">
      <button class="close-modal" data-action="close-help" aria-label="Close">×</button>
      <span class="eyebrow">LANGUAGE GUIDE</span>
      <h2>A small, documented C subset</h2>
      <p>Six-Phase-Compiler-Simulator parses declarations, blocks, assignments, arithmetic and comparison expressions,
      <code>if/else</code>, <code>while</code>, <code>for</code>, and <code>return</code>. Supported scalar types are
      <code>int</code>, <code>float</code>, <code>char</code>, and <code>bool</code>.</p>
      <p>Functions, pointers, arrays, structs, preprocessor directives, and actual native-code execution are not supported.
      The target output is educational pseudo-assembly.</p>
      <button class="btn-primary-small" data-action="close-help">Got it</button>
    </section>
  </div>
`;

// ─── Editor Setup ───
state.source = starterSource;
const editor = new EditorView({
  doc: state.source,
  extensions: [
    basicSetup,
    StreamLanguage.define(c),
    keymap.of([indentWithTab]),
    EditorView.theme({
      '&': { height: '100%', backgroundColor: '#ffffff', color: '#0f172a' },
      '.cm-scroller': { fontFamily: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace', fontSize: '13px', lineHeight: '1.85', overflow: 'auto' },
      '.cm-content': { padding: '18px 0 24px' },
      '.cm-gutters': { backgroundColor: '#f8fafc', color: '#94a3b8', borderRight: '1px solid #e2e8f0', minWidth: '48px' },
      '.cm-activeLineGutter': { color: '#4f46e5', backgroundColor: '#eef2ff' },
      '.cm-activeLine': { backgroundColor: 'rgba(79, 70, 229, 0.04)' },
      '.cm-cursor': { borderLeftColor: '#4f46e5', borderLeftWidth: '2px' },
      '.cm-selectionBackground, ::selection': { backgroundColor: 'rgba(79, 70, 229, 0.15) !important' },
      '.cm-keyword': { color: '#7c3aed', fontWeight: '600' },
      '.cm-number, .cm-atom': { color: '#b45309', fontWeight: '500' },
      '.cm-def, .cm-variable': { color: '#0284c7' },
      '.cm-string': { color: '#059669' },
      '.cm-comment': { color: '#94a3b8', fontStyle: 'italic' },
      '.cm-operator': { color: '#e11d48' }
    }),
    EditorView.updateListener.of((update) => {
      if (!update.docChanged && !update.selectionSet) return;
      state.source = update.state.doc.toString();
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      document.querySelector('#cursor-position').textContent = `Ln ${line.number}, Col ${pos - line.from + 1}`;
      document.querySelector('#source-stats').textContent = `${update.state.doc.lines} lines · ${update.state.doc.length} chars`;
    })
  ],
  parent: document.querySelector('#editor')
});
document.querySelector('#source-stats').textContent = `${editor.state.doc.lines} lines · ${editor.state.doc.length} chars`;

// ─── Animation Controller ───
controller = new AnimationController({
  reducedMotion: state.reducedMotion,
  onStep: (step, index, direction) => {
    if (!step) return;
    setActivePhaseTab(step.phase);
    const statusEl = document.querySelector('#compile-status');
    statusEl.innerHTML = `<span class="dot"></span>Animating ${index + 1} / ${activeSteps.length}`;
    statusEl.className = 'compile-status-pill running';
  },
  onFinish: () => {
    const statusEl = document.querySelector('#compile-status');
    statusEl.innerHTML = '<span class="dot"></span>Pipeline complete';
    statusEl.className = 'compile-status-pill complete';
    isAnimatingPipeline = false;
  }
});
controller.setStepMode(state.educationalMode);

// ─── Phase Tab Navigation ───
function setActivePhaseTab(phaseId) {
  state.phase = phaseId;
  document.querySelectorAll('.phase-tab').forEach((t) => t.classList.toggle('active', t.dataset.phase === phaseId));
  document.querySelectorAll('.phase-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === phaseId));
}

// ─── Example Selection ───
function selectExample(exId) {
  selectedExampleId = exId;
  const ex = examples.find((e) => e.id === exId);
  if (!ex) return;
  document.querySelectorAll('.example-card').forEach((c) => c.classList.toggle('selected', c.dataset.example === exId));
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: ex.source } });
}

// ─── Compilation ───
function runCompilation() {
  try {
    const result = compile(editor.state.doc.toString());
    state.result = result;
    renderAllPhases(result);
    return result;
  } catch (err) {
    showToast(`Compiler error: ${err.message}`);
    console.error(err);
    return null;
  }
}

// ─── Render All 6 Phase Panels ───
function renderAllPhases(result) {
  // Phase 1: Lexical Analysis
  renderLexPhase(result);
  // Phase 2: Syntax Analysis (AST)
  renderParsePhase(result);
  // Phase 3: Semantic Analysis
  renderSemanticPhase(result);
  // Phase 4: Intermediate Code
  renderIRPhase(result);
  // Phase 5: Optimization
  renderOptimizePhase(result);
  // Phase 6: Target Generation
  renderTargetPhase(result);

  // Update tab statuses
  result.phases.forEach((p) => {
    const el = document.querySelector(`#tab-status-${p.id}`);
    if (!el) return;
    el.className = `tab-status ${p.status}`;
    el.textContent = p.status === 'complete' ? '✓' : p.status === 'error' ? '!' : p.status === 'blocked' ? '–' : '';
  });

  // Compile status
  const statusEl = document.querySelector('#compile-status');
  const hasErrors = result.diagnostics.some((d) => d.severity === 'error');
  statusEl.innerHTML = `<span class="dot"></span>${hasErrors ? 'Completed with errors' : 'Analysis complete'}`;
  statusEl.className = `compile-status-pill ${hasErrors ? 'error' : 'complete'}`;

  // Collect animation steps
  activeSteps = collectSteps(result);
  controller.setSteps(activeSteps);
}

// ─── Render individual phases ───
function renderLexPhase(result) {
  const stats = document.querySelector('#stats-lex');
  const body = document.querySelector('#body-lex');
  stats.innerHTML = `<span class="phase-stat"><span class="val">${result.tokens.length}</span> tokens</span>`;
  if (!result.tokens.length) {
    body.innerHTML = `<div class="phase-empty">No tokens were produced.</div>${renderDiagnosticsBlock(result)}`;
    return;
  }
  body.innerHTML = `
    <div class="visual-caption"><span>SCANNER OUTPUT</span><b>${result.tokens.length} tokens</b><small>Lexemes retain their source coordinates.</small></div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>#</th><th>TYPE</th><th>LEXEME</th><th>LINE : COL</th></tr></thead>
        <tbody>${result.tokens.map((t, i) => `<tr class="viz-step" data-start="${t.start}" data-end="${t.end}"><td class="row-index">${String(i + 1).padStart(2, '0')}</td><td><span class="token-type type-${t.type}">${escapeHTML(t.type)}</span></td><td class="code-cell">${escapeHTML(t.lexeme)}</td><td>${t.line}:${t.column}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${renderDiagnosticsBlock(result)}`;
}

function renderParsePhase(result) {
  const stats = document.querySelector('#stats-parse');
  const body = document.querySelector('#body-parse');
  const nodeCount = result.phases.find((p) => p.id === 'parse')?.count ?? 0;
  stats.innerHTML = `<span class="phase-stat"><span class="val">${nodeCount}</span> nodes</span>`;
  body.innerHTML = renderAST(result);
}

function renderSemanticPhase(result) {
  const stats = document.querySelector('#stats-semantic');
  const body = document.querySelector('#body-semantic');
  stats.innerHTML = `<span class="phase-stat"><span class="val">${result.symbols.length}</span> declarations</span>`;
  if (!result.symbols.length) {
    body.innerHTML = `<div class="phase-empty">No declarations were found.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="visual-caption"><span>ACTIVE SCOPES</span><b>${result.symbols.length} declarations</b><small>References resolve through enclosing lexical scopes.</small></div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr><th>NAME</th><th>TYPE</th><th>SCOPE</th><th>DECLARED</th><th>REFS</th></tr></thead>
        <tbody>${result.symbols.map((s) => `<tr class="viz-step" data-start="${s.start}" data-end="${s.end}"><td class="code-cell symbol-name">${escapeHTML(s.name)}</td><td><span class="token-type type-keyword">${escapeHTML(s.dataType)}</span></td><td>scope ${s.scopeId}</td><td>${s.line}:${s.column}</td><td>${s.references.length}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    ${renderReferences(result.references)}`;
}

function renderIRPhase(result) {
  const stats = document.querySelector('#stats-ir');
  const body = document.querySelector('#body-ir');
  stats.innerHTML = `<span class="phase-stat"><span class="val">${result.ir.length}</span> instructions</span>`;
  if (!result.ir.length) {
    body.innerHTML = `<div class="phase-empty">No intermediate instructions are available.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="visual-caption"><span>THREE-ADDRESS CODE</span><b>${result.ir.length} instructions</b><small>Each instruction maps back to a source range.</small></div>
    ${renderIRList(result.ir)}`;
}

function renderOptimizePhase(result) {
  const stats = document.querySelector('#stats-optimize');
  const body = document.querySelector('#body-optimize');
  const changes = result.optimization.transformations;
  const before = result.optimization.original;
  const after = result.optimization.optimized;
  stats.innerHTML = `<span class="phase-stat"><span class="val">${changes.length}</span> transformations</span>`;
  body.innerHTML = renderOptimization(result);
}

function renderTargetPhase(result) {
  const stats = document.querySelector('#stats-target');
  const body = document.querySelector('#body-target');
  stats.innerHTML = `<span class="phase-stat"><span class="val">${result.target.length}</span> instructions</span>`;
  if (!result.target.length) {
    body.innerHTML = `<div class="phase-empty">Target code will appear after a valid compilation.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="visual-caption"><span>TARGET OUTPUT</span><b>${result.target.length} pseudo-instructions</b><small>Register and memory operations are instructional, not executable.</small></div>
    ${renderTargetTable(result.target)}`;
}

// ─── Render helpers ───
function renderDiagnosticsBlock(result) {
  if (!result.diagnostics.length) return '';
  return `<div style="padding: 12px 0;">${renderDiagnostics(result.diagnostics)}</div>`;
}

function renderDiagnostics(diagnostics) {
  if (!diagnostics.length) return `<div class="no-diagnostics"><span class="success-check">✓</span><div><b>No diagnostics</b><p>Source passed all checks.</p></div><span class="success-label">CLEAN BUILD</span></div>`;
  return `<div class="diagnostic-list">${diagnostics.map((d) => `<button class="diagnostic-row" data-start="${d.start}" data-end="${d.end}"><span class="diagnostic-severity ${d.severity}">${d.severity === 'error' ? '!' : 'i'}</span><span class="diagnostic-content"><b>${escapeHTML(d.message)}</b><small>${escapeHTML(d.phase)} <i>·</i> Line ${d.line}, column ${d.column}</small></span><span class="diagnostic-go">↗</span></button>`).join('')}</div>`;
}

function renderIRList(instructions) {
  return `<div class="instruction-list">${instructions.map((instr, i) => `<div class="instruction-row viz-step" data-start="${instr.source.start}" data-end="${instr.source.end}"><span class="row-index">${String(i + 1).padStart(2, '0')}</span><code>${escapeHTML(formatInstruction(instr))}</code><span class="instruction-op">${escapeHTML(instr.op)}</span></div>`).join('')}</div>`;
}

function renderTargetTable(code) {
  return `<div class="table-scroll"><table class="data-table assembly-table"><thead><tr><th>#</th><th>INSTRUCTION</th><th>OPERANDS</th><th>SOURCE</th></tr></thead><tbody>${code.map((line) => `<tr class="viz-step" data-start="${line.source.start}" data-end="${line.source.end}"><td class="row-index">${String(line.number).padStart(2, '0')}</td><td><span class="assembly-op">${escapeHTML(line.opcode)}</span></td><td class="code-cell">${line.operands.map((op) => `<span class="${/^R\d/.test(op) ? 'register-chip' : /\[.*\]/.test(op) ? 'memory-chip' : 'operand-chip'}">${escapeHTML(op)}</span>`).join(' ')}</td><td>${line.source.start}–${line.source.end}</td></tr>`).join('')}</tbody></table><p class="assembly-note">Educational pseudo-assembly · not native machine code</p></div>`;
}

function renderReferences(references) {
  if (!references.length) return '';
  return `<div class="reference-strip"><b>REFERENCE LINKS</b><div>${references.map((r) => `<button class="reference-link" data-start="${r.start}" data-end="${r.end}"><span>${escapeHTML(r.name)}</span><small>declared L${r.declarationLine}</small></button>`).join('')}</div></div>`;
}

function renderOptimization(result) {
  const changes = result.optimization.transformations;
  const before = result.optimization.original;
  const after = result.optimization.optimized;
  const diffs = changes.length
    ? changes.map((change) => `<div class="optimization-change viz-step" data-start="${change.source?.start ?? 0}" data-end="${change.source?.end ?? 0}"><span class="change-icon ${change.kind}">${change.kind === 'remove' || change.kind === 'unreachable' ? '−' : change.kind === 'reuse' ? '↻' : '→'}</span><div><span class="change-pass">${escapeHTML(change.pass)}</span><code>${escapeHTML(change.before ? formatInstruction(change.before) : '')}${change.after ? ` <i>→</i> ${escapeHTML(formatInstruction(change.after))}` : ''}</code><p>${escapeHTML(change.explanation)}</p></div></div>`).join('')
    : `<div class="phase-empty">No safe optimization opportunities were found.</div>`;
  return `<div class="optimization-stats"><span><b>${before.length}</b> input</span><span class="stat-arrow">→</span><span><b>${after.length}</b> optimized</span><span class="stat-saved">${Math.max(0, before.length - after.length)} removed</span></div><div class="optimization-columns"><div><h3>BEFORE <span>${before.length}</span></h3>${renderIRList(before)}</div><div><h3>AFTER <span>${after.length}</span></h3>${renderIRList(after)}</div></div><h3 class="changes-heading">TRANSFORMATIONS <span>${changes.length}</span></h3><div class="change-list">${diffs}</div>`;
}

// ─── AST ───
function astNodes(root) {
  const nodes = [];
  const edges = [];
  function visit(node, parent = null) {
    if (!node || typeof node !== 'object' || !node.kind) return;
    const id = `ast-${nodes.length}`;
    const record = { id, node, parent, depth: parent ? parent.depth + 1 : 0, children: [] };
    if (parent) { parent.children.push(record); edges.push({ parent: parent.id, child: id, record }); }
    nodes.push(record);
    for (const [key, value] of Object.entries(node)) {
      if (['token', 'start', 'end', 'value', 'dataType', 'name', 'operator', 'kind', 'prefix', 'grouped'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach((child) => visit(child, record));
      else if (value && typeof value === 'object' && value.kind) visit(value, record);
    }
  }
  visit(root);
  return { nodes, edges };
}

function renderAST(result) {
  const { nodes, edges } = astNodes(result.ast);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  const x = new Map();
  let leafPos = 0;
  const assign = (rec) => {
    if (!rec.children.length) { x.set(rec.id, 58 + leafPos++ * 126); return x.get(rec.id); }
    const ch = rec.children.map(assign);
    x.set(rec.id, (ch[0] + ch[ch.length - 1]) / 2);
    return x.get(rec.id);
  };
  if (nodes[0]) assign(nodes[0]);
  const width = Math.max(540, leafPos * 126 + 40);
  const height = (maxDepth + 1) * 82 + 38;
  const svgEdges = edges.map(({ parent, child }) => {
    const p = nodeById.get(parent);
    const c = nodeById.get(child);
    return `<path class="ast-edge" data-edge="${parent}-${child}" d="M ${x.get(parent)} ${p.depth * 82 + 34} C ${x.get(parent)} ${p.depth * 82 + 60}, ${x.get(child)} ${c.depth * 82 + 10}, ${x.get(child)} ${c.depth * 82 + 26}"/>`;
  }).join('');
  const svgNodes = nodes.map(({ id, node, depth }) => {
    const label = node.kind === 'Identifier' ? node.name : node.kind === 'Literal' ? String(node.value) : node.kind === 'BinaryExpression' ? node.operator : node.kind === 'UnaryExpression' ? `unary ${node.operator}` : node.kind;
    const subtitle = node.kind === 'Declaration' ? node.dataType : node.kind === 'BinaryExpression' ? 'expression' : node.kind === 'Identifier' ? 'identifier' : '';
    const lw = Math.min(148, Math.max(74, label.length * 7 + 26));
    return `<g class="ast-node viz-step" data-node="${id}" data-start="${node.start}" data-end="${node.end}" style="opacity:1" tabindex="0" role="button" aria-label="${escapeHTML(node.kind)} ${escapeHTML(label)}"><rect x="${x.get(id) - lw / 2}" y="${depth * 82 + 18}" width="${lw}" height="42" rx="9"/><text x="${x.get(id)}" y="${depth * 82 + (subtitle ? 36 : 44)}" text-anchor="middle">${escapeHTML(label.length > 19 ? `${label.slice(0, 17)}…` : label)}</text>${subtitle ? `<text class="node-subtitle" x="${x.get(id)}" y="${depth * 82 + 51}" text-anchor="middle">${escapeHTML(subtitle)}</text>` : ''}</g>`;
  }).join('');
  return `<div class="ast-tree"><div class="ast-toolbar"><span><i class="ast-legend-node"></i> AST node <i class="ast-legend-edge"></i> Parent-child</span><div class="ast-controls"><button data-action="ast-zoom-out" title="Zoom out">−</button><button data-action="ast-zoom-reset" title="Reset">100%</button><button data-action="ast-zoom-in" title="Zoom in">＋</button></div></div><div class="ast-viewport" title="Drag to pan"><svg class="ast-svg" width="${width}" height="${height}" data-base-width="${width}" data-base-height="${height}" data-zoom="1" viewBox="0 0 ${width} ${height}" role="img" aria-label="Abstract syntax tree">${svgEdges}${svgNodes}</svg></div><div class="ast-node-inspector">Select a node to inspect its structure.</div></div>`;
}

// ─── Animation Step Collection ───
function collectSteps(result) {
  const steps = [];
  for (const phase of phaseConfig) {
    const panel = document.querySelector(`#body-${phase.id}`);
    if (!panel) continue;
    if (phase.id === 'parse') {
      const nodes = [...panel.querySelectorAll('.ast-node')];
      for (const element of nodes) {
        const id = element.dataset.node;
        const edgeEls = [...panel.querySelectorAll(`[data-edge$="-${id}"]`)];
        steps.push(makeStep(phase.id, element,
          () => { element.style.opacity = '1'; edgeEls.forEach((e) => e.classList.add('edge-visible')); },
          () => { element.style.opacity = '0'; edgeEls.forEach((e) => e.classList.remove('edge-visible')); }));
      }
      continue;
    }
    const elements = [...panel.querySelectorAll('.viz-step')];
    for (const element of elements) {
      steps.push(makeStep(phase.id, element,
        () => { element.style.opacity = '1'; element.classList.add('step-active'); },
        () => { element.style.opacity = '0'; element.classList.remove('step-active'); }));
    }
  }
  return steps;
}

function makeStep(phase, element, reveal, reset) {
  return { phase, element, reveal, reset, start: element.dataset.start, end: element.dataset.end };
}

// ─── Animated Pipeline: animate one tab at a time ───
function startAnimatedPipeline() {
  const result = runCompilation();
  if (!result) return;

  // Switch to results page
  app.classList.add('results-mode');

  // Unlock all tabs
  document.querySelectorAll('.phase-tab').forEach((t) => t.classList.remove('locked'));

  // Start animating from phase 0
  isAnimatingPipeline = true;
  animationPhaseIndex = 0;
  animateNextPhase();
}

function animateNextPhase() {
  if (animationPhaseIndex >= phaseConfig.length) {
    isAnimatingPipeline = false;
    const statusEl = document.querySelector('#compile-status');
    statusEl.innerHTML = '<span class="dot"></span>Pipeline complete';
    statusEl.className = 'compile-status-pill complete';
    return;
  }

  const phase = phaseConfig[animationPhaseIndex];
  setActivePhaseTab(phase.id);

  // Add animating class to current tab
  const tabEl = document.querySelector(`.phase-tab[data-phase="${phase.id}"]`);
  tabEl?.classList.add('animating');

  // Get steps for this phase
  const phaseSteps = activeSteps.filter((s) => s.phase === phase.id);

  // Reset all steps for this phase
  phaseSteps.forEach((s) => s.reset?.());

  // Animate each step with a delay
  const delay = state.reducedMotion ? 20 : Math.max(100, 350 / state.speed);

  let stepIdx = 0;
  function animateStep() {
    if (stepIdx >= phaseSteps.length) {
      // Phase done, move to next
      tabEl?.classList.remove('animating');
      animationPhaseIndex++;
      // Small pause between phases
      setTimeout(animateNextPhase, state.reducedMotion ? 50 : 500);
      return;
    }

    const step = phaseSteps[stepIdx];
    step.reveal?.();
    if (step.element) {
      step.element.style.opacity = '1';
      step.element.classList.add('step-active');
    }

    const statusEl = document.querySelector('#compile-status');
    statusEl.innerHTML = `<span class="dot"></span>${phase.short}: step ${stepIdx + 1}/${phaseSteps.length}`;
    statusEl.className = 'compile-status-pill running';

    stepIdx++;
    setTimeout(animateStep, delay);
  }

  // Start animating after a brief delay to let the tab switch be visible
  setTimeout(animateStep, 200);
}

// ─── Toast ───
function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ─── Source range selection ───
function selectSourceRange(start, end) {
  const doc = editor.state.doc;
  const s = Math.max(0, Math.min(Number(start) || 0, doc.length));
  const e = Math.max(s, Math.min(Number(end) || s, doc.length));
  editor.dispatch({ selection: { anchor: s, head: e }, effects: EditorView.scrollIntoView(s, { y: 'center' }) });
  editor.focus();
}

// ─── AST Zoom ───
function setAstZoom(button, direction) {
  const svg = button.closest('.ast-tree')?.querySelector('.ast-svg');
  if (!svg) return;
  const zoom = direction === 0 ? 1 : Math.max(0.6, Math.min(2.4, Number(svg.dataset.zoom) + direction * 0.2));
  svg.dataset.zoom = String(zoom);
  svg.style.width = `${zoom * 100}%`;
  svg.style.height = `${zoom * 100}%`;
  const resetBtn = button.closest('.ast-toolbar')?.querySelector('[data-action="ast-zoom-reset"]');
  if (resetBtn) resetBtn.textContent = `${Math.round(zoom * 100)}%`;
}

// ─── AST Node Inspection ───
function inspectAstNode(element) {
  const tree = element.closest('.ast-tree');
  tree?.querySelector('.ast-node.selected')?.classList.remove('selected');
  element.classList.add('selected');
  const record = astNodes(state.result.ast).nodes.find((n) => n.id === element.dataset.node);
  if (!record) return;
  const node = record.node;
  const details = Object.entries(node)
    .filter(([k, v]) => !['token', 'start', 'end', 'kind', 'prefix', 'grouped'].includes(k) && (typeof v !== 'object' || v === null))
    .map(([k, v]) => `${k}: ${String(v)}`);
  const line = editor.state.doc.lineAt(Math.max(0, Math.min(node.start, editor.state.doc.length)));
  const inspectorEl = tree?.querySelector('.ast-node-inspector');
  if (inspectorEl) inspectorEl.textContent = `${node.kind}${details.length ? ` · ${details.join(' · ')}` : ''} · source ${line.number}:${node.start - line.from + 1}`;
}

// ─── Event Handling ───
app.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  const exCard = event.target.closest('[data-example]');
  const phaseTab = event.target.closest('.phase-tab');
  const diagnosticRow = event.target.closest('.diagnostic-row');
  const astNodeEl = event.target.closest('.ast-node');
  const reference = event.target.closest('.reference-link');
  const instruction = event.target.closest('.instruction-row[data-start], .optimization-change[data-start], .assembly-table tbody tr[data-start]');
  const tokenRow = event.target.closest('.data-table tbody tr[data-start]');

  // Example card selection
  if (exCard) { selectExample(exCard.dataset.example); return; }

  // Phase tab click
  if (phaseTab && !phaseTab.classList.contains('locked')) {
    setActivePhaseTab(phaseTab.dataset.phase);
    return;
  }

  // Diagnostic click
  if (diagnosticRow) { selectSourceRange(diagnosticRow.dataset.start, diagnosticRow.dataset.end); return; }

  // AST node click
  if (astNodeEl) {
    inspectAstNode(astNodeEl);
    selectSourceRange(astNodeEl.dataset.start, astNodeEl.dataset.end);
    return;
  }

  // Reference link
  if (reference) { selectSourceRange(reference.dataset.start, reference.dataset.end); return; }

  // Instruction or token row click
  if (instruction) { selectSourceRange(instruction.dataset.start, instruction.dataset.end); return; }
  if (tokenRow) { selectSourceRange(tokenRow.dataset.start, tokenRow.dataset.end); return; }

  if (!action) return;

  // Actions
  if (action === 'start-compilation') startAnimatedPipeline();
  if (action === 'back-to-input') { app.classList.remove('results-mode'); controller.cancel(); }
  if (action === 'play') {
    if (!state.result) return;
    controller.resume();
  }
  if (action === 'pause') controller.pause();
  if (action === 'step-forward') controller.next();
  if (action === 'step-back') controller.previous();
  if (action === 'restart') {
    if (!state.result) return;
    activeSteps.forEach((s) => s.reset?.());
    controller.setSteps(activeSteps);
    controller.setStepMode(false);
    controller.setSpeed(state.speed);
    controller.restart();
  }
  if (action === 'help') document.querySelector('#help-modal').hidden = false;
  if (action === 'close-help') document.querySelector('#help-modal').hidden = true;
  if (action === 'ast-zoom-in') setAstZoom(event.target.closest('[data-action]'), 1);
  if (action === 'ast-zoom-out') setAstZoom(event.target.closest('[data-action]'), -1);
  if (action === 'ast-zoom-reset') setAstZoom(event.target.closest('[data-action]'), 0);
});

// Speed control
document.querySelector('#speed-select').addEventListener('change', (e) => {
  state.speed = Number(e.target.value);
  controller.setSpeed(state.speed);
});

// File input
document.querySelector('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
  e.target.value = '';
  showToast(`Loaded ${file.name}`);
});

// Keyboard shortcuts
editor.dom.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    startAnimatedPipeline();
  }
});

// AST panning
let pan;
app.addEventListener('pointerdown', (event) => {
  const viewport = event.target.closest('.ast-viewport');
  if (!viewport || event.button !== 0 || event.target.closest('.ast-node')) return;
  pan = { viewport, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
  viewport.classList.add('panning');
  viewport.setPointerCapture(event.pointerId);
});
app.addEventListener('pointermove', (event) => {
  if (!pan) return;
  pan.viewport.scrollLeft = pan.left - (event.clientX - pan.x);
  pan.viewport.scrollTop = pan.top - (event.clientY - pan.y);
});
app.addEventListener('pointerup', (event) => {
  if (!pan) return;
  pan.viewport.classList.remove('panning');
  if (pan.viewport.hasPointerCapture(event.pointerId)) pan.viewport.releasePointerCapture(event.pointerId);
  pan = null;
});
app.addEventListener('keydown', (event) => {
  const node = event.target.closest('.ast-node');
  if (!node || !['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  inspectAstNode(node);
  selectSourceRange(node.dataset.start, node.dataset.end);
});
