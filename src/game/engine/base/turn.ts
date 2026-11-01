import type { GameAction, HexCoord, ResourceType } from '@/types';
import type { SessionView } from '@/session/protocol';
import { getHexVertices, vertexKey } from '@/utils/hex';
import { RESOURCES } from './economy';
import { score, updateScores } from './scoring';

const TERRAIN: Partial<Record<string, ResourceType>> = { hills: 'brick', forest: 'lumber', mountains: 'ore', fields: 'grain', pasture: 'wool' };
type RobberState = Pick<SessionView, 'game' | 'board' | 'players'>;
export function victims(state: RobberState, hex: HexCoord, playerId: string): string[] {
  const corners = new Set(getHexVertices(hex).map(vertexKey));
  return [...new Set(state.board.buildings.filter(b => b.playerId !== playerId && corners.has(vertexKey(b.vertex)))
    .map(b => b.playerId))].filter(id => {
      const player = state.players.players.find(p => p.id === id)!;
      return (player.resourceCount ?? RESOURCES.reduce((n, r) => n + player.resources[r], 0)) > 0;
    });
}
export function robberPlacements(state: RobberState, playerId: string): HexCoord[] {
  return state.board.tiles.filter(tile => {
    if (tile.terrain === 'water' || (tile.coord.q === state.board.robberLocation.q && tile.coord.r === state.board.robberLocation.r)) return false;
    if (!state.game.settings.friendlyRobber) return true;
    const corners = new Set(getHexVertices(tile.coord).map(vertexKey));
    return !state.board.buildings.some(b => b.playerId !== playerId && corners.has(vertexKey(b.vertex)) && score(state, b.playerId) <= 2);
  }).map(tile => tile.coord);
}
export type TurnResult = { success: true; state: SessionView } | { success: false; error: string };
export function isTurnAction(action: GameAction): boolean {
  return ['ROLL_DICE', 'DISCARD_RESOURCES', 'MOVE_ROBBER', 'STEAL_RESOURCE', 'SKIP_STEAL'].includes(action.type);
}
/** Entropy is supplied by the host; network clients can never choose dice or a
 * stolen card. No RNG/time/UI/storage calls are made by this module. */
