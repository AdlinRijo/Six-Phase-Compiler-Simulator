export function diagnostic(message, token, phase, severity = 'error') {
  return {
    severity,
    message,
    phase,
    line: token?.line ?? 1,
    column: token?.column ?? 1,
    start: token?.start ?? 0,
    end: token?.end ?? token?.start ?? 0
  };
}
