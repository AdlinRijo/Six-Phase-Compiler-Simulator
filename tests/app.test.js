import { describe, expect, it } from 'vitest';

describe('Six-Phase Compiler Simulator workbench', () => {
  it('mounts the editor, analyzes the starter source, and executes two-page phase navigation', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.Range.prototype.getClientRects ??= () => [];
    window.Range.prototype.getBoundingClientRect ??= () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    await import('../src/main.js');

    // Branding & Header
    expect(document.querySelector('.brand')?.getAttribute('aria-label')).toContain('Six-Phase-Compiler-Simulator');
    expect(document.querySelector('.brand-name').textContent).toContain('Six-Phase-Compiler-Simulator');
    expect(document.querySelector('.page-header h1').textContent).toBe('Six-Phase-Compiler-Simulator');

    // Input Page elements
    const inputPage = document.querySelector('#input-page');
    expect(inputPage).not.toBeNull();
    const exampleCards = document.querySelectorAll('.example-card');
    expect(exampleCards.length).toBeGreaterThanOrEqual(4);
    expect(document.querySelector('#editor')).not.toBeNull();

    // Start compilation
    const startBtn = document.querySelector('[data-action="start-compilation"]');
    expect(startBtn).not.toBeNull();
    startBtn.click();

    // Results Mode
    expect(document.querySelector('#app').classList.contains('results-mode')).toBe(true);
    const phaseTabs = document.querySelectorAll('.phase-tab');
    expect(phaseTabs).toHaveLength(6);
    expect(document.querySelectorAll('.phase-panel')).toHaveLength(6);

    // Active phase panel has content
    expect(document.querySelector('#body-lex .data-table')).not.toBeNull();

    // Back to editor
    const backBtn = document.querySelector('[data-action="back-to-input"]');
    expect(backBtn).not.toBeNull();
    backBtn.click();
    expect(document.querySelector('#app').classList.contains('results-mode')).toBe(false);
  });
});
