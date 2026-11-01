import { command, getRoom, savedOnline, hasPending, capabilities } from './online-transport.js';
import { WIN_LINES } from './game.js';
const el = id => document.getElementById(id);
let room = null, busy = null, synced = false, timer = null, replacement = null;
const active = () => location.hash.startsWith('#online') && !document.hidden;
const connected = () => navigator.onLine && synced;
function apply(reply) {
  if (!reply) return;
  if (reply.room && (!room || room.roomId !== reply.room.roomId || reply.room.revision >= room.revision)) room = reply.room;
  if (reply.error) el('online-error').textContent = reply.error;
}
function render() {
  const pending = hasPending();
  el('online-status').textContent = !room ? 'Skapa eller gå med i ett rum.' : room.status === 'waiting' ? 'Du är X · väntar på en vän' : room.status === 'draw' ? 'Oavgjort!' : room.status.endsWith('_won') ? `${room.status === 'x_won' ? 'X' : 'O'} vann!` : `Du är ${room.you} · ${room.nextTurn === room.you ? 'din tur' : 'väntar på motspelaren'}`;
  el('online-connection').textContent = !navigator.onLine ? 'Ingen nätanslutning · onlinepartiet är pausat' : busy ? 'Kontaktar speltjänsten…' : !synced && room ? 'Anslut igen för att hämta senaste spelplanen' : pending ? 'Ett kommando väntar på bekräftelse. Anslut igen.' : room ? `Sparat hos speltjänsten · uppdateras var femte sekund · steg ${room.revision}` : 'Internet krävs för onlinepartier';
  el('online-board').dataset.revision = String(room?.revision ?? 0);
  const winning = room && room.status.endsWith('_won') ? WIN_LINES.find(line => line.every(cell => room.board[cell] === (room.status === 'x_won' ? 'X' : 'O'))) || [] : [];
  [...el('online-board').children].forEach((button, cell) => {
    const mark = room?.board[cell] || '.';
    button.textContent = mark === '.' ? '' : mark;
    button.dataset.mark = mark === '.' ? '' : mark;
    button.classList.toggle('winning', winning.includes(cell));
    button.setAttribute('aria-label', `Onlineruta ${cell + 1}${mark === '.' ? ', ledig' : `, ${mark}`}`);
    button.disabled = !connected() || !!busy || pending || !room || room.status !== 'playing' || room.nextTurn !== room.you || mark !== '.';
  });
  for (const id of ['online-create', 'online-join-button']) el(id).disabled = !!busy || pending || !navigator.onLine;
  el('online-retry').disabled = !!busy || !navigator.onLine;
  el('online-share').hidden = !room;
  if (room) {
    const link = new URL(location.href); link.hash = `online?room=${room.roomId}`;
    el('online-link').value = link.href;
  }
}
function schedule() {
  clearTimeout(timer);
  if (active() && navigator.onLine && (hasPending() || (!room && savedOnline().roomId) || ['waiting', 'playing'].includes(room?.status))) timer = setTimeout(() => run(), capabilities.pollIntervalMs);
}
async function run(kind, args) {
  if (busy || !active()) return;
  clearTimeout(timer);
  if (!navigator.onLine) { synced = false; render(); return; }
  el('online-error').textContent = '';
  busy = (async () => {
    try {
      // Always resolve an older intent before reading; UI prevents starting another.
      apply(await command(kind, args));
      const latest = await getRoom(); apply(latest);
      synced = !latest?.error;
    } catch (error) { synced = false; el('online-error').textContent = error.message; }
  })();
  render();
  await busy; busy = null; render(); schedule();
}
function request(kind, args) {
  if (busy || hasPending()) return;
  if (room) { replacement = () => run(kind, args); el('online-replace').hidden = false; }
  else run(kind, args);
}
function route() {
  clearTimeout(timer);
  if (!active()) return;
  const invitation = new URLSearchParams(location.hash.split('?')[1] || '').get('room');
  if (invitation) el('online-room-input').value = invitation;
  synced = false; render(); run();
}
export async function prepareOnlineUpdate() { if (busy) await busy; }
export function mountOnline() {
  for (let cell = 0; cell < 9; cell++) {
    const button = document.createElement('button'); button.type = 'button';
    button.addEventListener('click', () => { if (room && !button.disabled) run('submit_move', { p_room_id: room.roomId, p_expected_revision: room.revision, p_cell: cell }); });
    el('online-board').append(button);
  }
  el('online-create').onclick = () => request('create_room');
  el('online-join').onsubmit = event => {
    event.preventDefault(); const id = el('online-room-input').value.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { el('online-error').textContent = 'Ange ett giltigt rums-ID från länken.'; return; }
    request('join_room', { p_room_id: id });
  };
  el('online-replace-yes').onclick = () => { el('online-replace').hidden = true; replacement?.(); replacement = null; };
  el('online-replace-no').onclick = () => { el('online-replace').hidden = true; replacement = null; };
  el('online-retry').onclick = () => run();
  el('online-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(el('online-link').value); el('online-copy-status').textContent = 'Länken är kopierad.'; }
    catch { el('online-link').select(); el('online-copy-status').textContent = 'Markera länken och kopiera den manuellt.'; }
  };
  window.addEventListener('hashchange', route);
  window.addEventListener('online', route);
  window.addEventListener('offline', () => { synced = false; clearTimeout(timer); render(); });
  document.addEventListener('visibilitychange', route);
  window.addEventListener('pageshow', route);
  try { route(); render(); } catch (error) {
    el('online-error').textContent = error.message;
    for (const id of ['online-create', 'online-join-button', 'online-retry']) el(id).disabled = true;
  }
}
