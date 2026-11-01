import { describe, expect, it } from 'vitest';
import { store } from '@/game/state/store';
import { createPlayer } from '@/types/player';
import type { DevelopmentCardType, EdgeCoord, GameAction, ResourceCounts, VertexCoord } from '@/types';
import type { SessionView } from '@/session/protocol';
import { validSetupSettlements } from '@/game/engine/setupValidation';
import { HostSession } from '@/session/hostSession';
import { projectView } from '@/session/projectView';
import { generateBeginnerBoard } from '@/utils/boardGenerator';
import { edgeKey, getEdgeVertices, getHexEdges, getHexVertices, vertexKey } from '@/utils/hex';
import { applyEconomy, COSTS, createDeck, RESOURCES } from '@/game/engine/base/economy';
import { bankRate, createBasePorts, landEdges, validRoads, validSettlements } from '@/game/engine/base/board';
import { roadLength, score, updateScores } from '@/game/engine/base/scoring';
import { applyTurn, victims } from '@/game/engine/base/turn';

let serial = 0;
const context = { id: () => `id-${++serial}`, now: () => 1000 };
const center: VertexCoord = { hex: { q: 0, r: 0 }, direction: 'N' };
function fixture(): SessionView {
  const { game, board, players, log } = structuredClone(store.getState());
  board.tiles = generateBeginnerBoard().map(t => ({ ...t, hasPirate: false, isFog: false }));
  board.robberLocation = board.tiles.find(t => t.terrain === 'desert')!.coord;
  board.buildings = [{ id: 'home', type: 'settlement', playerId: 'a', playerColor: 'red', vertex: center }];
  board.roads = [];
  players.players = [createPlayer('a', 'Alice', 'red', true), createPlayer('b', 'Bob', 'blue')];
  players.players[0].settlementsRemaining = 4;
  players.turnOrder = ['a', 'b'];
  game.phase = 'main'; game.currentPlayerId = 'a'; game.mode = 'base'; game.turn = 4;
  game.bank = { brick: 19, lumber: 19, ore: 19, grain: 19, wool: 19 };
  const state = { game, board, players, log };
  board.ports = createBasePorts(state);
  return state;
}
function fund(state: SessionView, resources: Partial<ResourceCounts>, id = 'a'): void {
  const actor = state.players.players.find(p => p.id === id)!;
  for (const resource of RESOURCES) {
    const difference = (resources[resource] ?? actor.resources[resource]) - actor.resources[resource];
    actor.resources[resource] += difference;
    state.game.bank[resource] -= difference;
  }
}
function conserved(state: SessionView): void {
  for (const resource of RESOURCES) {
    expect(state.game.bank[resource]).toBeGreaterThanOrEqual(0);
    expect(state.game.bank[resource] + state.players.players.reduce((sum, p) => sum + p.resources[resource], 0)).toBe(19);
    for (const p of state.players.players) expect(p.resources[resource]).toBeGreaterThanOrEqual(0);
  }
}
function apply(state: SessionView, action: GameAction, deck: DevelopmentCardType[] = []): SessionView {
  const result = applyEconomy(state, deck, action, state.game.currentPlayerId!, context);
  expect(result.success, 'error' in result ? result.error : '').toBe(true);
  if (!result.success) throw new Error('Rule rejected action');
  conserved(result.state);
  return result.state;
}
function reject(state: SessionView, action: GameAction, playerId = 'a', deck: DevelopmentCardType[] = []): void {
  const before = structuredClone(state);
  expect(applyEconomy(state, deck, action, playerId, context).success).toBe(false);
  expect(state).toEqual(before);
}
function addRoad(state: SessionView, edge: EdgeCoord, playerId = 'a'): void {
  state.board.roads.push({ id: context.id(), playerId, type: 'road', edge });
  state.players.players.find(p => p.id === playerId)!.roadsRemaining--;
}

