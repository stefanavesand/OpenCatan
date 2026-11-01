// @ts-nocheck
// TODO: Fix TypeScript errors in this file
/**
 * Host-specific logic for OpenCatan
 *
 * The host's browser runs the authoritative game logic.
 * This module provides functions for:
 * - Validating and processing game actions
 * - Broadcasting state to all peers
 * - Managing player connections
 * - Handling host migration
 */

import { validSetupSettlements, validSetupRoads, validCoordinate } from '@/game/engine/setupValidation';
import { vertexKey, edgeKey } from '@/utils/hex';
import type { GameState, Player, GameSettings, PlayerColor } from '../types/game';
import type {
  GameAction,
  LobbyState,
  LobbyPlayer,
  HostMessage,
  ClientMessage,
  GameActionMessage,
} from './messages';
import type { RootState, AppDispatch } from '../game/state/store';
import { placeBuilding, placeRoad, moveRobber as moveRobberAction, upgradeToCity } from '../game/state/slices/boardSlice';
import { updatePlayerSetupPlacements, incrementSetupPlacementIndex, completeSetup, setPhase, setLastPlacedSettlement, setCurrentPlayer, setDiceRoll, nextTurn, addToBank, removeFromBank, setRoadBuildingRemaining, setLargestArmy, decrementDevDeck, setPendingDiscard, removePendingDiscard } from '../game/state/slices/gameSlice';
import { addLogEntry, createLogEntry } from '../game/state/slices/logSlice';
import { addResources, removeResources, markCardPlayed, incrementArmySize, addCard, incrementTradesMade, incrementTimesRobbed, incrementTimesWasRobbed } from '../game/state/slices/playersSlice';
import {
  addOutgoingOffer,
  addIncomingOffer,
  updateOutgoingOfferStatus,
  updateIncomingOfferStatus,
  addDeclinedBy,
  addCounterOffer as addCounterOfferAction,
  removeOutgoingOffer,
  removeIncomingOffer,
  clearOffersFromPlayer,
  type TradeOfferExtended,
} from '../game/state/slices/tradeSlice';
import type { DevelopmentCard, DevelopmentCardType } from '../types/cards';
import { v4 as uuidv4 } from 'uuid';
import type { ResourceType, ResourceCounts, VertexCoord, HexCoord, TradeOffer } from '../types';

// Helper: Get hexes adjacent to a vertex
function getHexesAdjacentToVertex(vertex: VertexCoord): HexCoord[] {
  const { q, r } = vertex.hex;
  if (vertex.direction === 'N') {
    return [{ q, r }, { q, r: r - 1 }, { q: q + 1, r: r - 1 }];
  } else {
    return [{ q, r }, { q: q - 1, r: r + 1 }, { q, r: r + 1 }];
  }
}

// Helper: Map terrain to resource
const TERRAIN_TO_RESOURCE: Record<string, ResourceType | null> = {
  hills: 'brick',
  forest: 'lumber',
  mountains: 'ore',
  fields: 'grain',
  pasture: 'wool',
  desert: null,
  water: null,
};

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  newState?: Partial<RootState>;
}

export interface HostState {
  isHost: boolean;
  lobbyState: LobbyState | null;
  sequence: number;
  pendingActions: Map<string, GameAction>;
  connectedPlayers: Set<string>;
  disconnectedPlayers: Map<string, { timestamp: number; timeout: ReturnType<typeof setTimeout> }>;
}

export type BroadcastFn = (message: HostMessage, excludePlayerId?: string) => void;
export type SendToPlayerFn = (playerId: string, message: HostMessage) => void;

// ============================================================================
// Host State Management
// ============================================================================

/**
 * Create initial host state
 */
export function createHostState(): HostState {
  return {
    isHost: false,
    lobbyState: null,
    sequence: 0,
    pendingActions: new Map(),
    connectedPlayers: new Set(),
    disconnectedPlayers: new Map(),
  };
}

// ============================================================================
// Action Validation
// ============================================================================

/**
 * Validate a game action before applying it
 * Returns validation result with error message if invalid
 */
export function validateAction(
  action: GameAction,
  state: RootState
): ValidationResult {
  const gameState = state.game;
  const playersState = state.players;

  // Check if it's this player's turn (for most actions)
  const turnBasedActions = [
    'ROLL_DICE',
    'BUILD_SETTLEMENT',
    'BUILD_CITY',
    'BUILD_ROAD',
    'BUILD_SHIP',
    'BUY_DEVELOPMENT_CARD',
    'PLAY_DEVELOPMENT_CARD',
    'MOVE_ROBBER',
    'STEAL_RESOURCE',
    'END_TURN',
    'TRADE_OFFER',
    'OFFER_TRADE',
    'BANK_TRADE',
    'MOVE_KNIGHT',
    'ACTIVATE_KNIGHT',
    'UPGRADE_KNIGHT',
    'BUILD_CITY_IMPROVEMENT',
    'MOVE_SHIP',
  ];

  if (turnBasedActions.includes(action.type)) {
    if (gameState.currentPlayerId !== action.playerId) {
      return { isValid: false, error: 'Not your turn' };
    }
  }

  // Validate based on action type
  switch (action.type) {
    case 'ROLL_DICE':
      return validateRollDice(action, state);

    case 'BUILD_SETTLEMENT':
      return validateBuildSettlement(action, state);

    case 'BUILD_CITY':
      return validateBuildCity(action, state);

    case 'BUILD_ROAD':
      return validateBuildRoad(action, state);

    case 'BUILD_SHIP':
      return validateBuildShip(action, state);

    case 'BUY_DEVELOPMENT_CARD':
      return validateBuyDevCard(action, state);

    case 'PLAY_DEVELOPMENT_CARD':
      return validatePlayDevCard(action, state);

    case 'MOVE_ROBBER':
      return validateMoveRobber(action, state);

    case 'STEAL_RESOURCE':
      return validateStealResource(action, state);

    case 'SKIP_STEAL':
      return validateSkipSteal(action, state);

    case 'DISCARD_RESOURCES':
      return validateDiscardResources(action, state);

    case 'END_TURN':
      return validateEndTurn(action, state);

    case 'TRADE_OFFER':
    case 'OFFER_TRADE':
      return validateTradeOffer(action, state);

    case 'TRADE_ACCEPT':
    case 'TRADE_DECLINE':
    case 'TRADE_COUNTER':
    case 'TRADE_CANCEL':
      return validateTradeResponse(action, state);

    case 'BANK_TRADE':
      return validateBankTrade(action, state);

    case 'ACTIVATE_KNIGHT':
    case 'MOVE_KNIGHT':
    case 'UPGRADE_KNIGHT':
      return validateKnightAction(action, state);

    case 'BUILD_CITY_IMPROVEMENT':
      return validateCityImprovement(action, state);

    case 'MOVE_SHIP':
      return validateMoveShip(action, state);

    default:
      return { isValid: false, error: 'Unknown action type' };
  }
}

// Individual action validators
function validateRollDice(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'roll') {
    return { isValid: false, error: 'Cannot roll dice in this phase' };
  }
  if (state.game.lastRoll !== null) {
    return { isValid: false, error: 'Dice already rolled this turn' };
  }
  return { isValid: true };
}

function validateBuildSettlement(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main' && !state.game.phase.startsWith('setup-settlement')) {
    return { isValid: false, error: 'Cannot build settlement in this phase' };
  }
  if (!validCoordinate(action.vertex, ['N', 'S'])) return { isValid: false, error: 'Invalid vertex' };
  if (state.game.phase.startsWith('setup-') && !validSetupSettlements(state).some(v => vertexKey(v) === vertexKey(action.vertex))) {
    return { isValid: false, error: 'Invalid settlement placement' };
  }
  return { isValid: true };
}

function validateBuildCity(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot build city in this phase' };
  }
  // TODO: Check resources, existing settlement, etc.
  return { isValid: true };
}

function validateBuildRoad(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main' && !state.game.phase.startsWith('setup-road') && state.game.phase !== 'road-building') {
    return { isValid: false, error: 'Cannot build road in this phase' };
  }
  if (!validCoordinate(action.edge, ['NE', 'E', 'SE'])) return { isValid: false, error: 'Invalid edge' };
  if (state.game.phase.startsWith('setup-') && !validSetupRoads(state).some(e => edgeKey(e) === edgeKey(action.edge))) {
    return { isValid: false, error: 'Road must adjoin the new settlement on an empty land edge' };
  }
  return { isValid: true };
}

function validateBuildShip(action: GameAction, state: RootState): ValidationResult {
  if (state.game.mode !== 'seafarers') {
    return { isValid: false, error: 'Ships only available in Seafarers mode' };
  }
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot build ship in this phase' };
  }
  return { isValid: true };
}

function validateBuyDevCard(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot buy development card in this phase' };
  }
  if (state.game.developmentDeckCount <= 0) {
    return { isValid: false, error: 'No development cards remaining' };
  }
  // TODO: Check resources
  return { isValid: true };
}

