import { validateGame } from './game.js';
import { createRecordStore } from './record-store.js';
export { ConflictError } from './record-store.js';
// Keep the original database identity across app updates.
const store = createRecordStore('spelhyllan', validateGame);
export const loadGame = store.load;
export const saveGame = store.save;
