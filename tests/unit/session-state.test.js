import { describe, it, expect } from 'vitest';
import { initialSession, sessionEvent, canAttempt, retryAfter } from '../../pwa/hello/session-state.js';
const fail = (state, extra = {}) => sessionEvent(state, { type: 'FAIL', code: 'NETWORK_UNAVAILABLE', pending: true, retryable: true, now: 1000, jitter: 0, ...extra });
describe('session lifecycle policy', () => {
  it('keeps uncertain command separate from connection and resolves through a receipt', () => {
    let state = sessionEvent(initialSession(), { type: 'SENDING' });
    state = fail(state);
    expect(state).toMatchObject({ connection: 'backoff', command: 'unknown' });
    state = sessionEvent(state, { type: 'SYNC' });
    expect(state.command).toBe('unknown');
    state = sessionEvent(state, { type: 'OUTCOME', accepted: true });
    state = sessionEvent(state, { type: 'READY' });
    expect(state).toMatchObject({ connection: 'ready', command: 'accepted', failures: 0, retryAt: 0 });
  });
  it('respects Retry-After even for manual attempts and after a disconnect', () => {
    let state = fail(initialSession(), { code: 'RATE_LIMITED', retryAfterMs: 20000 });
    expect(state.retryAt).toBe(21000);
    expect(canAttempt(state, 20999, true)).toBe(false);
    state = sessionEvent(state, { type: 'DISCONNECT', pending: true });
    expect(canAttempt(state, 20999, true)).toBe(false);
    expect(canAttempt(state, 21000)).toBe(true);
  });
  it('backs off exponentially with bounded base and supplied jitter', () => {
    let state = initialSession();
    const waits = [];
    for (let n = 0; n < 10; n++) { state = fail(state, { jitter: 1 }); waits.push(state.retryAt - 1000); }
    expect(waits.slice(0, 3)).toEqual([1250, 2500, 5000]);
    expect(waits.at(-1)).toBe(75000);
  });
  it.each(['AUTH_REQUIRED', 'FORBIDDEN', 'UNSUPPORTED_VERSION', 'STORAGE_FAILURE', 'PROTOCOL_ERROR', 'SESSION_UNAVAILABLE'])('does not automatically retry a blocked %s', code => {
    let state = fail(initialSession(), { code, retryable: false });
    expect(canAttempt(state, 1000000)).toBe(false);
    state = sessionEvent(state, { type: 'DISCONNECT', pending: true });
    expect(canAttempt(state, 1000000)).toBe(false);
    expect(canAttempt(state, 1000000, true)).toBe(true);
  });
  it('distinguishes an unsent command from uncertain server outcome', () => {
    const sending = sessionEvent(initialSession(), { type: 'SENDING' });
    expect(fail(sending, { code: 'STORAGE_FAILURE', retryable: false, pending: false }).command).toBe('not-sent');
    expect(fail(sending, { code: 'STORAGE_FAILURE', retryable: false, pending: true }).command).toBe('unknown');
  });
  it('retains a rejection when the current view synchronizes', () => {
    const rejected = sessionEvent(initialSession(), { type: 'OUTCOME', accepted: false });
    expect(sessionEvent(rejected, { type: 'READY' }).command).toBe('rejected');
  });
  it('parses seconds, HTTP dates, malformed and past Retry-After headers', () => {
    const now = Date.parse('2026-11-01T12:00:00Z');
    expect(retryAfter('20', now)).toBe(20000);
    expect(retryAfter('Sun, 01 Nov 2026 12:01:00 GMT', now)).toBe(60000);
    expect(retryAfter('Sun, 01 Nov 2026 11:59:00 GMT', now)).toBe(0);
    expect(retryAfter('invalid', now)).toBe(0);
    expect(retryAfter(null, now)).toBe(0);
  });
});