function validatePlayDevCard(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main' && state.game.phase !== 'roll') {
    return { isValid: false, error: 'Cannot play development card in this phase' };
  }
  // TODO: Check card ownership, playability, etc.
  return { isValid: true };
}

function validateMoveRobber(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'robber-move') {
    return { isValid: false, error: 'Cannot move robber in this phase' };
  }
  // TODO: Check valid hex, not same location, etc.
  return { isValid: true };
}

function validateStealResource(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'robber-steal') {
    return { isValid: false, error: 'Cannot steal in this phase' };
  }
  const victimId = (action as any).victimId;
  if (!victimId) {
    return { isValid: false, error: 'Must specify a victim to steal from' };
  }
  const victim = state.players.players.find(p => p.id === victimId);
  if (!victim) {
    return { isValid: false, error: 'Victim player not found' };
  }
  // Check if victim has any resources
  const victimResourceCount = Object.values(victim.resources).reduce((sum, c) => sum + c, 0);
  if (victimResourceCount === 0) {
    return { isValid: false, error: 'Victim has no resources to steal' };
  }
  return { isValid: true };
}

function validateSkipSteal(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'robber-steal') {
    return { isValid: false, error: 'Cannot skip steal in this phase' };
  }
  return { isValid: true };
}

function validateDiscardResources(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'discard') {
    return { isValid: false, error: 'Cannot discard in this phase' };
  }
  const playerId = (action as any).playerId;
  const resourcesToDiscard = (action as any).resources as Partial<ResourceCounts>;

  // Check if this player needs to discard
  if (!state.game.pendingDiscard.includes(playerId)) {
    return { isValid: false, error: 'You do not need to discard' };
  }

  // Get player's current resources
  const player = state.players.players.find(p => p.id === playerId);
  if (!player) {
    return { isValid: false, error: 'Player not found' };
  }

  // Check that player has the resources they want to discard
  for (const [resource, amount] of Object.entries(resourcesToDiscard)) {
    if (amount && amount > 0) {
      const res = resource as ResourceType;
      if (player.resources[res] < amount) {
        return { isValid: false, error: `Not enough ${resource} to discard` };
      }
    }
  }

  // Check the correct amount is being discarded
  const cardCount = Object.values(player.resources).reduce((sum, c) => sum + c, 0);
  const expectedDiscard = Math.floor(cardCount / 2);
  const actualDiscard = Object.values(resourcesToDiscard).reduce((sum, c) => sum + (c || 0), 0);

  if (actualDiscard !== expectedDiscard) {
    return { isValid: false, error: `Must discard exactly ${expectedDiscard} cards, not ${actualDiscard}` };
  }

  return { isValid: true };
}

function validateEndTurn(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot end turn in this phase' };
  }
  return { isValid: true };
}

function validateTradeOffer(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot trade in this phase' };
  }
  // TODO: Check player has resources to offer
  return { isValid: true };
}

function validateTradeResponse(action: GameAction, state: RootState): ValidationResult {
  // TODO: Validate trade exists, player is recipient, etc.
  return { isValid: true };
}

/**
 * Get the best trade rate a player has for a specific resource.
 * Checks ports the player has access to via their buildings.
 *
 * @param state - Current root state
 * @param playerId - Player to check rates for
 * @param resource - Resource type to check
 * @returns Best trade rate (2, 3, or 4)
 */
function getPlayerBankRate(
  state: RootState,
  playerId: string,
  resource: ResourceType
): 2 | 3 | 4 {
  const boardState = state.board;

  // Get vertices where player has buildings
  const playerBuildings = boardState.buildings.filter(b => b.playerId === playerId);
  const playerVertexKeys = new Set(
    playerBuildings.map(b => vertexToKey(b.vertex))
  );

  // Start with default 4:1 rate
  let bestRate: 2 | 3 | 4 = 4;

  // Check each port for access
  for (const port of boardState.ports) {
    // Check if player has a building at any of the port's vertices
    const hasAccess = port.vertices?.some(v =>
      playerVertexKeys.has(vertexToKey(v))
    );

    if (hasAccess) {
      if (port.type === 'generic') {
        // Generic 3:1 port - applies to all resources
        if (bestRate > 3) {
          bestRate = 3;
        }
      } else if (port.type === resource) {
        // Specific 2:1 port for this resource
        if (bestRate > 2) {
          bestRate = 2;
        }
      }
    }
  }

  return bestRate;
}

function validateBankTrade(action: GameAction, state: RootState): ValidationResult {
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot trade with bank in this phase' };
  }

  const playerId = (action as any).playerId;
  const give = (action as any).give;
  const receive = (action as any).receive;

  if (!playerId || !give || !receive) {
    return { isValid: false, error: 'Invalid bank trade parameters' };
  }

  // Check that player has the resources to give
  const player = state.players.players.find(p => p.id === playerId);
  if (!player) {
    return { isValid: false, error: 'Player not found' };
  }

  const giveResource = give.resource as ResourceType;
  const giveAmount = give.amount as number;
  const receiveResource = receive.resource as ResourceType;
  const receiveAmount = receive.amount as number;

  // Cannot trade same resource for itself
  if (giveResource === receiveResource) {
    return { isValid: false, error: 'Cannot trade a resource for itself' };
  }

  // Check player has enough of the give resource
  if (player.resources[giveResource] < giveAmount) {
    return { isValid: false, error: `Not enough ${giveResource} to trade` };
  }

  // Get the player's best rate for this resource
  const rate = getPlayerBankRate(state, playerId, giveResource);

  // Validate the trade ratio
  const expectedReceive = Math.floor(giveAmount / rate);
  if (receiveAmount !== expectedReceive) {
    return {
      isValid: false,
      error: `Invalid trade ratio. With ${rate}:1 rate, giving ${giveAmount} ${giveResource} should receive ${expectedReceive}, not ${receiveAmount}`
    };
  }

  // Check that the amount being given is a multiple of the rate (no waste)
  if (giveAmount % rate !== 0) {
    return { isValid: false, error: `Give amount must be a multiple of ${rate}` };
  }

  // Check bank has enough of the receive resource
  if (state.game.bank[receiveResource] < receiveAmount) {
    return { isValid: false, error: `Bank does not have enough ${receiveResource}` };
  }

  return { isValid: true };
}

function validateKnightAction(action: GameAction, state: RootState): ValidationResult {
  if (state.game.mode !== 'cities-knights') {
    return { isValid: false, error: 'Knights only available in Cities & Knights mode' };
  }
  return { isValid: true };
}

function validateCityImprovement(action: GameAction, state: RootState): ValidationResult {
  if (state.game.mode !== 'cities-knights') {
    return { isValid: false, error: 'City improvements only available in Cities & Knights mode' };
  }
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot build city improvement in this phase' };
  }
  return { isValid: true };
}

function validateMoveShip(action: GameAction, state: RootState): ValidationResult {
  if (state.game.mode !== 'seafarers') {
    return { isValid: false, error: 'Ships only available in Seafarers mode' };
  }
  if (state.game.phase !== 'main') {
    return { isValid: false, error: 'Cannot move ship in this phase' };
  }
  return { isValid: true };
}

// ============================================================================
// Resource Distribution
// ============================================================================

/**
 * Get all vertices adjacent to a hex tile.
 * Each hex has 6 vertices that can hold buildings.
 */
function getVerticesAdjacentToHex(hex: HexCoord): VertexCoord[] {
  const { q, r } = hex;
  return [
    // Top and bottom vertices of this hex
    { hex: { q, r }, direction: 'N' as const },
    { hex: { q, r }, direction: 'S' as const },
    // Top vertex of the hex below-left
    { hex: { q: q - 1, r: r + 1 }, direction: 'N' as const },
    // Top vertex of the hex below-right
    { hex: { q, r: r + 1 }, direction: 'N' as const },
    // Bottom vertex of the hex above-left
    { hex: { q, r: r - 1 }, direction: 'S' as const },
    // Bottom vertex of the hex above-right
    { hex: { q: q + 1, r: r - 1 }, direction: 'S' as const },
  ];
}

/**
 * Create a unique key for a vertex coordinate
 */
function vertexToKey(vertex: VertexCoord): string {
  return `${vertex.hex.q},${vertex.hex.r},${vertex.direction}`;
}

/**
 * Distributes resources to all players based on a dice roll.
 *
 * This function:
 * 1. Finds all tiles that match the rolled number (excluding robber-blocked tiles)
 * 2. For each producing tile, finds all adjacent buildings
 * 3. Gives 1 resource per settlement, 2 per city
 * 4. Takes resources from bank and adds to players
 *
 * Handles bank shortages according to Catan rules:
 * - If only one player would receive a resource, they get what's available
 * - If multiple players would receive the same resource, nobody gets any
 */
