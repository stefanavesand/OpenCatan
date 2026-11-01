import type { DevelopmentCardType, GameAction, ResourceCounts, ResourceType } from '@/types';
import { DEVELOPMENT_CARD_COUNTS } from '@/types/cards';
import type { SessionView } from '@/session/protocol';
import { edgeKey, vertexKey } from '@/utils/hex';
import { validCoordinate } from '../setupValidation';
import { bankRate, validRoads, validSettlements } from './board';
import { updateScores } from './scoring';

export const RESOURCES: ResourceType[] = ['brick', 'lumber', 'ore', 'grain', 'wool'];
export const COSTS = { road: { brick: 1, lumber: 1 }, settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 }, development: { ore: 1, grain: 1, wool: 1 } } satisfies Record<string, Partial<ResourceCounts>>;
export interface RuleContext { id: () => string; now: () => number }
export type EconomyResult = { success: true; state: SessionView; deck: DevelopmentCardType[] }
  | { success: false; error: string };

export function createDeck(randomInt: (upperExclusive: number) => number): DevelopmentCardType[] {
  const deck = Object.entries(DEVELOPMENT_CARD_COUNTS).flatMap(([type, count]) => Array<DevelopmentCardType>(count).fill(type as DevelopmentCardType));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isSafeInteger(j) || j < 0 || j > i) throw new Error('Invalid random index');
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export function isEconomyAction(action: GameAction, state: SessionView): boolean {
  if (state.game.phase.startsWith('setup-')) return false;
  return ['BUILD_ROAD', 'BUILD_SETTLEMENT', 'BUILD_CITY', 'BUY_DEVELOPMENT_CARD', 'BANK_TRADE', 'END_TURN', 'PLAY_KNIGHT', 'PLAY_ROAD_BUILDING', 'PLAY_YEAR_OF_PLENTY', 'PLAY_MONOPOLY'].includes(action.type);
}

/** Pure transition: validate first and commit a complete candidate only on success.
 * The private finite deck is passed separately and is never part of SessionView. */
