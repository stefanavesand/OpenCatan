import { validateGame, sameRevision } from './game.js';
export class ConflictError extends Error {}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('spelhyllan', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Stäng andra fönster med appen och försök igen.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
export async function loadGame() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction('sessions', 'readonly'); } catch (error) { db.close(); reject(error); return; }
    const request = tx.objectStore('sessions').get('current');
    tx.oncomplete = () => {
      db.close();
      try { resolve(request.result === undefined ? null : validateGame(request.result)); } catch (error) { reject(error); }
    };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Sparningen kunde inte läsas.')); };
  });
}
/** Compare and write inside one transaction. A second tab cannot overwrite a
 * move it has not seen. Resolve only after the transaction has committed. */
export async function saveGame(game, expected) {
  const valid = validateGame(game);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let tx;
    try { tx = db.transaction('sessions', 'readwrite'); } catch (error) { db.close(); reject(error); return; }
    const store = tx.objectStore('sessions');
    const request = store.get('current');
    let failure;
    request.onsuccess = () => {
      try {
        const actual = request.result === undefined ? null : validateGame(request.result);
        if (!sameRevision(expected, actual)) throw new ConflictError('Partiet har ändrats i ett annat fönster. Den senaste sparningen har lästs in.');
        if (actual && valid.id === actual.id && (valid.revision !== actual.revision + 1 || actual.moves.some((cell, i) => valid.moves[i] !== cell))) throw new Error('Sparningen måste lägga till exakt ett drag.');
        store.put(valid, 'current');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(valid); };
    tx.onabort = () => { db.close(); reject(failure || tx.error || new Error('Partiet kunde inte sparas.')); };
  });
}
