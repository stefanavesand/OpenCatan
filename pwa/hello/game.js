// Pure rules and a versioned, replayable record. No browser or storage calls.
export const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
export function position(moves) {
  const board = Array(9).fill(null);
  moves.forEach((cell, turn) => { board[cell] = turn % 2 ? 'O' : 'X'; });
  const line = WIN_LINES.find(cells => board[cells[0]] && cells.every(cell => board[cell] === board[cells[0]]));
  return { board, winner: line ? board[line[0]] : null, line: line || [], draw: !line && moves.length === 9, next: moves.length % 2 ? 'O' : 'X' };
}
export function createGame(id, savedAt) {
  return validateGame({ schemaVersion: 1, game: 'tic-tac-toe', id, revision: 0, moves: [], savedAt });
}
export function validateGame(value) {
  if (!value || value.schemaVersion !== 1 || value.game !== 'tic-tac-toe') throw new Error('This save format is not supported by this version. No saved data has been changed.');
  if (typeof value.id !== 'string' || !value.id.length || value.id.length > 100 || !Array.isArray(value.moves) || value.moves.length > 9
    || value.revision !== value.moves.length || !Number.isSafeInteger(value.savedAt) || value.savedAt < 0 || value.savedAt > 8640000000000000) throw new Error('The save is corrupted. No saved data has been changed.');
  const checked = [];
  for (const cell of value.moves) {
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || checked.includes(cell) || position(checked).winner) throw new Error('The save contains invalid moves.');
    checked.push(cell);
  }
  return { schemaVersion: 1, game: 'tic-tac-toe', id: value.id, revision: checked.length, moves: checked, savedAt: value.savedAt };
}
export function move(game, cell, savedAt) {
  const valid = validateGame(game);
  const current = position(valid.moves);
  if (current.winner || current.draw) throw new Error('The game has ended.');
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || current.board[cell]) throw new Error('Choose an empty cell.');
  return validateGame({ ...valid, moves: [...valid.moves, cell], revision: valid.revision + 1, savedAt });
}
export function sameRevision(a, b) { return a === null ? b === null : !!b && a.id === b.id && a.revision === b.revision; }
