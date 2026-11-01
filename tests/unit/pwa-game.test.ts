import { describe, expect, it } from 'vitest';
import { createGame, move, position, validateGame, sameRevision, WIN_LINES } from '../../pwa/hello/game.js';
const initial = () => createGame('game-id', 1000);
function play(cells: number[]) { return cells.reduce((game, cell) => move(game, cell, 1000), initial()); }

describe('local three-in-a-row rules and recovery format', () => {
  it.each(WIN_LINES.map(line => ({ line })))('detects the winning line $line', ({ line }) => {
    const other = Array.from({ length: 9 }, (_, i) => i).filter(i => !line.includes(i));
    const game = play([line[0], other[0], line[1], other[1], line[2]]);
    expect(position(game.moves).winner).toBe('X');
    expect(position(game.moves).line).toEqual(line);
    expect(() => move(game, other[2], 1000)).toThrow('ended');
  });
  it('detects a full-board draw and an O win', () => {
    const draw = play([0, 1, 2, 4, 3, 5, 7, 6, 8]);
    expect(position(draw.moves).draw).toBe(true);
    expect(() => move(draw, 0, 1000)).toThrow('ended');
    expect(position(play([0, 3, 1, 4, 8, 5]).moves).winner).toBe('O');
  });
  it('rejects an occupied or invalid cell without changing the input', () => {
    const game = play([0]);
    const before = structuredClone(game);
    for (const cell of [0, -1, 9, 0.5, NaN]) expect(() => move(game, cell, 1000)).toThrow();
    expect(game).toEqual(before);
    const next = move(game, 4, 1001);
    expect(next.moves).toEqual([0, 4]);
    expect(game.moves).toEqual([0]);
    expect(next.revision).toBe(2);
  });
  it('validates replayed records, rejects future schemas and refuses moves after a win', () => {
    const game = play([0, 3, 1, 4, 2]);
    expect(validateGame(JSON.parse(JSON.stringify(game)))).toEqual(game);
    for (const change of [{ schemaVersion: 2 }, { revision: 3 }, { moves: [0, 0], revision: 2 },
      { moves: [0, 3, 1, 4, 2, 8], revision: 6 }, { savedAt: Infinity }, { id: '' }]) {
      expect(() => validateGame({ ...game, ...change })).toThrow();
    }
    expect(validateGame({ ...game, ignored: 'not copied' })).not.toHaveProperty('ignored');
  });
  it('compares stable game identities and revisions, including an empty store', () => {
    const game = initial();
    expect(sameRevision(null, null)).toBe(true);
    expect(sameRevision(game, null)).toBe(false);
    expect(sameRevision(game, { ...game })).toBe(true);
    expect(sameRevision(game, { ...game, id: 'another-game' })).toBe(false);
    expect(sameRevision(game, { ...game, revision: 1 })).toBe(false);
  });
});
