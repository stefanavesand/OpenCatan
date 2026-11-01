// Pure session lifecycle policy: no UI, browser, transport or storage dependencies.
export const initialSession = () => ({ connection: 'disconnected', command: 'idle', failures: 0, retryAt: 0, errorCode: null });
const blocked = { AUTH_REQUIRED: 'auth-blocked', FORBIDDEN: 'auth-blocked', UNSUPPORTED_VERSION: 'version-blocked', STORAGE_FAILURE: 'storage-blocked', PROTOCOL_ERROR: 'protocol-blocked', SESSION_UNAVAILABLE: 'closed' };
export function retryAfter(value, now) {
  if (!value) return 0;
  if (/^\d+(\.\d+)?$/.test(value.trim())) { const ms = Number(value) * 1000; return Number.isFinite(ms) ? Math.max(0, ms) : 0; }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}
export function canAttempt(state, now, manual = false) {
  if (now < state.retryAt) return false;
  return manual || !blocked[state.errorCode];
}
export function sessionEvent(state, event) {
  switch (event.type) {
    case 'SYNC': return { ...state, connection: 'synchronizing' };
    case 'SENDING': return { ...state, command: 'sending' };
    case 'OUTCOME': return { ...state, command: event.accepted ? 'accepted' : 'rejected' };
    case 'READY': return { ...state, connection: 'ready', failures: 0, retryAt: 0, errorCode: null };
    case 'DISCONNECT': return { ...state, connection: 'disconnected', command: event.pending ? 'unknown' : state.command };
    case 'FAIL': {
      const failures = state.failures + 1;
      const backoff = Math.min(60000, 1000 * 2 ** Math.min(failures - 1, 6)) * (1 + event.jitter * .25);
      const delay = Math.max(event.retryAfterMs || 0, backoff);
      return { ...state, connection: blocked[event.code] || (event.retryable ? 'backoff' : 'protocol-blocked'), command: event.pending ? 'unknown' : state.command === 'sending' ? 'not-sent' : state.command,
        failures, retryAt: event.retryable ? event.now + delay : 0, errorCode: event.code };
    }
    default: throw new Error('Unknown session event');
  }
}
