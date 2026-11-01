import { createGame, move, position, validateGame } from './game.js';
import { ConflictError, loadGame, saveGame } from './storage.js';

let current = null;
let ready = false;
let pending = null;
const el = id => document.getElementById(id);
function route() {
  const name = location.hash === '#tre-i-rad' ? 'game' : location.hash === '#hello' ? 'hello' : 'library';
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== name;
  document.title = name === 'game' ? 'Tre i rad · Spelhyllan' : name === 'hello' ? 'Hello iPad' : 'Spelhyllan';
  el('app-home').setAttribute('aria-current', name === 'library' ? 'page' : 'false');
}
function render() {
  const state = position(current?.moves || []);
  el('game-status').textContent = !ready ? 'Läser sparat parti…' : state.winner ? `${state.winner} vann!` : state.draw ? 'Oavgjort!' : `${state.next} står på tur`;
  el('board').setAttribute('data-revision', String(current?.revision ?? 0));
  [...el('board').children].forEach((button, cell) => {
    const mark = state.board[cell];
    button.textContent = mark || '';
    button.dataset.mark = mark || '';
    button.classList.toggle('winning', state.line.includes(cell));
    button.setAttribute('aria-label', `Ruta ${cell + 1}${mark ? `, ${mark}` : ', ledig'}`);
    button.disabled = !ready || !!pending || !!mark || !!state.winner || state.draw;
  });
  const ongoing = current && current.moves.length && !state.winner && !state.draw;
  el('play-game').textContent = ongoing ? 'Fortsätt partiet' : 'Spela tre i rad';
  el('resume-note').textContent = current?.moves.length ? `${current.moves.length} drag sparade på denna enhet${ongoing ? '' : ' · avslutat parti'}` : 'Två spelare · samma iPad · utan nät';
  el('new-game').disabled = !ready || !!pending;
  el('retry-save').disabled = !!pending;
  el('export-game').disabled = !ready || !current || !!pending;
  el('restore-game').disabled = !ready || !!pending;
  el('save-status').textContent = pending ? 'Sparar…' : current ? `Sparat på denna enhet · ${current.moves.length} drag` : ready ? 'Första draget startar ett nytt parti.' : 'Spelplanen öppnas när sparningen har lästs in.';
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
    el('save-error').textContent = `${error.message} ${error instanceof ConflictError ? '' : 'Draget har inte genomförts. Försök igen när lagringen fungerar.'}`;
  } finally { pending = null; render(); }
}
export async function prepareForUpdate() {
  if (pending) { try { await pending; } catch { /* The failed move was never displayed as completed. */ } }
}
async function persistenceStatus(request = false) {
  try {
    if (!navigator.storage?.persisted) { el('persistence').textContent = 'Webbläsaren kan inte bekräfta beständig lagring. Spara gärna en kopia.'; el('persist').disabled = true; return; }
    const persisted = request && navigator.storage.persist ? await navigator.storage.persist() : await navigator.storage.persisted();
    el('persistence').textContent = persisted ? 'Beständig lagring är beviljad. Du kan ändå spara en egen kopia.' : 'Partiet sparas lokalt, men webbläsaren kan rensa lagringen. Spara gärna en kopia.';
    el('persist').disabled = persisted || !navigator.storage.persist;
  } catch { el('persistence').textContent = 'Beständig lagring kunde inte beviljas. Partiet sparas ändå lokalt.'; }
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
    const link = document.createElement('a'); link.href = url; link.download = 'tre-i-rad.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
  el('restore-game').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file || pending) return;
    try {
      if (file.size > 10000) throw new Error('Filen är för stor för ett tre-i-rad-parti.');
      const imported = validateGame(JSON.parse(await file.text()));
      // Import gets a fresh identity, so even a matching old revision cannot
      // masquerade as the current game in another tab.
      const candidate = { ...imported, id: crypto.randomUUID(), savedAt: Date.now() };
      el('import-confirm').hidden = false;
      el('confirm-import').onclick = () => { el('import-confirm').hidden = true; commit(candidate); };
    } catch (error) { el('save-error').textContent = `Kopian kunde inte läsas in. ${error.message}`; }
    finally { event.target.value = ''; }
  });
  el('cancel-import').addEventListener('click', () => { el('import-confirm').hidden = true; });
  window.addEventListener('hashchange', route);
  window.addEventListener('pageshow', () => { if (ready && !pending) refresh().catch(error => { ready = false; render(); el('save-error').textContent = error.message; }); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ready && !pending) refresh().catch(error => { ready = false; render(); el('save-error').textContent = error.message; }); });
  route(); render(); persistenceStatus();
  refresh().catch(error => { el('game-status').textContent = 'Sparningen kunde inte läsas'; el('save-error').textContent = error.message; });
}