export function applyEconomy(input: SessionView, deck: readonly DevelopmentCardType[], action: GameAction,
  playerId: string, context: RuleContext): EconomyResult {
  const reject = (error: string): EconomyResult => ({ success: false, error });
  const player = input.players.players.find(p => p.id === playerId);
  if (!player) return reject('Unknown player');
  if (input.game.mode !== 'base') return reject('Only base-game rules are supported');
  if (input.game.currentPlayerId !== playerId) return reject('Not your turn');
  const freeRoad = action.type === 'BUILD_ROAD' && input.game.phase === 'road-building';
  const cardType = ({ PLAY_KNIGHT: 'knight', PLAY_ROAD_BUILDING: 'roadBuilding', PLAY_YEAR_OF_PLENTY: 'yearOfPlenty', PLAY_MONOPOLY: 'monopoly' } as Record<string, DevelopmentCardType>)[action.type];
  const card = cardType ? player.developmentCards.find(c => c.type === cardType && !c.isPlayed && c.turnBought !== input.game.turn) : undefined;
  if (cardType && (!card || player.hasPlayedDevCard || input.game.devCardPlayedThisTurn)) return reject('No playable card, card bought this turn, or a card already played');
  if (input.game.phase !== 'main' && !freeRoad && !(cardType && input.game.phase === 'roll')) return reject('Action is not allowed in this phase');
  let cost: Partial<ResourceCounts> = {};
  switch (action.type) {
    case 'BUILD_ROAD':
      if (!validCoordinate(action.edge, ['NE', 'E', 'SE'])) return reject('Invalid edge');
      if (player.roadsRemaining <= 0) return reject('No roads remaining');
      if (freeRoad && input.game.roadBuildingRemaining <= 0) return reject('No free roads remaining');
      if (!validRoads(input, playerId).some(e => edgeKey(e) === edgeKey(action.edge))) return reject('Road must be empty, on land and connected to your network');
      cost = freeRoad ? {} : COSTS.road;
      break;
    case 'BUILD_SETTLEMENT':
      if (!validCoordinate(action.vertex, ['N', 'S'])) return reject('Invalid vertex');
      if (player.settlementsRemaining <= 0) return reject('No settlements remaining');
      if (!validSettlements(input, playerId).some(v => vertexKey(v) === vertexKey(action.vertex))) return reject('Settlement must be empty, separated and connected to your road');
      cost = COSTS.settlement;
      break;
    case 'BUILD_CITY':
      if (!validCoordinate(action.vertex, ['N', 'S'])) return reject('Invalid vertex');
      if (player.citiesRemaining <= 0) return reject('No cities remaining');
      if (!input.board.buildings.some(b => b.type === 'settlement' && b.playerId === playerId && vertexKey(b.vertex) === vertexKey(action.vertex))) return reject('City must upgrade your own settlement');
      cost = COSTS.city;
      break;
    case 'BUY_DEVELOPMENT_CARD':
      if (!deck.length) return reject('No development cards remaining');
      cost = COSTS.development;
      break;
    case 'BANK_TRADE': {
      const { give, receive } = action;
      if (!give || !receive || !RESOURCES.includes(give.resource) || !RESOURCES.includes(receive.resource)) return reject('Invalid trade resources');
      if (![give.amount, receive.amount].every(n => Number.isSafeInteger(n) && n > 0)) return reject('Trade amounts must be positive integers');
      if (give.resource === receive.resource) return reject('Cannot trade a resource for itself');
      if (give.amount !== receive.amount * bankRate(input, playerId, give.resource)) return reject('Invalid bank trade ratio');
      if (player.resources[give.resource] < give.amount) return reject('Not enough resources to trade');
      if (input.game.bank[receive.resource] < receive.amount) return reject('Bank does not have enough resources');
      break;
    }
    case 'PLAY_KNIGHT': break;
    case 'PLAY_ROAD_BUILDING':
      if (!player.roadsRemaining || !validRoads(input, playerId).length) return reject('No legal roads to place');
      break;
    case 'PLAY_YEAR_OF_PLENTY': {
      if (!Array.isArray(action.resources) || action.resources.length !== 2 || action.resources.some(r => !RESOURCES.includes(r))) return reject('Choose two valid resources');
      const [a, b] = action.resources;
      if (input.game.bank[a] < (a === b ? 2 : 1) || input.game.bank[b] < 1) return reject('Bank does not have enough resources');
      break;
    }
    case 'PLAY_MONOPOLY':
      if (!RESOURCES.includes(action.resource)) return reject('Choose a valid resource');
      break;
    case 'END_TURN': break;
    default: return reject('Unsupported economy action');
  }
  if (RESOURCES.some(r => player.resources[r] < (cost[r] ?? 0))) return reject('Not enough resources');
  const state = structuredClone(input);
  const remaining = [...deck];
  const actor = state.players.players.find(p => p.id === playerId)!;
  for (const resource of RESOURCES) {
    const amount = cost[resource] ?? 0;
    actor.resources[resource] -= amount;
    state.game.bank[resource] += amount;
  }
  if (card) {
    actor.developmentCards.find(c => c.id === card.id)!.isPlayed = true;
    actor.hasPlayedDevCard = true;
    state.game.devCardPlayedThisTurn = true;
  }
  switch (action.type) {
    case 'BUILD_ROAD':
      state.board.roads.push({ id: context.id(), type: 'road', playerId, playerColor: actor.color, edge: action.edge });
      actor.roadsRemaining--;
      if (freeRoad) {
        state.game.roadBuildingRemaining--;
        if (!state.game.roadBuildingRemaining || !actor.roadsRemaining || !validRoads(state, playerId).length) {
          state.game.phase = state.game.lastRoll ? 'main' : 'roll';
          state.game.roadBuildingRemaining = 0;
        }
      }
      break;
    case 'BUILD_SETTLEMENT':
      state.board.buildings.push({ id: context.id(), type: 'settlement', playerId, playerColor: actor.color, vertex: action.vertex });
      actor.settlementsRemaining--;
      break;
    case 'BUILD_CITY':
      state.board.buildings.find(b => vertexKey(b.vertex) === vertexKey(action.vertex))!.type = 'city';
      actor.citiesRemaining--;
      actor.settlementsRemaining++;
      break;
    case 'BUY_DEVELOPMENT_CARD': {
      const id = context.id();
      actor.developmentCards.push({ id, type: remaining.shift()!, turnBought: state.game.turn, isPlayed: false });
      actor.devCardsBoughtThisTurn.push(id);
      state.game.developmentDeckCount = remaining.length;
      break;
    }
    case 'BANK_TRADE':
      actor.resources[action.give.resource] -= action.give.amount;
      state.game.bank[action.give.resource] += action.give.amount;
      actor.resources[action.receive.resource] += action.receive.amount;
      state.game.bank[action.receive.resource] -= action.receive.amount;
      actor.totalTradesMade++;
      break;
    case 'PLAY_KNIGHT':
      actor.armySize++;
      if (actor.armySize >= 3 && actor.armySize > (state.game.largestArmy?.value ?? 2)) {
        state.game.largestArmy = { playerId, value: actor.armySize };
      }
      state.game.phase = 'robber-move';
      break;
    case 'PLAY_ROAD_BUILDING':
      state.game.phase = 'road-building';
      state.game.roadBuildingRemaining = Math.min(2, actor.roadsRemaining);
      break;
    case 'PLAY_YEAR_OF_PLENTY':
      for (const resource of action.resources) { actor.resources[resource]++; state.game.bank[resource]--; }
      break;
    case 'PLAY_MONOPOLY':
      for (const other of state.players.players) if (other.id !== playerId) {
        actor.resources[action.resource] += other.resources[action.resource];
        other.resources[action.resource] = 0;
      }
      break;
    case 'END_TURN': {
      // A VP winner cannot be made to pass their win to the next player.
      updateScores(state);
      if (state.game.phase === 'ended') break;
      const order = state.players.turnOrder;
      const next = order[(order.indexOf(playerId) + 1) % order.length];
      state.game.currentPlayerId = next;
      state.game.turn++;
      state.game.lastRoll = null;
      state.game.phase = 'roll';
      state.game.turnStartedAt = context.now();
      state.game.turnTimeRemaining = state.game.settings.turnTimer;
      state.game.devCardPlayedThisTurn = false;
      const nextPlayer = state.players.players.find(p => p.id === next)!;
      nextPlayer.hasPlayedDevCard = false;
      nextPlayer.devCardsBoughtThisTurn = [];
      break;
    }
  }
  if (action.type.startsWith('BUILD_')) state.log.log.push({ id: context.id(), timestamp: context.now(),
    turn: state.game.turn, type: 'build', playerId, playerName: actor.name, playerColor: actor.color,
    message: `${actor.name} ${action.type === 'BUILD_CITY' ? 'upgraded a settlement to a city' : action.type === 'BUILD_ROAD' ? 'built a road' : 'built a settlement'}.`, visibility: 'all' });
  updateScores(state);
  return { success: true, state, deck: remaining };
}
