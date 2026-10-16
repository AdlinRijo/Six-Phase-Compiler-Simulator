import { describe, expect, it } from 'vitest';

describe('Six-Phase Compiler Simulator workbench', () => {
  it('mounts the editor, analyzes the starter source, and fills phase and result views', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    window.Range.prototype.getClientRects ??= () => [];
    window.Range.prototype.getBoundingClientRect ??= () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    await import('../src/main.js');

    expect(document.querySelector('.brand')?.getAttribute('aria-label')).toContain('Six-Phase-Compiler-Simulator');
    expect(document.querySelector('#app').classList.contains('landing-mode')).toBe(true);
    expect(document.querySelector('#demo-code').textContent).toContain('int a = 5;');
    document.querySelector('[data-action="start-demo"]').click();

    expect(document.querySelector('#compile-status').textContent).toContain('Results ready');
    expect(document.querySelector('#app').classList.contains('walkthrough-mode')).toBe(true);
    expect(document.querySelectorAll('#phase-list .phase-button')).toHaveLength(6);
    expect(document.querySelector('[data-visual="lex"] .data-table tbody tr')).not.toBeNull();
    expect(document.querySelector('#tab-content .no-diagnostics')).not.toBeNull();

    document.querySelector('[data-action="phase-next"]').click();
    expect(document.querySelector('#phase-title').textContent).toBe('Syntax Analysis');
    expect(document.querySelector('[data-visual="parse"]').hidden).toBe(false);
    expect(document.querySelector('[data-visual="parse"] .ast-svg')).not.toBeNull();
    expect(document.querySelector('#walkthrough-step-label').textContent).toBe('STAGE 02 / 06');

    for (let index = 0; index < 4; index += 1) document.querySelector('[data-action="phase-next"]').click();
    expect(document.querySelector('#phase-title').textContent).toBe('Target Generation');
    document.querySelector('[data-action="phase-next"]').click();
    expect(document.querySelector('#phase-title').textContent).toBe('Lexical Analysis');
    document.querySelector('[data-action="demo-home"]').click();
    expect(document.querySelector('#app').classList.contains('landing-mode')).toBe(true);
  });
});
