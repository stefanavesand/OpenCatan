import { describe, expect, it, vi } from 'vitest';
import { HostSession } from '@/session/hostSession';
import { projectView } from '@/session/projectView';
import type { Command, SessionView } from '@/session/protocol';
import { store } from '@/game/state/store';
import { createPlayer } from '@/types/player';
import { generateBeginnerBoard } from '@/utils/boardGenerator';
import { validSetupSettlements, validSetupRoads } from '@/game/engine/setupValidation';
import { getEdgeVertices, getVertexEdges, vertexKey, vertexToPixel, edgeToPixel } from '@/utils/hex';

const command = (patch: Partial<Command> = {}): Command => ({ protocolVersion: 1, gameId: 'game',
  playerId: 'player', commandId: 'command', expectedRevision: 0, action: { type: 'ROLL_DICE' }, ...patch });
function fixture(): SessionView {
  const { game, board, players, log } = structuredClone(store.getState());
  board.tiles = generateBeginnerBoard().map(t => ({ ...t, hasPirate: false, isFog: false }));
  players.players = [createPlayer('a', 'Alice', 'red', true), createPlayer('b', 'Bob', 'blue')];
  players.turnOrder = ['a', 'b'];
  return { game, board, players, log };
}

describe('host command session', () => {
  it('replays the original receipt without repeating a successful rule command', () => {
    const host = new HostSession('game');
    const apply = vi.fn(() => ({ success: true }));
    const first = host.execute(command(), apply);
    expect(host.execute(command(), apply)).toEqual(first);
    expect(host.revision).toBe(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(host.execute(command({ action: { type: 'END_TURN' } }), apply).error).toMatch(/reused/);
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it('rejects wrong game, stale revision and unsupported version before invoking rules', () => {
    const host = new HostSession('game');
    const apply = vi.fn(() => ({ success: true }));
    expect(host.execute(command({ gameId: 'other' }), apply).success).toBe(false);
    expect(host.execute(command({ expectedRevision: 2 }), apply).error).toMatch(/Stale/);
    expect(host.execute({ ...command(), protocolVersion: 99 } as unknown as Command, apply).success).toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(host.revision).toBe(0);
  });
  it('keeps a rejected receipt stable even when the revision later changes', () => {
    const host = new HostSession('game');
    const invalid = command();
    const rejected = host.execute(invalid, () => ({ success: false, error: 'Not your turn' }));
    host.execute(command({ commandId: 'another' }), () => ({ success: true }));
    expect(host.execute(invalid, () => ({ success: true }))).toEqual(rejected);
    expect(host.revision).toBe(1);
  });
});

describe('recipient views and setup rules', () => {
  it('sends the owner their hand but keeps credentials, other hands and private logs off the wire', () => {
    const state = fixture();
    state.players.players[0].sessionToken = 'credential';
    state.players.players[0].resources.ore = 4;
    state.players.players[0].developmentCards = [{ id: 'hidden', type: 'victoryPoint', isPlayed: false, turnBought: 0 }];
    state.game.players = state.players.players;
    const owner = projectView(state, 'a');
    const peer = projectView(state, 'b');
    expect(owner.players.players[0].resources.ore).toBe(4);
    expect(owner.players.players[0].developmentCards[0].id).toBe('hidden');
    expect(peer.players.players[0].resourceCount).toBe(4);
    expect(peer.players.players[0].devCardCount).toBe(1);
    expect(peer.players.players[0].developmentCards).toEqual([]);
    expect(JSON.stringify(peer)).not.toMatch(/hidden|credential/);
    expect(state.players.players[0].sessionToken).toBe('credential');
  });
  it('uses reciprocal edge/vertex adjacency for all rendered board corners', () => {
    const state = fixture();
    for (const vertex of validSetupSettlements(state)) {
      for (const edge of getVertexEdges(vertex)) {
        expect(getEdgeVertices(edge).map(vertexKey)).toContain(vertexKey(vertex));
        const points = getEdgeVertices(edge).map(v => vertexToPixel(v, 1));
        const midpoint = edgeToPixel(edge, 1);
        expect((points[0].x + points[1].x) / 2).toBeCloseTo(midpoint.x);
        expect((points[0].y + points[1].y) / 2).toBeCloseTo(midpoint.y);
      }
    }
  });
  it('blocks occupied and neighbouring settlements and restricts roads to the latest settlement', () => {
    const state = fixture();
    const vertex = validSetupSettlements(state)[0];
    state.board.buildings = [{ id: 'building', playerId: 'a', playerColor: 'red', type: 'settlement', vertex }];
    state.game.setupState = { currentPlacementIndex: 0, lastPlacedSettlement: vertex, placementsComplete: false, playerPlacements: {} };
    const available = validSetupSettlements(state).map(vertexKey);
    expect(available).not.toContain(vertexKey(vertex));
    for (const edge of getVertexEdges(vertex)) for (const endpoint of getEdgeVertices(edge)) expect(available).not.toContain(vertexKey(endpoint));
    const roads = validSetupRoads(state);
    expect(roads.length).toBeGreaterThan(0);
    state.board.roads = [{ id: 'road', playerId: 'a', playerColor: 'red', type: 'road', edge: roads[0] }];
    expect(validSetupRoads(state)).not.toContainEqual(roads[0]);
  });
});