function distributeResourcesForRoll(
  roll: number,
  state: RootState,
  dispatch: AppDispatch
): void {
  const boardState = state.board;
  const gameState = state.game;

  // Find all tiles that produce for this roll
  const producingTiles = boardState.tiles.filter(tile => {
    // Tile must have the matching number
    if (tile.number !== roll) return false;

    // Robber blocks production
    if (tile.hasRobber) return false;

    // Must be a producing terrain type
    const resource = TERRAIN_TO_RESOURCE[tile.terrain];
    if (!resource) return false;

    return true;
  });

  if (producingTiles.length === 0) {
    console.log(`No tiles produce for roll ${roll}`);
    return;
  }

  // Calculate resources for each player
  const playerResources: Record<string, Partial<Record<ResourceType, number>>> = {};

  // Initialize for all players
  for (const player of state.players.players) {
    playerResources[player.id] = {};
  }

  // For each producing tile, find adjacent buildings
  for (const tile of producingTiles) {
    const resource = TERRAIN_TO_RESOURCE[tile.terrain];
    if (!resource) continue;

    const adjacentVertices = getVerticesAdjacentToHex(tile.coord);

    for (const vertex of adjacentVertices) {
      const vKey = vertexToKey(vertex);

      // Find building at this vertex
      const building = boardState.buildings.find(b =>
        vertexToKey(b.vertex) === vKey
      );

      if (building) {
        // Determine amount based on building type (city = 2, settlement = 1)
        const amount = building.type === 'city' ? 2 : 1;

        if (!playerResources[building.playerId]) {
          playerResources[building.playerId] = {};
        }
        playerResources[building.playerId][resource] =
          (playerResources[building.playerId][resource] || 0) + amount;
      }
    }
  }

  // Check for bank shortages and apply Catan shortage rules
  const resourceTypes: ResourceType[] = ['brick', 'lumber', 'ore', 'grain', 'wool'];
  const actualDistributions: Record<string, Partial<Record<ResourceType, number>>> = {};

  // Initialize actual distributions
  for (const playerId of Object.keys(playerResources)) {
    actualDistributions[playerId] = {};
  }

  for (const resource of resourceTypes) {
    // Calculate total needed for this resource
    let totalNeeded = 0;
    const playersReceiving: { playerId: string; amount: number }[] = [];

    for (const [playerId, resources] of Object.entries(playerResources)) {
      const amount = resources[resource] || 0;
      if (amount > 0) {
        totalNeeded += amount;
        playersReceiving.push({ playerId, amount });
      }
    }

    if (totalNeeded === 0) continue;

    const bankAvailable = gameState.bank[resource];

    if (totalNeeded <= bankAvailable) {
      // Bank has enough - distribute normally
      for (const { playerId, amount } of playersReceiving) {
        actualDistributions[playerId][resource] = amount;
      }
    } else if (playersReceiving.length === 1) {
      // Only one player - they get what's available
      const { playerId } = playersReceiving[0];
      actualDistributions[playerId][resource] = Math.min(
        playersReceiving[0].amount,
        bankAvailable
      );
      console.log(`Bank shortage: ${resource} - player ${playerId} receives ${actualDistributions[playerId][resource]} of ${playersReceiving[0].amount} requested`);
    } else {
      // Multiple players and not enough in bank - nobody gets any (Catan rule)
      console.log(`Bank shortage: ${resource} - multiple players need ${totalNeeded}, bank has ${bankAvailable} - nobody receives`);
    }
  }

  // Apply distributions: add to players and remove from bank
  for (const [playerId, resources] of Object.entries(actualDistributions)) {
    const hasResources = Object.values(resources).some(v => v && v > 0);
    if (hasResources) {
      // Add resources to player
      dispatch(addResources({ playerId, resources }));

      // Remove resources from bank
      dispatch(removeFromBank(resources));

      const player = state.players.players.find(p => p.id === playerId);
      console.log(`Gave resources to ${player?.name || playerId}:`, resources);
    }
  }
}

// ============================================================================
// Action Processing
// ============================================================================

/**
 * Process a game action as the host
 * Validates and applies the action, returning the result
 */
export function processActionAsHost(
  action: GameAction,
  state: RootState,
  dispatch: AppDispatch
): ActionResult {
  // First validate the action
  const validation = validateAction(action, state);

  if (!validation.isValid) {
    return {
      success: false,
      error: validation.error,
    };
  }

  // Apply the action
  // This would dispatch appropriate Redux actions
  try {
    applyAction(action, state, dispatch);

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply action',
    };
  }
}

/**
 * Apply a validated action to the game state
 */
