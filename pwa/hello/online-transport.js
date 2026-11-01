// Managed HTTP transport. Polling is intentional: no persistent socket or iOS background work.
const URL = 'https://ppaixjqaixwnebhxfjeb.supabase.co';
const KEY = 'sb_publishable_i1LT3xs1l0Fm0ozPVlo7pA_HBfIbcoq'; // Public publishable key, not a server secret.
const AUTH = 'spelhyllan-online-auth-v1';
const STATE = 'spelhyllan-online-state-v1';
export const capabilities = Object.freeze({ onlineRequired: true, liveUpdates: 'foreground-polling', pollIntervalMs: 5000, authority: 'remote', durableCommands: true });
const locked = (name, action) => navigator.locks ? navigator.locks.request(name, action) : action();
export class OnlineError extends Error {
  constructor(message, retryable = false) { super(message); this.retryable = retryable; }
}
function read(key) {
  const value = localStorage.getItem(key);
  if (!value) return null;
  try { return JSON.parse(value); } catch { throw new OnlineError('Sparade onlinedata kunde inte läsas. Ingen ny spelaridentitet har skapats.'); }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new OnlineError('Webbläsaren kunde inte spara onlinedata. Åtgärda lagringen innan du fortsätter.'); }
}
export function savedOnline() { return read(STATE) || { schemaVersion: 1, roomId: null, pending: null }; }
export function hasPending() { return !!savedOnline().pending; }
async function http(path, body, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${URL}${path}`, { method: 'POST', cache: 'no-store', signal: controller.signal,
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 429) throw new OnlineError('Speltjänstens gräns är nådd. Vänta en stund och försök igen.', true);
      if (response.status === 401 || response.status === 403) throw new OnlineError('Spelarens inloggning kunde inte bekräftas. Försök ansluta igen. Dina sparade uppgifter har behållits.', true);
      throw new OnlineError('Speltjänsten kunde inte slutföra anropet. Försök igen.', true);
    }
    return data;
  } catch (error) {
    if (error instanceof OnlineError) throw error;
    throw new OnlineError('Ingen kontakt med speltjänsten. Anslut internet och försök igen.', true);
  } finally { clearTimeout(timer); }
}
async function identity() {
  return locked('spelhyllan-online-auth', async () => {
    const saved = read(AUTH);
    if (saved?.access_token && saved?.user?.id && saved.expires_at > Date.now() / 1000 + 60) return saved;
    // Never replace an existing identity on auth/network errors: that would lose room access.
    const session = saved ? await http('/auth/v1/token?grant_type=refresh_token', { refresh_token: saved.refresh_token }) : await http('/auth/v1/signup', { data: {} });
    if (!session.access_token || !session.refresh_token || !session.user?.id) throw new OnlineError('Speltjänsten gav inget giltigt spelarkonto.');
    session.expires_at ||= Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
    write(AUTH, session); return session;
  });
}
function validRoom(room) {
  if (!room || !/^[.XO]{9}$/.test(room.board) || !Number.isSafeInteger(room.revision) || room.revision < 0 || !['X', 'O'].includes(room.you) || !['waiting', 'playing', 'x_won', 'o_won', 'draw'].includes(room.status) || !['X', 'O'].includes(room.nextTurn) || typeof room.roomId !== 'string') throw new OnlineError('Speltjänsten gav en okänd spelbild.');
  return room;
}
const errors = { room_full: 'Rummet har redan två spelare.', room_not_found: 'Rummet saknas eller tillhör en annan spelare.', revision_conflict: 'Partiet har ändrats. Den senaste spelplanen har hämtats; välj ditt drag igen.', not_started: 'Väntar på den andra spelaren.', not_your_turn: 'Det är den andra spelarens tur.', cell_occupied: 'Rutan är upptagen.', game_over: 'Partiet är avslutat. Skapa ett nytt rum för att spela igen.', invalid_cell: 'Rutan är ogiltig.', bad_request: 'Anropet kunde inte tolkas.' };
function result(data) {
  if (data?.ok === true && data.apiVersion === 1) return { room: validRoom(data.room), duplicate: !!data.duplicate };
  if (data?.ok === false && data.error?.code) return { error: errors[data.error.code] || 'Draget kunde inte godkännas.', room: data.error.room ? validRoom(data.error.room) : null };
  throw new OnlineError('Speltjänsten gav ett okänt svar.', true);
}
// Persist the intent before sending it. A lost response/reload reuses this exact command.
export async function command(kind, args = {}) {
  return locked('spelhyllan-online-command', async () => {
    const state = savedOnline();
    if (state.schemaVersion !== 1) throw new OnlineError('Sparningen kräver en annan appversion.');
    if (!state.pending && !kind) return null;
    const session = await identity();
    let pending = state.pending;
    if (!pending) {
      if (!kind) return null;
      pending = { kind, args: { ...args, p_command_id: crypto.randomUUID() }, playerId: session.user.id };
      write(STATE, { ...state, pending });
    }
    if (pending.playerId !== session.user.id) throw new OnlineError('Det väntande draget tillhör en annan spelaridentitet.');
    const reply = result(await http(`/rest/v1/rpc/v1_${pending.kind}`, pending.args, session.access_token));
    // If saving the receipt fails, keep the intent; the server deduplicates the retry.
    write(STATE, { schemaVersion: 1, roomId: reply.error ? state.roomId : reply.room.roomId, pending: null });
    return reply;
  });
}
export async function getRoom() {
  const state = savedOnline();
  if (state.schemaVersion !== 1) throw new OnlineError('Sparningen kräver en annan appversion.');
  if (!state.roomId) return null;
  const session = await identity();
  return result(await http('/rest/v1/rpc/v1_get_room', { p_room_id: state.roomId }, session.access_token));
}
