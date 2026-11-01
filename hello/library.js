import { createGame, move, position, validateGame } from './game.js';
import { ConflictError, loadGame, saveGame } from './storage.js';

let current = null;
let ready = false;
let pending = null;
const el = id => document.getElementById(id);
function route() {
  const name = location.hash.startsWith('#online') ? 'online' : ['#tic-tac-toe', '#tre-i-rad'].includes(location.hash) ? 'game' : location.hash === '#hello' ? 'hello' : 'library';
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== name;
  document.title = name === 'game' ? 'Tic-tac-toe · Game Shelf' : name === 'hello' ? 'Hello iPad' : 'Game Shelf';
  el('app-home').setAttribute('aria-current', name === 'library' ? 'page' : 'false');
}
function render() {
  const state = position(current?.moves || []);
  el('game-status').textContent = !ready ? 'Loading saved game…' : state.winner ? `${state.winner} wins!` : state.draw ? 'Draw!' : `${state.next} to move`;
  el('board').setAttribute('data-revision', String(current?.revision ?? 0));
  [...el('board').children].forEach((button, cell) => {
    const mark = state.board[cell];
    button.textContent = mark || '';
    button.dataset.mark = mark || '';
    button.classList.toggle('winning', state.line.includes(cell));
    button.setAttribute('aria-label', `Cell ${cell + 1}${mark ? `, ${mark}` : ', empty'}`);
    button.disabled = !ready || !!pending || !!mark || !!state.winner || state.draw;
  });
  const ongoing = current && current.moves.length && !state.winner && !state.draw;
  el('play-game').textContent = ongoing ? 'Continue game' : 'Play tic-tac-toe';
  el('resume-note').textContent = current?.moves.length ? `${current.moves.length} moves saved on this device${ongoing ? '' : ' · finished game'}` : 'Two players · one iPad · no internet needed';
  el('new-game').disabled = !ready || !!pending;
  el('retry-save').disabled = !!pending;
  el('export-game').disabled = !ready || !current || !!pending;
  el('restore-game').disabled = !ready || !!pending;
  el('save-status').textContent = pending ? 'Saving…' : current ? `Saved on this device · ${current.moves.length} moves` : ready ? 'Your first move starts a new game.' : 'The board opens once the saved game has loaded.';
}
async function refresh() {
  current = await loadGame(); ready = true; render();
}
async function commit(candidate) {
  if (!ready || pending) return;
  el('save-error').textContent = '';
  const previous = current;
  pending = saveGame(candidate, previous);
  render();
  try { current = await pending; }
  catch (error) {
    if (error instanceof ConflictError) { try { await refresh(); } catch { ready = false; } }
    el('save-error').textContent = `${error.message} ${error instanceof ConflictError ? '' : 'The move has not been made. Try again when storage is available.'}`;
  } finally { pending = null; render(); }
}
export async function prepareForUpdate() {
  if (pending) { try { await pending; } catch { /* The failed move was never displayed as completed. */ } }
}
async function persistenceStatus(request = false) {
  try {
    if (!navigator.storage?.persisted) { el('persistence').textContent = 'The browser cannot confirm persistent storage. Consider saving a backup.'; el('persist').disabled = true; return; }
    const persisted = request && navigator.storage.persist ? await navigator.storage.persist() : await navigator.storage.persisted();
    el('persistence').textContent = persisted ? 'Persistent storage is granted. You can still save your own backup.' : 'The game is saved locally, but the browser may clear storage. Consider saving a backup.';
    el('persist').disabled = persisted || !navigator.storage.persist;
  } catch { el('persistence').textContent = 'Persistent storage could not be granted. The game is still saved locally.'; }
}
export function mountLibrary() {
  for (let cell = 0; cell < 9; cell++) {
    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => {
      if (!ready || pending) return;
      try { commit(move(current || createGame(crypto.randomUUID(), Date.now()), cell, Date.now())); }
      catch (error) { el('save-error').textContent = error.message; }
    });
    el('board').append(button);
  }
  el('new-game').addEventListener('click', () => {
    if (current?.moves.length && !position(current.moves).winner && !position(current.moves).draw) el('reset-confirm').hidden = false;
    else commit(createGame(crypto.randomUUID(), Date.now()));
  });
  el('confirm-reset').addEventListener('click', () => { el('reset-confirm').hidden = true; commit(createGame(crypto.randomUUID(), Date.now())); });
  el('cancel-reset').addEventListener('click', () => { el('reset-confirm').hidden = true; });
  el('persist').addEventListener('click', () => persistenceStatus(true));
  el('retry-save').addEventListener('click', async () => {
    try { await refresh(); el('save-error').textContent = ''; }
    catch (error) { el('save-error').textContent = error.message; }
  });
  el('export-game').addEventListener('click', () => {
    if (!current || pending) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'tic-tac-toe.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  el('restore-game').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || pending) return;
    try {
      if (file.size > 10000) throw new Error('The file is too large for a tic-tac-toe game.');
      const imported = validateGame(JSON.parse(await file.text()));
      // Import gets a fresh identity, so even a matching old revision cannot
      // masquerade as the current game in another tab.
      const candidate = { ...imported, id: crypto.randomUUID(), savedAt: Date.now() };
      el('import-confirm').hidden = false;
      el('confirm-import').onclick = () => { el('import-confirm').hidden = true; commit(candidate); };
    } catch (error) { el('save-error').textContent = `The backup could not be restored. ${error.message}`; }
    finally { event.target.value = ''; }
  });
  el('cancel-import').addEventListener('click', () => { el('import-confirm').hidden = true; });
  window.addEventListener('hashchange', route);
  window.addEventListener('pageshow', () => { if (ready && !pending) refresh().catch(error => { ready = false; render(); el('save-error').textContent = error.message; }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ready && !pending) refresh().catch(error => { ready = false; render(); el('save-error').textContent = error.message; }); });
  route(); render(); persistenceStatus();
  refresh().catch(error => { el('game-status').textContent = 'The saved game could not be loaded'; el('save-error').textContent = error.message; });
}