function applyAction(
  action: GameAction,
  state: RootState,
  dispatch: AppDispatch
): void {
  const gameState = state.game;
  const playersState = state.players;

  switch (action.type) {
    case 'ROLL_DICE': {
      // Generate dice roll and dispatch
      const die1 = Math.floor(Math.random() * 6) + 1;
      const die2 = Math.floor(Math.random() * 6) + 1;
      const total = die1 + die2;
      console.log(`Dice roll: ${die1} + ${die2} = ${total}`);
      dispatch(setDiceRoll({ die1, die2, total }));

      const rollingPlayerId = (action as any).playerId || gameState.currentPlayerId;
      const rollingPlayer = playersState.players.find(p => p.id === rollingPlayerId);

      // Log the dice roll
      dispatch(addLogEntry(createLogEntry(
        'dice-roll',
        gameState.turn,
        `${rollingPlayer?.name || 'Player'} rolled ${total} (${die1} + ${die2})`,
        {
          playerId: rollingPlayerId,
          playerName: rollingPlayer?.name,
          playerColor: rollingPlayer?.color,
          visibility: 'all',
          data: { diceValues: [die1, die2], diceTotal: total },
        }
      )));

      // Check for 7 (robber activation)
      if (total === 7) {
        // Find players who need to discard (more than 7 cards based on discardLimit)
        const discardLimit = gameState.settings.discardLimit || 7;
        const playersToDiscard: string[] = [];

        for (const player of playersState.players) {
          const cardCount = Object.values(player.resources).reduce((sum, c) => sum + c, 0);
          if (cardCount > discardLimit) {
            playersToDiscard.push(player.id);
            const discardAmount = Math.floor(cardCount / 2);
            console.log(`Player ${player.name} has ${cardCount} cards, must discard ${discardAmount}`);
          }
        }

        if (playersToDiscard.length > 0) {
          // Set pending discard and enter discard phase
          dispatch(setPendingDiscard(playersToDiscard));
          dispatch(setPhase('discard'));

          // Log discard required
          dispatch(addLogEntry(createLogEntry(
            'robber-activated',
            gameState.turn,
            `A 7 was rolled! ${playersToDiscard.length} player(s) must discard half their cards.`,
            {
              playerId: rollingPlayerId,
              playerName: rollingPlayer?.name,
              playerColor: rollingPlayer?.color,
              visibility: 'all',
              data: { playersToDiscard },
            }
          )));

          console.log(`Entered discard phase. Players needing to discard: ${playersToDiscard.join(', ')}`);
        } else {
          // No one needs to discard, go directly to robber move phase
          dispatch(setPhase('robber-move'));

          // Log robber move required
          dispatch(addLogEntry(createLogEntry(
            'robber-activated',
            gameState.turn,
            `A 7 was rolled! ${rollingPlayer?.name || 'Player'} must move the robber.`,
            {
              playerId: rollingPlayerId,
              playerName: rollingPlayer?.name,
              playerColor: rollingPlayer?.color,
              visibility: 'all',
            }
          )));

          console.log('No discard needed, entering robber-move phase');
        }
      } else {
        // Distribute resources for the roll
        distributeResourcesForRoll(total, state, dispatch);
        dispatch(setPhase('main'));
      }
      break;
    }

    case 'BUILD_SETTLEMENT': {
      const vertex = (action as any).vertex;
      const playerId = (action as any).playerId;
      const player = playersState.players.find(p => p.id === playerId);
      const isSetupPhase = gameState.phase.startsWith('setup-settlement');

      if (vertex && playerId && player) {
        dispatch({ type: 'players/updatePlayer', payload: { playerId, updates: { settlementsRemaining: player.settlementsRemaining - 1 } } });
        // Deduct resources if not in setup phase
        if (!isSetupPhase) {
          const settlementCost = { brick: 1, lumber: 1, grain: 1, wool: 1 };
          dispatch(removeResources({ playerId, resources: settlementCost }));
          dispatch(addToBank(settlementCost));
        }

        // Create a new building
        const building = {
          id: uuidv4(),
          type: 'settlement' as const,
          playerId,
          playerColor: player.color,
          vertex,
        };

        dispatch(placeBuilding(building));
        console.log(`Placed settlement at vertex`, vertex);

        // Log the settlement placement
        dispatch(addLogEntry(createLogEntry(
          'build',
          gameState.turn,
          `${player.name} built a settlement.`,
          {
            playerId,
            playerName: player.name,
            playerColor: player.color,
            visibility: 'all',
            data: { buildingType: 'settlement', vertex },
          }
        )));

        // During setup, transition to road placement phase
        if (gameState.phase.startsWith('setup-settlement')) {
          dispatch(setLastPlacedSettlement(vertex));
          dispatch(updatePlayerSetupPlacements({ playerId, placements: {
            [gameState.phase === 'setup-settlement-1' ? 'settlement1' : 'settlement2']: vertex,
          } }));

          // For second settlement (setup-settlement-2), give starting resources
          if (gameState.phase === 'setup-settlement-2') {
            // Get hexes adjacent to the vertex
            const adjacentHexes = getHexesAdjacentToVertex(vertex);
            const startingResources: Partial<Record<ResourceType, number>> = {};

            // Get tiles from the board state and give one resource per adjacent hex
            for (const hexCoord of adjacentHexes) {
              // Find the tile at this hex in the board state
              const tile = state.board.tiles.find(
                (t) => t.coord.q === hexCoord.q && t.coord.r === hexCoord.r
              );
              if (tile) {
                const resource = TERRAIN_TO_RESOURCE[tile.terrain];
                if (resource) {
                  startingResources[resource] = (startingResources[resource] || 0) + 1;
                }
              }
            }

            // Give resources to player and deduct from bank
            if (Object.keys(startingResources).length > 0) {
              dispatch(addResources({ playerId, resources: startingResources }));
              dispatch(removeFromBank(startingResources));
              console.log(`Gave starting resources to ${player.name}:`, startingResources);
            }
          }

          // Transition from setup-settlement-1 to setup-road-1, etc.
          const newPhase = gameState.phase.replace('settlement', 'road');
          dispatch(setPhase(newPhase as any));
          console.log(`Phase changed to: ${newPhase}`);
        }
      }
      break;
    }

    case 'BUILD_ROAD': {
      const edge = (action as any).edge;
      const playerId = (action as any).playerId;
      const player = playersState.players.find(p => p.id === playerId);
      const isSetupPhase = gameState.phase.startsWith('setup-road');
      const isRoadBuilding = gameState.phase === 'road-building';

      if (edge && playerId && player) {
        dispatch({ type: 'players/updatePlayer', payload: { playerId, updates: { roadsRemaining: player.roadsRemaining - 1 } } });
        // Deduct resources if not in setup phase or road building card phase
        if (!isSetupPhase && !isRoadBuilding) {
          const roadCost = { brick: 1, lumber: 1 };
          dispatch(removeResources({ playerId, resources: roadCost }));
          dispatch(addToBank(roadCost));
        }

        // Create a new road
        const road = {
          id: uuidv4(),
          type: 'road' as const,
          playerId,
          playerColor: player.color,
          edge,
        };

        dispatch(placeRoad(road));
        console.log(`Placed road at edge`, edge);

        // Log the road placement (only if not in setup or road building phase to avoid spam)
        if (!isSetupPhase) {
          dispatch(addLogEntry(createLogEntry(
            'build',
            gameState.turn,
            `${player.name} built a road.`,
            {
              playerId,
              playerName: player.name,
              playerColor: player.color,
              visibility: 'all',
              data: { buildingType: 'road', edge },
            }
          )));
        }

        // During setup, transition to next player or settlement phase
        if (gameState.phase.startsWith('setup-road')) {
          dispatch(updatePlayerSetupPlacements({ playerId, placements: {
            [gameState.phase === 'setup-road-1' ? 'road1' : 'road2']: edge,
          } }));
          dispatch(incrementSetupPlacementIndex());
          const currentPhase = gameState.phase; // e.g., 'setup-road-1' or 'setup-road-2'
          const isRound1 = currentPhase === 'setup-road-1';
          const playerCount = playersState.players.length;
          const turnOrder = playersState.turnOrder;
          const currentPlayerIndex = turnOrder.indexOf(playerId);

          if (isRound1) {
            // Round 1: Go to next player for settlement-1
            const nextPlayerIndex = currentPlayerIndex + 1;
            if (nextPlayerIndex < playerCount) {
              // More players to go in round 1
              dispatch(setCurrentPlayer(turnOrder[nextPlayerIndex]));
              dispatch(setPhase('setup-settlement-1'));
              console.log(`Moving to next player for round 1: ${turnOrder[nextPlayerIndex]}`);
            } else {
              // Round 1 done, start round 2 (reverse order)
              dispatch(setCurrentPlayer(turnOrder[playerCount - 1]));
              dispatch(setPhase('setup-settlement-2'));
              console.log(`Starting round 2 with player: ${turnOrder[playerCount - 1]}`);
            }
          } else {
            // Round 2: Go in reverse order
            const prevPlayerIndex = currentPlayerIndex - 1;
            if (prevPlayerIndex >= 0) {
              // More players to go in round 2
              dispatch(setCurrentPlayer(turnOrder[prevPlayerIndex]));
              dispatch(setPhase('setup-settlement-2'));
              console.log(`Moving to previous player for round 2: ${turnOrder[prevPlayerIndex]}`);
            } else {
              // Setup complete! Start the game
              dispatch(completeSetup());
              dispatch(setCurrentPlayer(turnOrder[0]));
              dispatch(setPhase('roll'));
              console.log('Setup complete! Starting main game.');
            }
          }
        } else if (gameState.phase === 'road-building') {
          // During Road Building card phase
          const remaining = gameState.roadBuildingRemaining - 1;
          dispatch(setRoadBuildingRemaining(remaining));
          console.log(`Road Building: ${remaining} roads remaining`);

          if (remaining <= 0) {
            // Road Building complete, return to main phase
            dispatch(setPhase('main'));
            console.log('Road Building complete, returning to main phase');
          }
        }
      }
      break;
    }

    case 'BUILD_CITY': {
      const vertex = (action as any).vertex;
      const playerId = (action as any).playerId;
      const player = playersState.players.find(p => p.id === playerId);

      if (vertex && playerId && player) {
        // Find the existing settlement at this vertex to upgrade
        const existingSettlement = state.board.buildings.find(
          b => b.playerId === playerId &&
               b.type === 'settlement' &&
               b.vertex.hex.q === vertex.hex.q &&
               b.vertex.hex.r === vertex.hex.r &&
               b.vertex.direction === vertex.direction
        );

        if (existingSettlement) {
          // Deduct resources for city upgrade
          const cityCost = { ore: 3, grain: 2 };
          dispatch(removeResources({ playerId, resources: cityCost }));
          dispatch(addToBank(cityCost));

          // Use upgradeToCity action from boardSlice to change settlement to city
          dispatch(upgradeToCity(existingSettlement.id));
          console.log(`Upgraded settlement to city at vertex`, vertex);

          // Log the city upgrade
          dispatch(addLogEntry(createLogEntry(
            'build',
            gameState.turn,
            `${player.name} upgraded a settlement to a city.`,
            {
              playerId,
              playerName: player.name,
              playerColor: player.color,
              visibility: 'all',
              data: { buildingType: 'city', vertex },
            }
          )));
        } else {
          console.log('No settlement found at vertex to upgrade');
        }
      }
      break;
    }

    case 'END_TURN': {
      // Get the current turn order and find the next player
      const turnOrder = playersState.turnOrder;
      const currentIndex = turnOrder.indexOf(gameState.currentPlayerId || '');
      const nextIndex = (currentIndex + 1) % turnOrder.length;
      const nextPlayerId = turnOrder[nextIndex];

      // Advance turn and set next player
      dispatch(nextTurn());
      dispatch(setCurrentPlayer(nextPlayerId));
      dispatch(setPhase('roll'));
      console.log(`End turn - moving to player: ${nextPlayerId}`);
      break;
    }

    case 'OFFER_TRADE': {
      const offer = (action as any).offer;
      const playerId = (action as any).playerId;

      if (offer) {
        // Create an extended trade offer with tracking info
        const extendedOffer: TradeOfferExtended = {
          id: uuidv4(),
          fromPlayerId: playerId,
          toPlayerId: offer.toPlayerId, // null means to all players
          offering: offer.offering || {},
          requesting: offer.requesting || {},
          isActive: true,
          declinedBy: [],
          createdAt: Date.now(),
          timeoutMs: 30000, // 30 seconds timeout
          counterOffers: {},
          respondedBy: [],
          status: 'pending',
        };

        // Add to outgoing offers for the sender
        dispatch(addOutgoingOffer(extendedOffer));

        // Add to incoming offers for recipients
        // If toPlayerId is null, it goes to all other players
        // If toPlayerId is specific, it only goes to that player
        dispatch(addIncomingOffer(extendedOffer));

        // Log the trade offer
        const offeringPlayer = playersState.players.find(p => p.id === playerId);
        const targetPlayer = offer.toPlayerId
          ? playersState.players.find(p => p.id === offer.toPlayerId)
          : null;

        const offeringStr = Object.entries(extendedOffer.offering)
          .filter(([, amt]) => (amt || 0) > 0)
          .map(([res, amt]) => `${amt} ${res}`)
          .join(', ');

        const requestingStr = Object.entries(extendedOffer.requesting)
          .filter(([, amt]) => (amt || 0) > 0)
          .map(([res, amt]) => `${amt} ${res}`)
          .join(', ');

        const targetStr = targetPlayer ? targetPlayer.name : 'all players';

        dispatch(addLogEntry(createLogEntry(
          'trade-offer',
          gameState.turn,
          `${offeringPlayer?.name || 'Player'} offers ${offeringStr} for ${requestingStr} to ${targetStr}.`,
          {
            playerId,
            playerName: offeringPlayer?.name,
            playerColor: offeringPlayer?.color,
            visibility: 'all',
            data: {
              offerId: extendedOffer.id,
              offering: extendedOffer.offering,
              requesting: extendedOffer.requesting,
              targetPlayerId: offer.toPlayerId,
            },
          }
        )));

        console.log('Trade offer created:', {
          id: extendedOffer.id,
          from: extendedOffer.fromPlayerId,
          to: extendedOffer.toPlayerId || 'all players',
          offering: extendedOffer.offering,
          requesting: extendedOffer.requesting,
        });
      }
      break;
    }

    case 'ACCEPT_TRADE': {
      const offerId = (action as any).offerId;
      const acceptingPlayerId = (action as any).playerId;

      if (offerId && acceptingPlayerId) {
        // Find the trade offer in the trade state
        const tradeState = state.trade;
        const offer = tradeState.outgoingOffers.find(o => o.id === offerId) ||
                      tradeState.incomingOffers.find(o => o.id === offerId);

        if (offer && offer.isActive && offer.status === 'pending') {
          const fromPlayerId = offer.fromPlayerId;
          const offering = offer.offering;
          const requesting = offer.requesting;

          // Verify both players have enough resources
          const fromPlayer = playersState.players.find(p => p.id === fromPlayerId);
          const toPlayer = playersState.players.find(p => p.id === acceptingPlayerId);

          if (fromPlayer && toPlayer) {
            // Check if the offering player has the resources they're offering
            const canFromAfford = Object.entries(offering).every(([resource, amount]) => {
              const res = resource as ResourceType;
              return (fromPlayer.resources[res] || 0) >= (amount || 0);
            });

            // Check if the accepting player has the resources being requested
            const canToAfford = Object.entries(requesting).every(([resource, amount]) => {
              const res = resource as ResourceType;
              return (toPlayer.resources[res] || 0) >= (amount || 0);
            });

            if (canFromAfford && canToAfford) {
              // Execute the trade: Transfer resources
              // Remove offering from sender, add to accepter
              dispatch(removeResources({ playerId: fromPlayerId, resources: offering as Partial<ResourceCounts> }));
              dispatch(addResources({ playerId: acceptingPlayerId, resources: offering as Partial<ResourceCounts> }));

              // Remove requesting from accepter, add to sender
              dispatch(removeResources({ playerId: acceptingPlayerId, resources: requesting as Partial<ResourceCounts> }));
              dispatch(addResources({ playerId: fromPlayerId, resources: requesting as Partial<ResourceCounts> }));

              // Update trade stats
              dispatch(incrementTradesMade(fromPlayerId));
              dispatch(incrementTradesMade(acceptingPlayerId));

              // Update offer status
              dispatch(updateOutgoingOfferStatus({ offerId, status: 'accepted' }));
              dispatch(updateIncomingOfferStatus({ offerId, status: 'accepted' }));

              // Remove the offers after a short delay
              setTimeout(() => {
                dispatch(removeOutgoingOffer(offerId));
                dispatch(removeIncomingOffer(offerId));
              }, 500);

              // Log the accepted trade
              const offeredStr = Object.entries(offering)
                .filter(([, amt]) => (amt || 0) > 0)
                .map(([res, amt]) => `${amt} ${res}`)
                .join(', ');

              const requestedStr = Object.entries(requesting)
                .filter(([, amt]) => (amt || 0) > 0)
                .map(([res, amt]) => `${amt} ${res}`)
                .join(', ');

              dispatch(addLogEntry(createLogEntry(
                'trade-accept',
                gameState.turn,
                `${toPlayer.name} accepted trade with ${fromPlayer.name}: gave ${requestedStr} for ${offeredStr}.`,
                {
                  playerId: acceptingPlayerId,
                  playerName: toPlayer.name,
                  playerColor: toPlayer.color,
                  visibility: 'all',
                  data: {
                    offerId,
                    tradePartnerId: fromPlayerId,
                    tradePartnerName: fromPlayer.name,
                    offering,
                    requesting,
                  },
                }
              )));

              console.log('Trade accepted:', {
                offerId,
                from: fromPlayerId,
                acceptedBy: acceptingPlayerId,
                offered: offering,
                requested: requesting,
              });
            } else {
              console.log('Trade failed: insufficient resources', { canFromAfford, canToAfford });
            }
          }
        }
      }
      break;
    }

    case 'DECLINE_TRADE': {
      const offerId = (action as any).offerId;
      const decliningPlayerId = (action as any).playerId;

      if (offerId && decliningPlayerId) {
        // Mark this player as having declined
        dispatch(addDeclinedBy({ offerId, playerId: decliningPlayerId }));

        // Update the incoming offer status for this player
        dispatch(updateIncomingOfferStatus({ offerId, status: 'declined' }));

        // Remove from incoming offers for this player
        dispatch(removeIncomingOffer(offerId));

        console.log('Trade declined:', { offerId, by: decliningPlayerId });
      }
      break;
    }

    case 'COUNTER_OFFER': {
      const originalOfferId = (action as any).originalOfferId;
      const counterOffer = (action as any).counterOffer;
      const counteringPlayerId = (action as any).playerId;

      if (originalOfferId && counterOffer && counteringPlayerId) {
        // Find the original offer
        const tradeState = state.trade;
        const originalOffer = tradeState.outgoingOffers.find(o => o.id === originalOfferId) ||
                              tradeState.incomingOffers.find(o => o.id === originalOfferId);

        if (originalOffer) {
          // Create a new trade offer as a counter-offer
          const newCounterOffer: TradeOfferExtended = {
            id: uuidv4(),
            fromPlayerId: counteringPlayerId,
            toPlayerId: originalOffer.fromPlayerId, // Send back to original offerer
            offering: counterOffer.offering || {},
            requesting: counterOffer.requesting || {},
            isActive: true,
            declinedBy: [],
            createdAt: Date.now(),
            timeoutMs: 30000,
            counterOffers: {},
            respondedBy: [],
            status: 'pending',
            originalOfferId: originalOfferId,
          };

          // Update original offer status
          dispatch(updateOutgoingOfferStatus({ offerId: originalOfferId, status: 'countered' }));
          dispatch(updateIncomingOfferStatus({ offerId: originalOfferId, status: 'countered' }));

          // Remove original incoming offer for the counter-offerer
          dispatch(removeIncomingOffer(originalOfferId));

          // Add the counter-offer as a new incoming offer for the original offerer
          dispatch(addOutgoingOffer(newCounterOffer));
          dispatch(addIncomingOffer(newCounterOffer));

          console.log('Counter-offer created:', {
            originalOfferId,
            newOfferId: newCounterOffer.id,
            from: counteringPlayerId,
            to: originalOffer.fromPlayerId,
            offering: newCounterOffer.offering,
            requesting: newCounterOffer.requesting,
          });
        }
      }
      break;
    }

    case 'CANCEL_TRADE': {
      const offerId = (action as any).offerId;
      const cancellingPlayerId = (action as any).playerId;

      if (offerId && cancellingPlayerId) {
        // Update status and remove the offer
        dispatch(updateOutgoingOfferStatus({ offerId, status: 'cancelled' }));
        dispatch(updateIncomingOfferStatus({ offerId, status: 'cancelled' }));

        dispatch(removeOutgoingOffer(offerId));
        dispatch(removeIncomingOffer(offerId));

        console.log('Trade cancelled:', { offerId, by: cancellingPlayerId });
      }
      break;
    }

    case 'BANK_TRADE': {
      const playerId = (action as any).playerId;
      const give = (action as any).give;
      const receive = (action as any).receive;

      if (playerId && give && receive) {
        // Remove resources from player
        dispatch(removeResources({
          playerId,
          resources: { [give.resource]: give.amount },
        }));

        // Add resources to bank
        dispatch(addToBank({ [give.resource]: give.amount }));

        // Add resources to player
        dispatch(addResources({
          playerId,
          resources: { [receive.resource]: receive.amount },
        }));

        // Remove resources from bank
        dispatch(removeFromBank({ [receive.resource]: receive.amount }));

        // Log the bank trade
        const bankTradePlayer = playersState.players.find(p => p.id === playerId);
        if (bankTradePlayer) {
          dispatch(addLogEntry(createLogEntry(
            'bank-trade',
            gameState.turn,
            `${bankTradePlayer.name} traded ${give.amount} ${give.resource} to the bank for ${receive.amount} ${receive.resource}.`,
            {
              playerId,
              playerName: bankTradePlayer.name,
              playerColor: bankTradePlayer.color,
              visibility: 'all',
              data: {
                give: { resource: give.resource, amount: give.amount },
                receive: { resource: receive.resource, amount: receive.amount },
              },
            }
          )));

          // Update trade stats
          dispatch(incrementTradesMade(playerId));
        }

        console.log(`Bank trade: ${give.amount} ${give.resource} for ${receive.amount} ${receive.resource}`);
      }
      break;
    }

    // ============================================================================
    // Development Card Actions
    // ============================================================================

    case 'BUY_DEVELOPMENT_CARD': {
      const playerId = (action as any).playerId || gameState.currentPlayerId;
      const player = playersState.players.find(p => p.id === playerId);

      if (player && gameState.developmentDeckCount > 0) {
        // Check if player can afford it (ore, grain, wool)
        if (player.resources.ore >= 1 && player.resources.grain >= 1 && player.resources.wool >= 1) {
          // Generate a random card from the deck
          // Standard distribution: 14 knights, 5 VP, 2 road building, 2 year of plenty, 2 monopoly
          const rand = Math.random();
          let cardType: DevelopmentCardType;
          if (rand < 0.56) cardType = 'knight';           // 14/25 = 56%
          else if (rand < 0.76) cardType = 'victoryPoint'; // 5/25 = 20%
          else if (rand < 0.84) cardType = 'roadBuilding'; // 2/25 = 8%
          else if (rand < 0.92) cardType = 'yearOfPlenty'; // 2/25 = 8%
          else cardType = 'monopoly';                      // 2/25 = 8%

          // Create the development card
          const newCard: DevelopmentCard = {
            id: uuidv4(),
            type: cardType,
            turnBought: gameState.turn,
            isPlayed: false,
          };

          // Deduct resources from player
          dispatch(removeResources({
            playerId,
            resources: { ore: 1, grain: 1, wool: 1 },
          }));

          // Add resources to bank
          dispatch(addToBank({ ore: 1, grain: 1, wool: 1 }));

          // Add card to player's hand
          dispatch(addCard({ playerId, card: newCard }));

          // Decrement deck count
          dispatch(decrementDevDeck());

          console.log(`Player ${player.name} bought a ${cardType} development card`);
        } else {
          console.log('Player cannot afford development card');
        }
      }
      break;
    }

    case 'PLAY_KNIGHT': {
      const playerId = (action as any).playerId || gameState.currentPlayerId;
      const player = playersState.players.find(p => p.id === playerId);

      if (player) {
        // Find an unplayed knight card that wasn't bought this turn
        const knightCard = player.developmentCards.find(
          c => c.type === 'knight' && !c.isPlayed && c.turnBought !== gameState.turn
        );

        if (knightCard) {
          // Mark card as played
          dispatch(markCardPlayed({ playerId, cardId: knightCard.id }));

          // Increment army size
          dispatch(incrementArmySize(playerId));

          // Check for largest army (need at least 3 knights)
          const newArmySize = player.armySize + 1;
          if (newArmySize >= 3) {
            const currentHolder = gameState.largestArmy;
            if (!currentHolder || newArmySize > currentHolder.value) {
              dispatch(setLargestArmy({ playerId, value: newArmySize }));
              console.log(`${player.name} now has Largest Army with ${newArmySize} knights`);

              // Log largest army acquisition
              dispatch(addLogEntry(createLogEntry(
                'largest-army',
                gameState.turn,
                `${player.name} now has Largest Army with ${newArmySize} knights!`,
                {
                  playerId,
                  playerName: player.name,
                  playerColor: player.color,
                  visibility: 'all',
                  data: { armySize: newArmySize },
                }
              )));
            }
          }

          // Log knight card played
          dispatch(addLogEntry(createLogEntry(
            'dev-card-played',
            gameState.turn,
            `${player.name} played a Knight card.`,
            {
              playerId,
              playerName: player.name,
              playerColor: player.color,
              visibility: 'all',
              data: { cardType: 'knight', armySize: newArmySize },
            }
          )));

          // Enter robber move phase (Knight does NOT trigger discard phase)
          dispatch(setPhase('robber-move'));

          console.log(`Player ${player.name} played Knight card (army size: ${newArmySize})`);
        } else {
          console.log('No playable knight card found');
        }
      }
      break;
    }

    case 'PLAY_ROAD_BUILDING': {
      const playerId = (action as any).playerId || gameState.currentPlayerId;
      const player = playersState.players.find(p => p.id === playerId);

      if (player) {
        // Find an unplayed road building card that wasn't bought this turn
        const rbCard = player.developmentCards.find(
          c => c.type === 'roadBuilding' && !c.isPlayed && c.turnBought !== gameState.turn
        );

        if (rbCard) {
          // Mark card as played
          dispatch(markCardPlayed({ playerId, cardId: rbCard.id }));

          // Set road building remaining to 2 (or fewer if player has fewer roads)
          const roadsToPlace = Math.min(2, player.roadsRemaining || 2);
          dispatch(setRoadBuildingRemaining(roadsToPlace));

          // Enter road building phase
          dispatch(setPhase('road-building'));

          console.log(`Player ${player.name} played Road Building card (can place ${roadsToPlace} roads)`);
        } else {
          console.log('No playable road building card found');
        }
      }
      break;
    }

    case 'PLAY_YEAR_OF_PLENTY': {
      const playerId = (action as any).playerId || gameState.currentPlayerId;
      const resources = (action as any).resources as [ResourceType, ResourceType];
      const player = playersState.players.find(p => p.id === playerId);

      if (player && resources && resources.length === 2) {
        // Find an unplayed year of plenty card that wasn't bought this turn
        const yopCard = player.developmentCards.find(
          c => c.type === 'yearOfPlenty' && !c.isPlayed && c.turnBought !== gameState.turn
        );

        if (yopCard) {
          const [res1, res2] = resources;

          // Check bank has resources
          const sameResource = res1 === res2;
          const bankHasEnough = sameResource
            ? gameState.bank[res1] >= 2
            : gameState.bank[res1] >= 1 && gameState.bank[res2] >= 1;

          if (bankHasEnough) {
            // Mark card as played
            dispatch(markCardPlayed({ playerId, cardId: yopCard.id }));

            // Add resources to player
            const resourcesToAdd: Partial<Record<ResourceType, number>> = {};
            resourcesToAdd[res1] = (resourcesToAdd[res1] || 0) + 1;
            resourcesToAdd[res2] = (resourcesToAdd[res2] || 0) + 1;
            dispatch(addResources({ playerId, resources: resourcesToAdd }));

            // Remove from bank
            dispatch(removeFromBank(resourcesToAdd));

            console.log(`Player ${player.name} played Year of Plenty: took ${res1} and ${res2}`);
          } else {
            console.log('Bank does not have enough resources for Year of Plenty');
          }
        } else {
          console.log('No playable Year of Plenty card found');
        }
      }
      break;
    }

    case 'PLAY_MONOPOLY': {
      const playerId = (action as any).playerId || gameState.currentPlayerId;
      const resource = (action as any).resource as ResourceType;
      const player = playersState.players.find(p => p.id === playerId);

      if (player && resource) {
        // Find an unplayed monopoly card that wasn't bought this turn
        const monCard = player.developmentCards.find(
          c => c.type === 'monopoly' && !c.isPlayed && c.turnBought !== gameState.turn
        );

        if (monCard) {
          // Mark card as played
          dispatch(markCardPlayed({ playerId, cardId: monCard.id }));

          // Calculate total resources to steal from all other players
          let totalStolen = 0;
          for (const otherPlayer of playersState.players) {
            if (otherPlayer.id !== playerId) {
              const amount = otherPlayer.resources[resource];
              if (amount > 0) {
                totalStolen += amount;
                // Remove resources from other player
                dispatch(removeResources({
                  playerId: otherPlayer.id,
                  resources: { [resource]: amount },
                }));
              }
            }
          }

          // Add stolen resources to monopoly player
          if (totalStolen > 0) {
            dispatch(addResources({
              playerId,
              resources: { [resource]: totalStolen },
            }));
          }

          console.log(`Player ${player.name} played Monopoly on ${resource}: collected ${totalStolen} total`);
        } else {
          console.log('No playable Monopoly card found');
        }
      }
      break;
    }

    // ============================================================================
    // Robber-related Actions
    // ============================================================================

    case 'DISCARD_RESOURCES': {
      const playerId = (action as any).playerId;
      const resourcesToDiscard = (action as any).resources as Partial<ResourceCounts>;
      const player = playersState.players.find(p => p.id === playerId);

      if (player && resourcesToDiscard) {
        // Calculate expected discard amount
        const cardCount = Object.values(player.resources).reduce((sum, c) => sum + c, 0);
        const expectedDiscard = Math.floor(cardCount / 2);
        const actualDiscard = Object.values(resourcesToDiscard).reduce((sum, c) => sum + (c || 0), 0);

        // Validate discard amount
        if (actualDiscard !== expectedDiscard) {
          console.log(`Discard mismatch: expected ${expectedDiscard}, got ${actualDiscard}`);
          // Allow anyway for flexibility - the player may have counted differently
        }

        // Remove the discarded resources from player
        dispatch(removeResources({ playerId, resources: resourcesToDiscard }));

        // Add discarded resources back to bank
        dispatch(addToBank(resourcesToDiscard));

        // Remove this player from pending discard
        dispatch(removePendingDiscard(playerId));

        // Log the discard
        const discardedResourcesList = Object.entries(resourcesToDiscard)
          .filter(([_, amt]) => amt && amt > 0)
          .map(([res, amt]) => `${amt} ${res}`)
          .join(', ');

        dispatch(addLogEntry(createLogEntry(
          'discard',
          gameState.turn,
          `${player.name} discarded ${actualDiscard} cards (${discardedResourcesList})`,
          {
            playerId,
            playerName: player.name,
            playerColor: player.color,
            visibility: 'all',
            data: { resources: resourcesToDiscard, count: actualDiscard },
          }
        )));

        console.log(`Player ${player.name} discarded: ${discardedResourcesList}`);

        // Check if all players have finished discarding
        const updatedPendingDiscard = gameState.pendingDiscard.filter(id => id !== playerId);
        if (updatedPendingDiscard.length === 0) {
          // All done discarding, move to robber phase
          dispatch(setPhase('robber-move'));

          const currentPlayer = playersState.players.find(p => p.id === gameState.currentPlayerId);
          dispatch(addLogEntry(createLogEntry(
            'robber-move-start',
            gameState.turn,
            `${currentPlayer?.name || 'Player'} must move the robber.`,
            {
              playerId: gameState.currentPlayerId || undefined,
              playerName: currentPlayer?.name,
              playerColor: currentPlayer?.color,
              visibility: 'all',
            }
          )));

          console.log('All players have discarded. Entering robber-move phase.');
        }
      }
      break;
    }

    case 'MOVE_ROBBER': {
      const playerId = (action as any).playerId;
      const hex = (action as any).hex as HexCoord;
      const player = playersState.players.find(p => p.id === playerId);

      if (hex && player) {
        // Move the robber to the new hex
        dispatch(moveRobberAction(hex));

        // Log the robber move
        dispatch(addLogEntry(createLogEntry(
          'robber-move',
          gameState.turn,
          `${player.name} moved the robber.`,
          {
            playerId,
            playerName: player.name,
            playerColor: player.color,
            visibility: 'all',
            data: { hex },
          }
        )));

        console.log(`Robber moved to hex (${hex.q}, ${hex.r}) by ${player.name}`);

        // Find potential steal victims (players with buildings adjacent to this hex)
        const { q, r } = hex;
        const adjacentVertexKeys = [
          `${q},${r}:N`,
          `${q},${r}:S`,
          `${q - 1},${r + 1}:N`,
          `${q},${r + 1}:N`,
          `${q},${r - 1}:S`,
          `${q + 1},${r - 1}:S`,
        ];

        const potentialVictims: string[] = [];
        const seenPlayerIds = new Set<string>();

        for (const building of state.board.buildings) {
          // Skip own buildings
          if (building.playerId === playerId) continue;
          if (seenPlayerIds.has(building.playerId)) continue;

          // Check if building is on an adjacent vertex
          const buildingKey = `${building.vertex.hex.q},${building.vertex.hex.r}:${building.vertex.direction}`;
          if (!adjacentVertexKeys.includes(buildingKey)) continue;

          const victimPlayer = playersState.players.find(p => p.id === building.playerId);
          if (!victimPlayer) continue;

          // Check if victim has any cards
          const victimCardCount = Object.values(victimPlayer.resources).reduce((sum, c) => sum + c, 0);
          if (victimCardCount > 0) {
            seenPlayerIds.add(building.playerId);
            potentialVictims.push(building.playerId);
          }
        }

        if (potentialVictims.length === 0) {
          // No one to steal from, go back to main phase
          dispatch(setPhase('main'));

          dispatch(addLogEntry(createLogEntry(
            'robber-no-steal',
            gameState.turn,
            `${player.name} moved the robber but there is no one to steal from.`,
            {
              playerId,
              playerName: player.name,
              playerColor: player.color,
              visibility: 'all',
            }
          )));

          console.log('No potential victims, returning to main phase');
        } else if (potentialVictims.length === 1) {
          // Only one victim, auto-steal
          const victimId = potentialVictims[0];
          const victimPlayer = playersState.players.find(p => p.id === victimId);

          if (victimPlayer) {
            // Get victim's resources and pick a random one
            const victimResources = Object.entries(victimPlayer.resources)
              .filter(([_, amt]) => amt > 0);

            if (victimResources.length > 0) {
              // Pick a random resource
              const randomIndex = Math.floor(Math.random() * victimResources.length);
              const [stolenResource] = victimResources[randomIndex];

              // Transfer one of that resource
              dispatch(removeResources({
                playerId: victimId,
                resources: { [stolenResource]: 1 },
              }));
              dispatch(addResources({
                playerId,
                resources: { [stolenResource]: 1 },
              }));

              // Update stats
              dispatch(incrementTimesRobbed(playerId));
              dispatch(incrementTimesWasRobbed(victimId));

              // Log the steal (resource type visible only to involved parties)
              dispatch(addLogEntry(createLogEntry(
                'robber-steal',
                gameState.turn,
                `${player.name} stole 1 card from ${victimPlayer.name}.`,
                {
                  playerId,
                  playerName: player.name,
                  playerColor: player.color,
                  visibility: 'all',
                  data: { victimId, victimName: victimPlayer.name },
                }
              )));

              // Private log for the players involved showing what was stolen
              dispatch(addLogEntry(createLogEntry(
                'robber-steal-detail',
                gameState.turn,
                `${player.name} stole 1 ${stolenResource} from ${victimPlayer.name}.`,
                {
                  playerId,
                  playerName: player.name,
                  playerColor: player.color,
                  visibility: 'involved',
                  data: { victimId, resource: stolenResource },
                }
              )));

              console.log(`${player.name} stole 1 ${stolenResource} from ${victimPlayer.name}`);
            }
          }

          dispatch(setPhase('main'));
        } else {
          // Multiple potential victims, enter steal phase
          dispatch(setPhase('robber-steal'));
          console.log(`Multiple steal targets: ${potentialVictims.join(', ')}. Entering robber-steal phase.`);
        }
      }
      break;
    }

    case 'STEAL_RESOURCE': {
      const playerId = (action as any).playerId;
      const victimId = (action as any).victimId;
      const player = playersState.players.find(p => p.id === playerId);
      const victimPlayer = playersState.players.find(p => p.id === victimId);

      if (player && victimPlayer) {
        // Get victim's resources and pick a random one
        const victimResources = Object.entries(victimPlayer.resources)
          .filter(([_, amt]) => amt > 0);

        if (victimResources.length > 0) {
          // Pick a random resource
          const randomIndex = Math.floor(Math.random() * victimResources.length);
          const [stolenResource] = victimResources[randomIndex];

          // Transfer one of that resource
          dispatch(removeResources({
            playerId: victimId,
            resources: { [stolenResource]: 1 },
          }));
          dispatch(addResources({
            playerId,
            resources: { [stolenResource]: 1 },
          }));

          // Update stats
          dispatch(incrementTimesRobbed(playerId));
          dispatch(incrementTimesWasRobbed(victimId));

          // Log the steal
          dispatch(addLogEntry(createLogEntry(
            'robber-steal',
            gameState.turn,
            `${player.name} stole 1 card from ${victimPlayer.name}.`,
            {
              playerId,
              playerName: player.name,
              playerColor: player.color,
              visibility: 'all',
              data: { victimId, victimName: victimPlayer.name },
            }
          )));

          // Private log for the players involved showing what was stolen
          dispatch(addLogEntry(createLogEntry(
            'robber-steal-detail',
            gameState.turn,
            `${player.name} stole 1 ${stolenResource} from ${victimPlayer.name}.`,
            {
              playerId,
              playerName: player.name,
              playerColor: player.color,
              visibility: 'involved',
              data: { victimId, resource: stolenResource },
            }
          )));

          console.log(`${player.name} stole 1 ${stolenResource} from ${victimPlayer.name}`);
        } else {
          console.log(`${victimPlayer.name} has no resources to steal`);
        }

        // Return to main phase
        dispatch(setPhase('main'));
      }
      break;
    }

    case 'SKIP_STEAL': {
      const playerId = (action as any).playerId;
      const player = playersState.players.find(p => p.id === playerId);

      // Log skipping steal
      dispatch(addLogEntry(createLogEntry(
        'robber-skip-steal',
        gameState.turn,
        `${player?.name || 'Player'} chose not to steal.`,
        {
          playerId,
          playerName: player?.name,
          playerColor: player?.color,
          visibility: 'all',
        }
      )));

      console.log(`${player?.name} skipped stealing`);

      // Return to main phase
      dispatch(setPhase('main'));
      break;
    }

    default:
      console.log(`Applying action: ${action.type}`);
  }
}

