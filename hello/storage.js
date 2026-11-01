import { validateGame, sameRevision } from './game.js';
export class ConflictError extends Error {}
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('spelhyllan', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other app windows and try again.'));
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
    tx.onabort = () => { db.close(); reject(tx.error || new Error('The saved game could not be loaded.')); };
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
        if (!sameRevision(expected, actual)) throw new ConflictError('The game changed in another window. The latest save has been loaded.');
        if (actual && valid.id === actual.id && (valid.revision !== actual.revision + 1 || actual.moves.some((cell, i) => valid.moves[i] !== cell))) throw new Error('A save must append exactly one move.');
        store.put(valid, 'current');
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(valid); };
    tx.onabort = () => { db.close(); reject(failure || tx.error || new Error('The game could not be saved.')); };
  });
}