describe('authoritative base-game economy', () => {
  it('charges actual costs, returns them to the bank and updates physical piece inventory', () => {
    let state = fixture();
    const edge = validRoads(state, 'a')[0];
    fund(state, { ...COSTS.road, ...COSTS.city });
    const original = structuredClone(state);
    state = apply(state, { type: 'BUILD_ROAD', edge });
    expect(state.players.players[0].roadsRemaining).toBe(14);
    expect(state.players.players[0].resources.brick).toBe(0);
    state = apply(state, { type: 'BUILD_CITY', vertex: center });
    expect(state.board.buildings[0].type).toBe('city');
    expect(state.players.players[0].citiesRemaining).toBe(3);
    expect(state.players.players[0].settlementsRemaining).toBe(5);
    expect(score(state, 'a')).toBe(2);
    expect(original.board.roads).toHaveLength(0);
    expect(original.board.buildings[0].type).toBe('settlement');
  });
  it('rejects unaffordable, occupied, detached, off-board, wrong-turn and exhausted-piece moves atomically', () => {
    const state = fixture();
    const edge = validRoads(state, 'a')[0];
    reject(state, { type: 'BUILD_ROAD', edge });
    fund(state, { brick: 4, lumber: 4, ore: 4, grain: 4, wool: 4 });
    reject(state, { type: 'BUILD_ROAD', edge }, 'b');
    reject(state, { type: 'BUILD_ROAD', edge: { hex: { q: 50, r: 50 }, direction: 'E' } });
    const disconnected = landEdges(state).find(e => !validRoads(state, 'a').some(v => edgeKey(v) === edgeKey(e)))!;
    reject(state, { type: 'BUILD_ROAD', edge: disconnected });
    addRoad(state, edge);
    reject(state, { type: 'BUILD_ROAD', edge });
    reject(state, { type: 'BUILD_SETTLEMENT', vertex: center });
    reject(state, { type: 'BUILD_CITY', vertex: { hex: { q: 2, r: 0 }, direction: 'S' } });
    state.players.players[0].citiesRemaining = 0;
    reject(state, { type: 'BUILD_CITY', vertex: center });
    state.players.players[0].roadsRemaining = 0;
    reject(state, { type: 'BUILD_ROAD', edge: validRoads(state, 'a')[0] });
  });
  it('connects settlements to roads and checks the distance rule; enemy buildings block continuation', () => {
    const state = fixture();
    const first = validRoads(state, 'a')[0]; addRoad(state, first);
    const outward = getEdgeVertices(first).find(v => vertexKey(v) !== vertexKey(center))!;
    state.board.buildings.push({ playerId: 'b', type: 'settlement', vertex: outward });
    const edgesAtEnemy = landEdges(state).filter(e => getEdgeVertices(e).some(v => vertexKey(v) === vertexKey(outward)) && edgeKey(e) !== edgeKey(first));
    for (const edge of edgesAtEnemy) expect(validRoads(state, 'a')).not.toContainEqual(edge);
    expect(validSettlements(state, 'a')).not.toContainEqual(outward);
  });
  it.each([-4, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects malformed trade amount %s', amount => {
    const state = fixture(); fund(state, { brick: 10 });
    reject(state, { type: 'BANK_TRADE', give: { resource: 'brick', amount }, receive: { resource: 'ore', amount: 1 } });
  });
  it('uses bank 4:1, generic 3:1 and owned specialized 2:1 rates; refuses missing supply', () => {
    let state = fixture(); state.board.ports = []; fund(state, { brick: 12 });
    expect(bankRate(state, 'a', 'brick')).toBe(4);
    state = apply(state, { type: 'BANK_TRADE', give: { resource: 'brick', amount: 4 }, receive: { resource: 'ore', amount: 1 } });
    state.board.ports = [{ id: 'generic', type: 'generic', ratio: 3, edge: getHexEdges(center.hex)[0], vertices: [center, center] }];
    expect(bankRate(state, 'a', 'brick')).toBe(3);
    state = apply(state, { type: 'BANK_TRADE', give: { resource: 'brick', amount: 3 }, receive: { resource: 'grain', amount: 1 } });
    state.board.ports.push({ ...state.board.ports[0], id: 'specific', type: 'brick', ratio: 2 });
    expect(bankRate(state, 'a', 'brick')).toBe(2);
    expect(bankRate(state, 'b', 'brick')).toBe(4);
    state = apply(state, { type: 'BANK_TRADE', give: { resource: 'brick', amount: 2 }, receive: { resource: 'wool', amount: 1 } });
    fund(state, { ore: 19 }, 'b');
    reject(state, { type: 'BANK_TRADE', give: { resource: 'brick', amount: 2 }, receive: { resource: 'ore', amount: 1 } });
  });
  it('places nine actual coastal ports without shared endpoints', () => {
    const state = fixture();
    expect(state.board.ports).toHaveLength(9);
    expect(new Set(state.board.ports.flatMap(p => p.vertices!.map(vertexKey))).size).toBe(18);
    const edgeCounts = state.board.tiles.flatMap(t => getHexEdges(t.coord).map(edgeKey));
    for (const port of state.board.ports) expect(edgeCounts.filter(k => k === edgeKey(port.edge))).toHaveLength(1);
  });
  it('draws all 25 cards from a fixed finite deck with exact counts and no wire leak', () => {
    let state = fixture(); let deck = createDeck(() => 0);
    expect(deck).toHaveLength(25);
    expect(Object.fromEntries(['knight', 'victoryPoint', 'roadBuilding', 'yearOfPlenty', 'monopoly'].map(type => [type, deck.filter(c => c === type).length])))
      .toEqual({ knight: 14, victoryPoint: 5, roadBuilding: 2, yearOfPlenty: 2, monopoly: 2 });
    const expected = [...deck].sort();
    while (deck.length) {
      fund(state, COSTS.development);
      const result = applyEconomy(state, deck, { type: 'BUY_DEVELOPMENT_CARD' }, 'a', context);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('buy rejected');
      state = result.state; deck = result.deck; conserved(state);
    }
    expect(state.players.players[0].developmentCards.map(c => c.type).sort()).toEqual(expected);
    expect(state.game.developmentDeckCount).toBe(0);
    reject(state, { type: 'BUY_DEVELOPMENT_CARD' });
    const view = projectView(state, 'b');
    expect(view.players.players[0].developmentCards).toEqual([]);
    expect(view.players.players[0].devCardCount).toBe(25);
    expect(view).not.toHaveProperty('developmentDeck');
  });
  it('whitelists receipt fields even if a transition returns private state', () => {
    const session = new HostSession('game');
    const result = session.execute({ protocolVersion: 1, gameId: 'game', commandId: 'c', expectedRevision: 0, playerId: 'a', action: { type: 'BUY_DEVELOPMENT_CARD' } },
      () => ({ success: true, deck: ['secret'], state: fixture() }));
    expect(Object.keys(result).sort()).toEqual(['commandId', 'gameId', 'protocolVersion', 'revision', 'success']);
  });
  it('only plays owned older cards, at most one each turn; a duplicate Year of Plenty needs two bank cards', () => {
    const state = fixture();
    const action: GameAction = { type: 'PLAY_YEAR_OF_PLENTY', resources: ['ore', 'ore'] };
    reject(state, action);
    state.players.players[0].developmentCards = [{ id: 'card', type: 'yearOfPlenty', turnBought: state.game.turn }];
    reject(state, action);
    state.players.players[0].developmentCards[0].turnBought!--;
    fund(state, { ore: 18 }, 'b'); reject(state, action);
    fund(state, { ore: 17 }, 'b');
    const next = apply(state, action);
    expect(next.players.players[0].resources.ore).toBe(2);
    next.players.players[0].developmentCards.push({ id: 'second', type: 'knight', turnBought: 0 });
    reject(next, { type: 'PLAY_KNIGHT', hex: { q: 0, r: 0 } });
    const otherTurn = apply(next, { type: 'END_TURN' });
    expect(otherTurn.game.phase).toBe('roll');
    expect(otherTurn.game.currentPlayerId).toBe('b');
  });
  it('places exactly two free Road Building roads and returns to the interrupted phase', () => {
    let state = fixture(); state.game.lastRoll = { die1: 1, die2: 2, total: 3 };
    state.players.players[0].developmentCards = [{ id: 'rb', type: 'roadBuilding', turnBought: 0 }];
    state = apply(state, { type: 'PLAY_ROAD_BUILDING' });
    expect(state.game.phase).toBe('road-building');
    for (let i = 0; i < 2; i++) state = apply(state, { type: 'BUILD_ROAD', edge: validRoads(state, 'a')[0] });
    expect(state.game.phase).toBe('main');
    expect(state.players.players[0].roadsRemaining).toBe(13);
    expect(state.players.players[0].resources.brick).toBe(0);
    reject(state, { type: 'BUILD_ROAD', edge: validRoads(state, 'a')[0] });
  });
  it('awards Largest Army at three knights and a pre-roll knight still requires a dice roll', () => {
    let state = fixture(); state.game.phase = 'roll'; state.game.lastRoll = null;
    state.players.players[0].armySize = 2;
    state.players.players[0].developmentCards = [{ id: 'knight', type: 'knight', turnBought: 0 }];
    state = apply(state, { type: 'PLAY_KNIGHT', hex: { q: 0, r: 0 } });
    expect(state.game.largestArmy).toEqual({ playerId: 'a', value: 3 });
    const hex = state.board.tiles.find(t => !victims(state, t.coord, 'a').length && (t.coord.q !== state.board.robberLocation.q || t.coord.r !== state.board.robberLocation.r))!.coord;
    const moved = applyTurn(state, { type: 'MOVE_ROBBER', hex }, 'a', () => 0);
    if (!moved.success) throw new Error('move rejected');
    expect(moved.state.game.phase).toBe('roll');
  });
  it('Monopoly transfers existing cards without creating resources or changing the bank', () => {
    const state = fixture(); fund(state, { ore: 5 }, 'b');
    state.players.players[0].developmentCards = [{ id: 'monopoly', type: 'monopoly', turnBought: 0 }];
    const next = apply(state, { type: 'PLAY_MONOPOLY', resource: 'ore' });
    expect(next.players.players[0].resources.ore).toBe(5);
    expect(next.players.players[1].resources.ore).toBe(0);
    expect(next.game.bank).toEqual(state.game.bank);
  });
  it('wins immediately on a bought hidden VP and rejects moves after game end', () => {
    const state = fixture();
    state.board.buildings = [];
    for (let i = 0; i < 5; i++) {
      const vertex = validSetupSettlements(state)[0];
      state.board.buildings.push({ id: `building-${i}`, playerId: 'a', type: i < 4 ? 'city' : 'settlement', vertex });
    }
    state.players.players[0].citiesRemaining = 0;
    state.players.players[0].settlementsRemaining = 4;
    fund(state, COSTS.development);
    const result = applyEconomy(state, ['victoryPoint'], { type: 'BUY_DEVELOPMENT_CARD' }, 'a', context);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('buy rejected');
    expect(result.state.game.phase).toBe('ended');
    expect(result.state.game.winnerId).toBe('a');
    expect(result.state.game.finalScores?.a).toBe(10);
    reject(result.state, { type: 'END_TURN' });
  });
});

