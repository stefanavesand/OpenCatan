import { describe, it, expect } from 'vitest';
import { createSetup, setupPosition, submitSetup, validateSetup, vertexKey, getEdgeVertices } from '@/game/engine/setupSession';
import type { SetupRecord, SetupCommand } from '@/game/engine/setupSession';
const create = (count: 3 | 4 = 4) => createSetup('game', count, Array.from({ length: count }, (_, i) => i), 1000);
function next(record: SetupRecord, commandId = `move-${record.revision}`): SetupCommand {
  const position = setupPosition(record);
  return { commandId, playerId: position.playerId!, expectedRevision: record.revision, type: position.phase as 'settlement' | 'road', position: position.phase === 'settlement' ? position.settlements[0] : position.roads[0] };
}
describe('Catan setup authority and recovery', () => {
  it.each([3, 4] as const)('completes %i-player snake setup with finite pieces and second-settlement resources', count => {
    let record = create(count); const actors: string[] = [];
    for (let i = 0; i < count * 4; i++) {
      const before = structuredClone(record), state = setupPosition(record);
      if (i % 2 === 0) actors.push(state.playerId!);
      if (i < count * 2) for (const player of state.players) expect(Object.values(player.resources).reduce((a,b) => a+b, 0)).toBe(0);
      record = submitSetup(record, next(record), 1001 + i).record;
      expect(before.revision).toBe(i); expect(record.revision).toBe(i+1);
      expect(validateSetup(JSON.parse(JSON.stringify(record)))).toEqual(record);
    }
    const expected = Array.from({ length: count }, (_, i) => `p${i+1}`);
    expect(actors).toEqual([...expected, ...expected.reverse()]);
    const final = setupPosition(record);
    expect(final.phase).toBe('complete'); expect(final.settlements).toEqual([]); expect(final.roads).toEqual([]);
    for (const player of final.players) {
      expect(final.board.buildings.filter(b => b.playerId === player.id)).toHaveLength(2);
      expect(final.board.roads.filter(b => b.playerId === player.id)).toHaveLength(2);
      expect(Object.values(player.resources).reduce((a,b) => a+b, 0)).toBeGreaterThan(0);
    }
  });
  it('enforces distance, on-board coordinates, turn, phase and road adjacency without mutating input', () => {
    const original = create(); const before = structuredClone(original), good = next(original);
    for (const bad of [{ ...good, playerId: 'p2' }, { ...good, expectedRevision: 1 }, { ...good, type: 'road' }, { ...good, position: { hex: { q: 99, r: 99 }, direction: 'N' } }]) expect(() => submitSetup(original, bad as SetupCommand, 1001)).toThrow();
    expect(original).toEqual(before);
    let record = submitSetup(original, good, 1001).record;
    const state = setupPosition(record), home = state.board.buildings[0].vertex;
    for (const road of state.roads) expect(getEdgeVertices(road).some(v => vertexKey(v) === vertexKey(home))).toBe(true);
    record = submitSetup(record, next(record), 1002).record;
    expect(setupPosition(record).settlements.map(vertexKey)).not.toContain(vertexKey(home));
    expect(() => submitSetup(record, { ...next(record), position: home }, 1003)).toThrow();
  });
  it('binds command ID to payload and returns the original receipt after later placements', () => {
    let record = create(); const command = next(record, 'stable-id');
    record = submitSetup(record, command, 1001).record; record = submitSetup(record, next(record), 1002).record;
    const duplicate = submitSetup(record, command, 1003);
    expect(duplicate.record).toEqual(record); expect(duplicate.receipt).toMatchObject({ revision: 1, duplicate: true });
    expect(() => submitSetup(record, { ...command, expectedRevision: 2 }, 1003)).toThrow('different placement');
  });
  it('rejects unknown formats, changed history, duplicate IDs and bad player orders', () => {
    const original = create();
    for (const bad of [{ ...original, schemaVersion: 99 }, { ...original, ruleVersion: 99 }, { ...original, order: [0,0,1,2] }, { ...original, savedAt: -1 }]) expect(() => validateSetup(bad)).toThrow();
    let record = submitSetup(original, next(original), 1001).record; record = submitSetup(record, next(record), 1002).record;
    const bad = structuredClone(record); bad.moves[1].commandId = bad.moves[0].commandId;
    expect(() => validateSetup(bad)).toThrow('duplicate');
    const changed = structuredClone(record); changed.moves[0].playerId = 'p3'; expect(() => validateSetup(changed)).toThrow();
  });
});
