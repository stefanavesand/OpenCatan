import { command, getRoom, savedOnline, hasPending, capabilities } from './online-transport.js';
import { initialSession, sessionEvent, canAttempt } from './session-state.js';
import { WIN_LINES } from './game.js';
const el = id => document.getElementById(id);
let room = null, busy = null, timer = null, replacement = null;
let session = initialSession();
const event = value => { session = sessionEvent(session, value); };
function pendingIntent() {
  try { return hasPending(); } catch (error) {
    event({ type: 'FAIL', code: error.code || 'STORAGE_FAILURE', pending: false, retryable: false, now: Date.now(), jitter: 0 });
    el('online-error').textContent = error.message; return true;
  }
}
const active = () => location.hash.startsWith('#online') && !document.hidden;
const connected = () => navigator.onLine && session.connection === 'ready';
function apply(reply) {
  if (!reply) return;
  if (reply.room && (!room || room.roomId !== reply.room.roomId || reply.room.revision >= room.revision)) room = reply.room;
  if (reply.error) el('online-error').textContent = reply.error;
}
function render() {
  const pending = pendingIntent();
  el('online-connection').dataset.state = session.connection;
  el('online-command').dataset.state = session.command;
  el('online-command').textContent = ({ idle: '', sending: 'Waiting for a response from the game service…', unknown: 'The outcome is unknown. The same command will be checked again; do not make another move yet.', accepted: 'The command has been accepted and saved by the game service.', rejected: 'The command was rejected. It has not been carried out.', 'not-sent': 'The command has not been sent.' })[session.command];
  el('online-status').textContent = !room ? 'Create or join a room.' : room.status === 'waiting' ? 'You are X · waiting for a friend' : room.status === 'draw' ? 'Draw!' : room.status.endsWith('_won') ? `${room.status === 'x_won' ? 'X' : 'O'} wins!` : `You are ${room.you} · ${room.nextTurn === room.you ? 'your turn' : 'waiting for your opponent'}`;
  el('online-connection').textContent = !navigator.onLine ? 'No network connection · online play is paused' : busy ? 'Contacting the game service…' : session.connection === 'backoff' ? 'Waiting before the next connection attempt…' : session.connection === 'auth-blocked' ? 'The connection is blocked until the player sign-in can be verified.' : session.connection === 'version-blocked' ? 'The app needs a compatible update. Saved data has been kept.' : session.connection === 'closed' ? 'The room cannot be opened with this player identity.' : !connected() && room ? 'Reconnect to load the latest board' : pending ? 'A command is awaiting confirmation. Reconnect.' : room ? `Saved by the game service · updates every five seconds · revision ${room.revision}` : 'Online games require internet access';
  el('online-board').dataset.revision = String(room?.revision ?? 0);
  const winning = room && room.status.endsWith('_won') ? WIN_LINES.find(line => line.every(cell => room.board[cell] === (room.status === 'x_won' ? 'X' : 'O'))) || [] : [];
  [...el('online-board').children].forEach((button, cell) => {
    const mark = room?.board[cell] || '.';
    button.textContent = mark === '.' ? '' : mark;
    button.dataset.mark = mark === '.' ? '' : mark;
    button.classList.toggle('winning', winning.includes(cell));
    button.setAttribute('aria-label', `Online cell ${cell + 1}${mark === '.' ? ', empty' : `, ${mark}`}`);
    button.disabled = !connected() || !!busy || pending || !room || room.status !== 'playing' || room.nextTurn !== room.you || mark !== '.';
  });
  for (const id of ['online-create', 'online-join-button']) el(id).disabled = !!busy || pending || !navigator.onLine || !canAttempt(session, Date.now(), true);
  el('online-retry').disabled = !!busy || !navigator.onLine || Date.now() < session.retryAt;
  el('online-share').hidden = !room;
  if (room) {
    const link = new URL(location.href); link.hash = `online?room=${room.roomId}`;
    el('online-link').value = link.href;
  }
}
function schedule() {
  clearTimeout(timer);
  if (!active() || !navigator.onLine || !canAttempt(session, Math.max(Date.now(), session.retryAt))) return;
  if (session.connection === 'backoff') {
    timer = setTimeout(() => run(), Math.min(2147483647, Math.max(1, session.retryAt - Date.now()))); return;
  }
  if (pendingIntent() || (!room && savedOnline().roomId) || ['waiting', 'playing'].includes(room?.status)) timer = setTimeout(() => run(), capabilities.pollIntervalMs);
}
async function run(kind, args, manual = false) {
  if (busy || !active()) return;
  clearTimeout(timer);
  if (!navigator.onLine) { event({ type: 'DISCONNECT', pending: pendingIntent() }); render(); return; }
  if (!canAttempt(session, Date.now(), manual)) { render(); schedule(); return; }
  el('online-error').textContent = '';
  event({ type: 'SYNC' });
  if (kind || pendingIntent()) event({ type: 'SENDING' });
  busy = (async () => {
    try {
      // Resolve the same stored intent before reading the current view.
      const reply = await command(kind, args); apply(reply);
      if (reply) event({ type: 'OUTCOME', accepted: !reply.error });
      const latest = await getRoom(); apply(latest);
      if (latest?.error) event({ type: 'FAIL', code: latest.errorCode === 'room_not_found' ? 'SESSION_UNAVAILABLE' : 'PROTOCOL_ERROR', pending: pendingIntent(), retryable: false, now: Date.now(), jitter: 0 });
      else event({ type: 'READY' });
    } catch (error) {
      event({ type: 'FAIL', code: error.code || 'PROTOCOL_ERROR', pending: pendingIntent(), retryable: !!error.retryable, retryAfterMs: error.retryAfterMs, now: Date.now(), jitter: Math.random() });
      el('online-error').textContent = error.message;
    }
  })();
  render();
  await busy; busy = null;
  if (!navigator.onLine || !active()) event({ type: 'DISCONNECT', pending: pendingIntent() });
  render(); schedule();
}
function request(kind, args) {
  if (busy || pendingIntent()) return;
  if (room) { replacement = () => run(kind, args, true); el('online-replace').hidden = false; }
  else run(kind, args, true);
}
function route() {
  clearTimeout(timer);
  if (!active()) { event({ type: 'DISCONNECT', pending: pendingIntent() }); render(); return; }
  const invitation = new URLSearchParams(location.hash.split('?')[1] || '').get('room');
  if (invitation) el('online-room-input').value = invitation;
  render(); run();
}
export async function prepareOnlineUpdate() { if (busy) await busy; }
export function mountOnline() {
  for (let cell = 0; cell < 9; cell++) {
    const button = document.createElement('button'); button.type = 'button';
    button.addEventListener('click', () => { if (room && !button.disabled) run('submit_move', { p_room_id: room.roomId, p_expected_revision: room.revision, p_cell: cell }, true); });
    el('online-board').append(button);
  }
  el('online-create').onclick = () => request('create_room');
  el('online-join').onsubmit = event => {
    event.preventDefault(); const id = el('online-room-input').value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { el('online-error').textContent = 'Enter a valid room ID from the link.'; return; }
    request('join_room', { p_room_id: id });
  };
  el('online-replace-yes').onclick = () => { el('online-replace').hidden = true; replacement?.(); replacement = null; };
  el('online-replace-no').onclick = () => { el('online-replace').hidden = true; replacement = null; };
  el('online-retry').onclick = () => run(undefined, undefined, true);
  el('online-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(el('online-link').value); el('online-copy-status').textContent = 'Link copied.'; }
    catch { el('online-link').select(); el('online-copy-status').textContent = 'Select the link and copy it manually.'; }
  };
  window.addEventListener('hashchange', route);
  window.addEventListener('online', route);
  window.addEventListener('offline', () => { event({ type: 'DISCONNECT', pending: pendingIntent() }); clearTimeout(timer); render(); });
  document.addEventListener('visibilitychange', route);
  window.addEventListener('pageshow', route);
  try { route(); render(); } catch (error) {
    el('online-error').textContent = error.message;
    for (const id of ['online-create', 'online-join-button', 'online-retry']) el(id).disabled = true;
  }
}
