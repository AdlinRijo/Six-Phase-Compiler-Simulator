export const state = {
  source: '',
  result: null,
  phase: 'lex',
  tab: 'diagnostics',
  selectedExample: null,
  reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  educationalMode: true,
  speed: 1
};