describe('dice and robber validation', () => {
  it('produces one for settlements and two for cities, respects blocking and resource conservation', () => {
    const state = fixture();
    const tile = state.board.tiles.find(t => t.terrain === 'mountains')!;
    state.board.buildings = [{ playerId: 'a', type: 'city', vertex: getHexVertices(tile.coord)[0] }];
    state.game.phase = 'roll';
    const total = tile.number!;
    const dice = total > 6 ? [5, total - 7] : [0, total - 2];
    const result = applyTurn(state, { type: 'ROLL_DICE' }, 'a', () => dice.shift()!);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('roll rejected');
    expect(result.state.players.players[0].resources.ore).toBeGreaterThanOrEqual(2);
    conserved(result.state);
    const blocked = structuredClone(state); blocked.board.robberLocation = tile.coord;
    const blockedDice = total > 6 ? [5, total - 7] : [0, total - 2];
    const noIncome = applyTurn(blocked, { type: 'ROLL_DICE' }, 'a', () => blockedDice.shift()!);
    expect(noIncome.success && noIncome.state.players.players[0].resources.ore).toBe(0);
  });
  it('freezes discard requirements, rejects invented/negative resources, then permits the active player to move', () => {
    const state = fixture(); state.game.phase = 'roll'; fund(state, { ore: 8 }, 'b');
    const dice = [2, 3];
    const rolled = applyTurn(state, { type: 'ROLL_DICE' }, 'a', () => dice.shift()!);
    if (!rolled.success) throw new Error('roll rejected');
    expect(rolled.state.game.phase).toBe('discard');
    expect(rolled.state.game.discardAmounts).toEqual({ b: 4 });
    expect(applyTurn(rolled.state, { type: 'DISCARD_RESOURCES', resources: { ore: -1, grain: 5 } }, 'b', () => 0).success).toBe(false);
    const discarded = applyTurn(rolled.state, { type: 'DISCARD_RESOURCES', resources: { ore: 4 } }, 'b', () => 0);
    if (!discarded.success) throw new Error('discard rejected');
    conserved(discarded.state);
    expect(discarded.state.game.phase).toBe('robber-move');
    expect(applyTurn(discarded.state, { type: 'MOVE_ROBBER', hex: { q: 0, r: -2 } }, 'b', () => 0).success).toBe(false);
  });
  it('requires an adjacent eligible victim, transfers exactly one card and restores pre-roll phase after a knight', () => {
    let state = fixture();
    const tile = state.board.tiles.find(t => t.terrain !== 'desert')!;
    state.board.buildings.push({ playerId: 'b', type: 'settlement', vertex: getHexVertices(tile.coord)[0] });
    fund(state, { grain: 1 }, 'b'); state.game.phase = 'robber-move'; state.game.lastRoll = null;
    const moved = applyTurn(state, { type: 'MOVE_ROBBER', hex: tile.coord }, 'a', () => 0);
    if (!moved.success) throw new Error('move rejected'); state = moved.state;
    expect(victims(state, tile.coord, 'a')).toEqual(['b']);
    expect(state.game.phase).toBe('robber-steal');
    expect(applyTurn(state, { type: 'SKIP_STEAL' }, 'a', () => 0).success).toBe(false);
    expect(applyTurn(state, { type: 'STEAL_RESOURCE', victimId: 'a' }, 'a', () => 0).success).toBe(false);
    const stolen = applyTurn(state, { type: 'STEAL_RESOURCE', victimId: 'b' }, 'a', () => 0);
    if (!stolen.success) throw new Error('steal rejected');
    expect(stolen.state.players.players[0].resources.grain).toBe(1);
    expect(stolen.state.players.players[1].resources.grain).toBe(0);
    expect(stolen.state.game.phase).toBe('roll'); conserved(stolen.state);
  });
});

