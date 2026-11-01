import { retryAfter } from './session-state.js';
// Managed HTTP transport. Polling is intentional: no persistent socket or iOS background work.
const URL = 'https://ppaixjqaixwnebhxfjeb.supabase.co';
const KEY = 'sb_publishable_i1LT3xs1l0Fm0ozPVlo7pA_HBfIbcoq'; // Public publishable key, not a server secret.
const AUTH = 'spelhyllan-online-auth-v1';
const STATE = 'spelhyllan-online-state-v1';
export const capabilities = Object.freeze({ onlineRequired: true, liveUpdates: 'foreground-polling', pollIntervalMs: 5000, authority: 'remote', durableCommands: true });
const locked = (name, action) => navigator.locks ? navigator.locks.request(name, action) : action();
export class OnlineError extends Error {
  constructor(message, code = 'PROTOCOL_ERROR', retryable = false, retryAfterMs = 0) { super(message); this.code = code; this.retryable = retryable; this.retryAfterMs = retryAfterMs; }
}
function read(key) {
  let value;
  try { value = localStorage.getItem(key); } catch { throw new OnlineError('The browser does not allow access to online game storage.', 'STORAGE_FAILURE'); }
  if (!value) return null;
  try { return JSON.parse(value); } catch { throw new OnlineError('Saved online data could not be read. No new player identity has been created.', 'STORAGE_FAILURE'); }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new OnlineError('The browser could not save online data. Fix storage before continuing.', 'STORAGE_FAILURE'); }
}
export function savedOnline() { return read(STATE) || { schemaVersion: 1, roomId: null, pending: null }; }
export function hasPending() { return !!savedOnline().pending; }
async function http(path, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${URL}${path}`, { method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    if (!response.ok) {
      if (response.status === 429) throw new OnlineError('The game service limit has been reached. Wait a while and try again.', 'RATE_LIMITED', true, retryAfter(response.headers.get('Retry-After'), Date.now()));
      if (response.status === 401 || response.status === 403 || (response.status === 400 && path.startsWith('/auth/'))) throw new OnlineError('The player sign-in could not be verified. Try reconnecting. Your saved credentials have been kept.', 'AUTH_REQUIRED');
      if (response.status >= 500 || response.status === 408) throw new OnlineError('The game service could not complete the request. Try again.', 'SERVER_UNAVAILABLE', true);
      throw new OnlineError('The game service could not accept the request. Your saved data has been kept.', 'PROTOCOL_ERROR');
    }
    try { return await response.json(); } catch { throw new OnlineError('The game service returned an unreadable response. The pending command has been kept.', 'PROTOCOL_ERROR'); }
  } catch (error) {
    if (error instanceof OnlineError) throw error;
    throw new OnlineError('Cannot reach the game service. Connect to the internet and try again.', 'NETWORK_UNAVAILABLE', true);
  } finally { clearTimeout(timer); }
}
async function identity() {
  return locked('spelhyllan-online-auth', async () => {
    const saved = read(AUTH);
    if (saved?.access_token && saved?.user?.id && saved.expires_at > Date.now() / 1000 + 60) return saved;
    // Never replace an existing identity on auth/network errors: that would lose room access.
    const session = saved ? await http('/auth/v1/token?grant_type=refresh_token', { refresh_token: saved.refresh_token }) : await http('/auth/v1/signup', { data: {} });
    if (!session.access_token || !session.refresh_token || !session.user?.id) throw new OnlineError('The game service did not return a valid player account.');
    session.expires_at ||= Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
    write(AUTH, session); return session;
  });
}
function validRoom(room) {
  if (!room || !/^[.XO]{9}$/.test(room.board) || !Number.isSafeInteger(room.revision) || room.revision < 0 || !['X', 'O'].includes(room.you) || !['waiting', 'playing', 'x_won', 'o_won', 'draw'].includes(room.status) || !['X', 'O'].includes(room.nextTurn) || typeof room.roomId !== 'string') throw new OnlineError('The game service returned an unknown game snapshot.');
  return room;
}
const errors = { room_full: 'The room already has two players.', room_not_found: 'The room is missing or belongs to another player.', revision_conflict: 'The game has changed. The latest board has been loaded; choose your move again.', not_started: 'Waiting for the other player.', not_your_turn: 'It is the other player’s turn.', cell_occupied: 'The cell is occupied.', game_over: 'The game has ended. Create a new room to play again.', invalid_cell: 'The cell is invalid.', bad_request: 'The request could not be understood.' };
function result(data) {
  if (data?.ok === true && data.apiVersion === 1) return { room: validRoom(data.room), duplicate: !!data.duplicate };
  if (data?.ok === false && data.error?.code) {
    if (data.error.code === 'unauthenticated') throw new OnlineError('The player sign-in could not be verified. Your saved credentials have been kept.', 'AUTH_REQUIRED');
    if (!Object.hasOwn(errors, data.error.code)) throw new OnlineError('The game service returned an unknown error code. Update the app before trying again.', 'UNSUPPORTED_VERSION');
    return { errorCode: data.error.code, error: errors[data.error.code], room: data.error.room ? validRoom(data.error.room) : null };
  }
  throw new OnlineError('The game service returned an unknown response. Update the app before trying again.', 'UNSUPPORTED_VERSION');
}
// Persist the intent before sending it. A lost response/reload reuses this exact command.
export async function command(kind, args = {}) {
  return locked('spelhyllan-online-command', async () => {
    const state = savedOnline();
    if (state.schemaVersion !== 1) throw new OnlineError('The saved data requires a different app version.', 'UNSUPPORTED_VERSION');
    if (!state.pending && !kind) return null;
    const session = await identity();
    let pending = state.pending;
    if (!pending) {
      if (!kind) return null;
      pending = { kind, args: { ...args, p_command_id: crypto.randomUUID() }, playerId: session.user.id };
      write(STATE, { ...state, pending });
    }
    if (pending.playerId !== session.user.id) throw new OnlineError('The pending move belongs to a different player identity.');
    const reply = result(await http(`/rest/v1/rpc/v1_${pending.kind}`, pending.args, session.access_token));
    // If saving the receipt fails, keep the intent; the server deduplicates the retry.
    write(STATE, { schemaVersion: 1, roomId: reply.error ? state.roomId : reply.room.roomId, pending: null });
    return reply;
  });
}
export async function getRoom() {
  const state = savedOnline();
  if (state.schemaVersion !== 1) throw new OnlineError('The saved data requires a different app version.', 'UNSUPPORTED_VERSION');
  if (!state.roomId) return null;
  const session = await identity();
  return result(await http('/rest/v1/rpc/v1_get_room', { p_room_id: state.roomId }, session.access_token));
}