// ============================================================================
// State Broadcasting
// ============================================================================

/**
 * Create a game state message for broadcasting
 */
export function createGameStateMessage(
  state: GameState,
  sequence: number
): HostMessage {
  return {
    type: 'GAME_STATE',
    state,
    sequence,
  };
}

/**
 * Create a lobby state message for broadcasting
 */
export function createLobbyStateMessage(state: LobbyState): HostMessage {
  return {
    type: 'LOBBY_STATE',
    state,
  };
}

/**
 * Broadcast the current state to all connected peers
 */
export function broadcastState(
  state: RootState,
  hostState: HostState,
  broadcast: BroadcastFn
): number {
  hostState.sequence++;

  // Convert RootState to GameState for network transmission
  // This would need to extract the relevant parts of the state
  const gameState = extractGameState(state);

  const message = createGameStateMessage(gameState, hostState.sequence);
  broadcast(message);

  return hostState.sequence;
}

/**
 * Extract GameState from RootState for network transmission
 */
function extractGameState(state: RootState): GameState {
  // This would combine the various slices into a single GameState object
  // Implementation depends on actual slice structure
  return {
    roomCode: '', // From lobby state
    mode: state.game.mode,
    settings: state.game.settings,
    phase: state.game.phase,
    turn: state.game.turn,
    currentPlayerId: state.game.currentPlayerId || '',
    turnTimeRemaining: state.game.turnTimeRemaining,
    tiles: [], // From board state
    buildings: [], // From board state
    roads: [], // From board state
    ports: [], // From board state
    players: [], // From players state
    turnOrder: [], // From game state
    robberLocation: { q: 0, r: 0 }, // From board state
    developmentDeckCount: state.game.developmentDeckCount,
    bank: {
      brick: 19,
      lumber: 19,
      ore: 19,
      grain: 19,
      wool: 19,
    },
    longestRoad: null,
    largestArmy: null,
    log: [], // From log state
    chat: [], // From log state
  };
}