describe('longest road and active-player victory', () => {
  it('counts a six-edge cycle once and splits it when an opponent occupies an intersection', () => {
    const state = fixture(); state.board.buildings = [];
    for (const edge of getHexEdges({ q: 0, r: 0 })) addRoad(state, edge);
    expect(roadLength(state, 'a')).toBe(6);
    updateScores(state); expect(state.game.longestRoad?.playerId).toBe('a');
    state.board.buildings.push({ playerId: 'b', type: 'settlement', vertex: center });
    expect(roadLength(state, 'a')).toBe(6); // a broken circle still has a six-edge open trail
    const opposite: VertexCoord = { hex: { q: 0, r: 0 }, direction: 'S' };
    state.board.buildings.push({ playerId: 'b', type: 'settlement', vertex: opposite });
    expect(roadLength(state, 'a')).toBe(3);
    updateScores(state); expect(state.game.longestRoad).toBeNull();
  });
  it('does not award an inactive player a win from their hidden cards', () => {
    const state = fixture();
    for (let i = 0; i < 3; i++) state.board.buildings.push({ playerId: 'b', type: 'city', vertex: validSetupSettlements(state)[0] });
    state.players.players[1].developmentCards = Array.from({ length: 5 }, () => ({ type: 'victoryPoint' }));
    updateScores(state); expect(state.game.phase).toBe('main');
    state.game.currentPlayerId = 'b'; updateScores(state);
    expect(state.game.winnerId).toBe('b');
  });
});
