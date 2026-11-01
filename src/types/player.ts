/**
 * Player Type Definitions for OpenCatan
 *
 * Defines player state, settings, and piece tracking.
 */

import type { ResourceType, CommodityType, PlayerColor, ResourceCounts, CommodityCounts } from './common';
import type { DevelopmentCard, ProgressCard } from './cards';

/**
 * City improvement levels for Cities & Knights expansion
 * Each discipline (trade, politics, science) can be upgraded 0-5
 */
export interface CityImprovements {
  trade: number;    // 0-5, produces cloth at city
  politics: number; // 0-5, produces coins at city
  science: number;  // 0-5, produces paper at city
}

/**
 * Player-specific settings that persist per session
 */
export interface PlayerSettings {
  /** Master volume level (0-100) */
  volume: number;
  /** Whether sound is muted */
  isMuted: boolean;
  /** Whether to show building costs tooltip */
  showBuildingCosts: boolean;
  /** Whether to enable trade notifications */
  tradeNotifications: boolean;
}

/**
 * Default player settings
 */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  volume: 80,
  isMuted: false,
  showBuildingCosts: true,
  tradeNotifications: true,
};

/**
 * Complete player state during a game
 */
export interface Player {
  /** Public counts on recipient-specific views; hidden hands remain empty. */
  resourceCount?: number;
  devCardCount?: number;
  /** Unique identifier for the player */
  id: string;

  /** Display name chosen by the player */
  name: string;

  /** Player's chosen color */
  color: PlayerColor;

  /** Whether the player is currently connected to the game */
  isConnected: boolean;

  /** Whether this player is the host (game authority) */
  isHost: boolean;

  /** Whether the player is ready in the lobby */
  isReady: boolean;

  /** Session token for reconnection */
  sessionToken: string;

  // --- Resources ---

  /** Current resource cards in hand */
  resources: ResourceCounts;

  /** Current commodity cards in hand (C&K only) */
  commodities?: CommodityCounts;

  // --- Cards ---

  /** Development cards in hand */
  developmentCards: DevelopmentCard[];

  /** Progress cards in hand (C&K only) */
  progressCards?: ProgressCard[];

  /** Whether player has played a development card this turn */
  hasPlayedDevCard: boolean;
  /** Alias for hasPlayedDevCard */
  hasPlayedDevCardThisTurn?: boolean;

  /** Development cards bought this turn (cannot be played same turn) */
  devCardsBoughtThisTurn: string[];

  // --- Pieces Remaining ---

  /** Number of roads left to build (starts at 15) */
  roadsRemaining: number;

  /** Number of settlements left to build (starts at 5) */
  settlementsRemaining: number;

  /** Number of cities left to build (starts at 4) */
  citiesRemaining: number;

  /** Number of ships left to build (Seafarers, starts at 15) */
  shipsRemaining?: number;

  /** Number of knights left to build (C&K) */
  knightsRemaining?: {
    basic: number;
    strong: number;
    mighty: number;
  };

  /** Number of city walls remaining (C&K, starts at 3) */
  cityWallsRemaining?: number;

  // --- Achievements ---

  /** Current longest road length for this player */
  longestRoadLength: number;

  /** Number of knight cards played (for Largest Army) */
  armySize: number;

  /** Number of times this player defended against barbarians (C&K) */
  defenderPoints?: number;

  // --- C&K Specific ---

  /** City improvement levels (C&K only) */
  cityImprovements?: CityImprovements;

  // --- Statistics ---

  /** Total resources collected this game */
  totalResourcesCollected: number;

  /** Total trades made this game */
  totalTradesMade: number;

  /** Number of times robbed other players */
  timesRobbed: number;

  /** Number of times was robbed by others */
  timesWasRobbed: number;
}

/**
 * Creates a new player with default values
 */
export function createPlayer(
  id: string,
  name: string,
  color: PlayerColor,
  isHost: boolean = false
): Player {
  return {
    id,
    name,
    color,
    isConnected: true,
    isHost,
    isReady: false,
    sessionToken: '',
    resources: {
      brick: 0,
      lumber: 0,
      ore: 0,
      grain: 0,
      wool: 0,
    },
    developmentCards: [],
    hasPlayedDevCard: false,
    devCardsBoughtThisTurn: [],
    roadsRemaining: 15,
    settlementsRemaining: 5,
    citiesRemaining: 4,
    longestRoadLength: 0,
    armySize: 0,
    totalResourcesCollected: 0,
    totalTradesMade: 0,
    timesRobbed: 0,
    timesWasRobbed: 0,
  };
}

/**
 * Calculates visible victory points for a player
 * (excludes hidden VP from development cards)
 * Note: Actual calculation depends on buildings stored in GameState
 */
export function getVisibleVictoryPoints(_player: Player): number {
  // This is a placeholder - actual calculation requires building data
  // from GameState which is not available in this scope
  return 0;
}

/**
 * Player piece limits
 */
export const PLAYER_PIECE_LIMITS = {
  roads: 15,
  settlements: 5,
  cities: 4,
  ships: 15, // Seafarers
  cityWalls: 3, // C&K
  knights: {
    basic: 2,
    strong: 2,
    mighty: 2,
  },
} as const;

/**
 * Creates an empty resource counts object
 */
export function createEmptyResources(): ResourceCounts {
  return {
    brick: 0,
    lumber: 0,
    ore: 0,
    grain: 0,
    wool: 0,
  };
}

/**
 * Creates an empty commodity counts object (C&K)
 */
export function createEmptyCommodities(): CommodityCounts {
  return {
    cloth: 0,
    coin: 0,
    paper: 0,
  };
}

/**
 * Calculates the total number of resources in a player's hand
 */
export function getTotalResources(resources: ResourceCounts): number {
  return resources.brick + resources.lumber + resources.ore + resources.grain + resources.wool;
}

/**
 * Calculates the total number of commodities in a player's hand
 */
export function getTotalCommodities(commodities: CommodityCounts): number {
  return commodities.cloth + commodities.coin + commodities.paper;
}

/**
 * Starting resources in the bank for a standard game
 */
export const INITIAL_BANK_RESOURCES: ResourceCounts = {
  brick: 19,
  lumber: 19,
  ore: 19,
  grain: 19,
  wool: 19,
};