// ============================================================================
// Player Management
// ============================================================================

/**
 * Handle a player joining the room
 */
export function handlePlayerJoin(
  player: LobbyPlayer,
  hostState: HostState,
  broadcast: BroadcastFn
): LobbyState | null {
  if (!hostState.lobbyState) {
    return null;
  }

  // Add player to lobby
  hostState.lobbyState.players.push(player);
  hostState.connectedPlayers.add(player.id);

  // Clear any disconnect timeout
  const disconnectData = hostState.disconnectedPlayers.get(player.id);
  if (disconnectData) {
    clearTimeout(disconnectData.timeout);
    hostState.disconnectedPlayers.delete(player.id);
  }

  // Broadcast player connected
  broadcast({
    type: 'PLAYER_CONNECTED',
    player,
  });

  // Broadcast updated lobby state
  broadcast({
    type: 'LOBBY_STATE',
    state: hostState.lobbyState,
  });

  return hostState.lobbyState;
}

/**
 * Handle a player leaving the room
 */
export function handlePlayerLeave(
  playerId: string,
  hostState: HostState,
  broadcast: BroadcastFn,
  disconnectTimeoutMs: number = 60000
): void {
  if (!hostState.lobbyState) {
    return;
  }

  const player = hostState.lobbyState.players.find(p => p.id === playerId);
  if (!player) {
    return;
  }

  hostState.connectedPlayers.delete(playerId);

  // Set disconnect timeout
  const timeout = setTimeout(() => {
    // Remove player from lobby after timeout
    if (hostState.lobbyState) {
      hostState.lobbyState.players = hostState.lobbyState.players.filter(
        p => p.id !== playerId
      );
      hostState.disconnectedPlayers.delete(playerId);

      // Broadcast updated lobby state
      broadcast({
        type: 'LOBBY_STATE',
        state: hostState.lobbyState,
      });
    }
  }, disconnectTimeoutMs);

  hostState.disconnectedPlayers.set(playerId, {
    timestamp: Date.now(),
    timeout,
  });

  // Mark player as disconnected
  player.isConnected = false;

  // Broadcast disconnection
  broadcast({
    type: 'PLAYER_DISCONNECTED',
    playerId,
    playerName: player.name,
    timeoutSeconds: Math.floor(disconnectTimeoutMs / 1000),
  });
}