export function applyTurn(input: SessionView, action: GameAction, playerId: string,
  randomInt: (max: number) => number): TurnResult {
  const fail = (error: string): TurnResult => ({ success: false, error });
  const player = input.players.players.find(p => p.id === playerId);
  if (!player) return fail('Unknown player');
  if (action.type !== 'DISCARD_RESOURCES' && playerId !== input.game.currentPlayerId) return fail('Not your turn');
  const state = structuredClone(input);
  const actor = state.players.players.find(p => p.id === playerId)!;
  const afterRobber = () => state.game.lastRoll ? 'main' as const : 'roll' as const;
  switch (action.type) {
    case 'ROLL_DICE': {
      if (input.game.phase !== 'roll' || input.game.lastRoll) return fail('Cannot roll dice in this phase');
      const die1 = randomInt(6) + 1, die2 = randomInt(6) + 1;
      state.game.lastRoll = { die1, die2, total: die1 + die2 };
      if (die1 + die2 === 7) {
        state.game.pendingDiscard = state.players.players.filter(p => RESOURCES.reduce((sum, r) => sum + p.resources[r], 0) > state.game.settings.discardLimit).map(p => p.id);
        state.game.discardAmounts = Object.fromEntries(state.game.pendingDiscard.map(id => {
          const hand = state.players.players.find(p => p.id === id)!.resources;
          return [id, Math.floor(RESOURCES.reduce((sum, r) => sum + hand[r], 0) / 2)];
        }));
        state.game.phase = state.game.pendingDiscard.length ? 'discard' : 'robber-move';
      } else {
        for (const resource of RESOURCES) {
          const payouts = new Map<string, number>();
          for (const tile of state.board.tiles) {
            if (tile.number !== die1 + die2 || TERRAIN[tile.terrain] !== resource
              || (tile.coord.q === state.board.robberLocation.q && tile.coord.r === state.board.robberLocation.r)) continue;
            const corners = new Set(getHexVertices(tile.coord).map(vertexKey));
            for (const building of state.board.buildings) if (corners.has(vertexKey(building.vertex))) {
              payouts.set(building.playerId, (payouts.get(building.playerId) ?? 0) + (building.type === 'city' ? 2 : 1));
            }
          }
          const needed = [...payouts.values()].reduce((sum, count) => sum + count, 0);
          if (needed > state.game.bank[resource] && payouts.size > 1) continue;
          for (const [id, amount] of payouts) {
            const granted = Math.min(amount, state.game.bank[resource]);
            const recipient = state.players.players.find(p => p.id === id)!;
            recipient.resources[resource] += granted;
            recipient.totalResourcesCollected += granted;
            state.game.bank[resource] -= granted;
          }
        }
        state.game.phase = 'main';
      }
      break;
    }
    case 'DISCARD_RESOURCES': {
      if (input.game.phase !== 'discard' || !input.game.pendingDiscard.includes(playerId)) return fail('You do not need to discard');
      const resources = action.resources;
      if (!resources || typeof resources !== 'object' || Object.entries(resources).some(([r, n]) => !RESOURCES.includes(r as ResourceType) || !Number.isSafeInteger(n) || n < 0)) return fail('Invalid discard resources');
      const count = RESOURCES.reduce((sum, r) => sum + (resources[r] ?? 0), 0);
      const expected = input.game.discardAmounts?.[playerId] ?? Math.floor(RESOURCES.reduce((sum, r) => sum + actor.resources[r], 0) / 2);
      if (count !== expected || RESOURCES.some(r => (resources[r] ?? 0) > actor.resources[r])) return fail(`Must discard exactly ${expected} owned cards`);
      for (const resource of RESOURCES) { actor.resources[resource] -= resources[resource] ?? 0; state.game.bank[resource] += resources[resource] ?? 0; }
      state.game.pendingDiscard = state.game.pendingDiscard.filter(id => id !== playerId);
      delete state.game.discardAmounts?.[playerId];
      if (!state.game.pendingDiscard.length) state.game.phase = 'robber-move';
      break;
    }
    case 'MOVE_ROBBER': {
      if (input.game.phase !== 'robber-move') return fail('Cannot move robber in this phase');
      const hex = action.hex;
      const tile = hex && state.board.tiles.find(t => t.coord.q === hex.q && t.coord.r === hex.r && t.terrain !== 'water');
      if (!tile || (hex.q === state.board.robberLocation.q && hex.r === state.board.robberLocation.r)) return fail('Invalid robber location');
      if (!robberPlacements(state, playerId).some(v => v.q === hex.q && v.r === hex.r)) return fail('Friendly robber protects this player');
      state.board.robberLocation = hex;
      state.board.tiles.forEach(t => { t.hasRobber = t.id === tile.id; });
      state.game.phase = victims(state, hex, playerId).length ? 'robber-steal' : afterRobber();
      break;
    }
    case 'STEAL_RESOURCE': {
      if (input.game.phase !== 'robber-steal' || !victims(input, input.board.robberLocation, playerId).includes(action.victimId)) return fail('Invalid steal target');
      const victim = state.players.players.find(p => p.id === action.victimId)!;
      const cards = RESOURCES.flatMap(r => Array<ResourceType>(victim.resources[r]).fill(r));
      const stolen = cards[randomInt(cards.length)];
      victim.resources[stolen]--;
      actor.resources[stolen]++;
      actor.timesRobbed++;
      victim.timesWasRobbed++;
      state.game.phase = afterRobber();
      break;
    }
    case 'SKIP_STEAL':
      if (input.game.phase !== 'robber-steal' || victims(input, input.board.robberLocation, playerId).length) return fail('Choose an eligible victim');
      state.game.phase = afterRobber();
      break;
    default: return fail('Unsupported turn action');
  }
  updateScores(state);
  return { success: true, state };
}