/**
 * Handle a player reconnecting
 */
export function handlePlayerReconnect(
  playerId: string,
  hostState: HostState,
  broadcast: BroadcastFn
): boolean {
  if (!hostState.lobbyState) {
    return false;
  }

  const player = hostState.lobbyState.players.find(p => p.id === playerId);
  if (!player) {
    return false;
  }

  // Clear disconnect timeout
  const disconnectData = hostState.disconnectedPlayers.get(playerId);
  if (disconnectData) {
    clearTimeout(disconnectData.timeout);
    hostState.disconnectedPlayers.delete(playerId);
  }

  // Mark as connected
  player.isConnected = true;
  hostState.connectedPlayers.add(playerId);

  // Broadcast reconnection
  broadcast({
    type: 'PLAYER_RECONNECTED',
    playerId,
    playerName: player.name,
  });

  return true;
}

// ============================================================================
// Host Migration
// ============================================================================

/**
 * Migrate host role to a new player
 * Called when current host disconnects
 */
export function migrateHost(
  newHostId: string,
  hostState: HostState,
  broadcast: BroadcastFn
): boolean {
  if (!hostState.lobbyState) {
    return false;
  }

  const previousHostId = hostState.lobbyState.hostId;
  const newHost = hostState.lobbyState.players.find(p => p.id === newHostId);

  if (!newHost) {
    return false;
  }

  // Update host in lobby state
  const previousHost = hostState.lobbyState.players.find(p => p.id === previousHostId);
  if (previousHost) {
    previousHost.isHost = false;
  }

  newHost.isHost = true;
  hostState.lobbyState.hostId = newHostId;

  // Broadcast host migration
  broadcast({
    type: 'HOST_MIGRATED',
    newHostId,
    newHostName: newHost.name,
    previousHostId,
  });

  return true;
}

/**
 * Select the next host from connected players
 * Uses join order to determine priority
 */
export function selectNextHost(hostState: HostState): string | null {
  if (!hostState.lobbyState) {
    return null;
  }

  // Find the next connected player by join order
  const connectedPlayers = hostState.lobbyState.players
    .filter(p => p.isConnected && hostState.connectedPlayers.has(p.id))
    .sort((a, b) => a.joinOrder - b.joinOrder);

  if (connectedPlayers.length === 0) {
    return null;
  }

  return connectedPlayers[0].id;
}

// ============================================================================
// Lobby Management
// ============================================================================

/**
 * Initialize lobby state when creating a room
 */
export function initializeLobbyState(
  roomCode: string,
  hostPlayer: LobbyPlayer,
  settings: GameSettings
): LobbyState {
  return {
    roomCode,
    hostId: hostPlayer.id,
    players: [hostPlayer],
    settings,
    isStarting: false,
  };
}

/**
 * Update lobby settings (host only)
 */
export function updateLobbySettings(
  settings: Partial<GameSettings>,
  hostState: HostState,
  broadcast: BroadcastFn
): LobbyState | null {
  if (!hostState.lobbyState) {
    return null;
  }

  hostState.lobbyState.settings = {
    ...hostState.lobbyState.settings,
    ...settings,
  };

  broadcast({
    type: 'LOBBY_STATE',
    state: hostState.lobbyState,
  });

  return hostState.lobbyState;
}

/**
 * Handle player color selection
 */
export function handleColorSelection(
  playerId: string,
  color: PlayerColor,
  hostState: HostState,
  broadcast: BroadcastFn
): boolean {
  if (!hostState.lobbyState) {
    return false;
  }

  // Check if color is already taken
  const colorTaken = hostState.lobbyState.players.some(
    p => p.id !== playerId && p.color === color
  );

  if (colorTaken) {
    return false;
  }

  const player = hostState.lobbyState.players.find(p => p.id === playerId);
  if (!player) {
    return false;
  }

  player.color = color;

  broadcast({
    type: 'LOBBY_STATE',
    state: hostState.lobbyState,
  });

  return true;
}

/**
 * Handle player ready status change
 */
export function handleReadyStatus(
  playerId: string,
  isReady: boolean,
  hostState: HostState,
  broadcast: BroadcastFn
): void {
  if (!hostState.lobbyState) {
    return;
  }

  const player = hostState.lobbyState.players.find(p => p.id === playerId);
  if (!player) {
    return;
  }

  player.isReady = isReady;

  broadcast({
    type: 'LOBBY_STATE',
    state: hostState.lobbyState,
  });
}

/**
 * Check if game can start (all players ready, valid player count)
 */
export function canStartGame(hostState: HostState): boolean {
  if (!hostState.lobbyState) {
    return false;
  }

  const { players, settings } = hostState.lobbyState;

  // Check minimum players
  if (players.length < 3) {
    return false;
  }

  // Check maximum players
  if (players.length > settings.playerCount) {
    return false;
  }

  // Check all players have colors and are ready
  const allReady = players.every(p => p.color !== null && p.isReady);

  return allReady;
}
