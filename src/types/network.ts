/**
 * Network Message Type Definitions for OpenCatan
 *
 * Defines all messages sent between clients, host, and PartyKit server.
 */

import type { PlayerColor } from './common';
import type { GameState, GameAction, GameSettings, LogEntry, ChatMessage } from './game';

// --- Lobby Types ---

/**
 * State of the game lobby before game starts
 */
export interface LobbyState {
  gameStarted?: boolean;
  gameId?: string;
  /** Room code for this lobby */
  roomCode: string;
  /** Current game settings */
  settings: GameSettings;
  /** Players currently in the lobby */
  players: LobbyPlayer[];
  /** ID of the host player */
  hostId: string;
  /** Whether the game is ready to start (all players ready) */
  canStart: boolean;
  /** Timestamp of lobby creation */
  createdAt: number;
  /** Timestamp of last activity */
  lastActivity: number;
}

/**
 * Player state in the lobby (simplified from full Player)
 */
export interface LobbyPlayer {
  /** Player's unique ID */
  id: string;
  /** Player's display name */
  name: string;
  /** Selected color */
  color: PlayerColor;
  /** Whether player is ready */
  isReady: boolean;
  /** Whether this player is the host */
  isHost: boolean;
  /** Whether player is connected */
  isConnected: boolean;
  /** Timestamp when player joined */
  joinedAt: number;
}

// --- Log Entry Types ---

/**
 * Types of game log entries
 */
export type LogEntryType =
  // Dice and resources
  | 'dice-roll'
  | 'resource-gain'
  | 'resource-loss'
  | 'discard'

  // Robber/Pirate
  | 'robber-activated'
  | 'robber-move'
  | 'robber-move-start'
  | 'robber-moved'
  | 'robber-no-steal'
  | 'robber-steal'
  | 'robber-steal-detail'
  | 'robber-skip-steal'
  | 'pirate-move'
  | 'pirate-moved'
  | 'stolen'

  // Building
  | 'build'
  | 'built-road'
  | 'built-ship'
  | 'built-settlement'
  | 'built-city'
  | 'built-city-wall'
  | 'moved-ship'

  // Cards
  | 'bought-dev-card'
  | 'dev-card-played'
  | 'played-knight'
  | 'played-road-building'
  | 'played-year-of-plenty'
  | 'played-monopoly'
  | 'received-progress-card'
  | 'played-progress-card'

  // Trading
  | 'trade-offer'
  | 'trade-offered'
  | 'trade-accept'
  | 'trade-accepted'
  | 'trade-decline'
  | 'trade-declined'
  | 'trade-cancel'
  | 'trade-canceled'
  | 'trade-counter'
  | 'bank-trade'

  // Achievements
  | 'longest-road'
  | 'largest-army'
  | 'defender-of-catan'
  | 'metropolis-built'

  // C&K specific
  | 'knight-built'
  | 'knight-activated'
  | 'knight-upgraded'
  | 'knight-moved'
  | 'city-improved'
  | 'barbarian-advance'
  | 'barbarian-attack'
  | 'barbarian-victory'
  | 'barbarian-defeat'

  // Game flow
  | 'turn-started'
  | 'turn-ended'
  | 'turn-timeout'
  | 'player-connected'
  | 'player-disconnected'
  | 'host-migrated'
  | 'game-started'
  | 'game-ended';

/**
 * Visibility level for log entries
 */
export type LogVisibility =
  | 'public'   // Visible to all players
  | 'private'  // Visible only to specific player(s)
  | 'hidden';  // Not shown in log (internal only)

/**
 * Extended log entry with visibility (for network use)
 */
export interface NetworkLogEntry extends LogEntry {
  /** Visibility of this log entry */
  visibility: LogVisibility;
  /** Player IDs who can see this entry (if visibility is 'private') */
  visibleTo?: string[];
  /** Secondary player involved (if any) */
  targetPlayerId?: string;
}

/**
 * Extended chat message with player info (for network use)
 */
export interface NetworkChatMessage extends ChatMessage {
  /** Player's name at time of sending */
  playerName: string;
  /** Player's color at time of sending */
  playerColor: PlayerColor;
}

// --- Client Messages (Client -> PartyKit -> Host) ---

/**
 * Messages sent from client to the game
 */
export type ClientMessage =
  | import("../session/protocol").SessionClientMessage
  // Lobby actions
  | {
      type: 'JOIN_ROOM';
      playerName: string;
      sessionToken?: string; // For reconnection
    }
  | {
      type: 'SELECT_COLOR';
      color: PlayerColor;
    }
  | {
      type: 'MARK_READY';
    }
  | {
      type: 'MARK_NOT_READY';
    }
  | {
      type: 'UPDATE_SETTINGS';
      settings: Partial<GameSettings>;
    }
  | {
      type: 'START_GAME';
    }
  | {
      type: 'LEAVE_ROOM';
    }

  // Game actions
  | {
      type: 'GAME_ACTION';
      action: GameAction;
    }

  // Chat
  | {
      type: 'CHAT_MESSAGE';
      text: string;
    }

  // Connection
  | {
      type: 'PING';
      timestamp: number;
    }
  | {
      type: 'REQUEST_STATE';
    };

// --- Host Messages (Host -> PartyKit -> Clients) ---

/**
 * Messages sent from host to clients
 */
export type HostMessage =
  | import("../session/protocol").SessionServerMessage
  // Lobby state
  | {
      type: 'LOBBY_STATE';
      state: LobbyState;
    }
  | {
      type: 'LOBBY_UPDATE';
      players: LobbyPlayer[];
      settings?: GameSettings;
    }
  | {
      type: 'PLAYER_JOINED';
      player: LobbyPlayer;
    }
  | {
      type: 'PLAYER_LEFT';
      playerId: string;
    }
  | {
      type: 'PLAYER_UPDATED';
      player: LobbyPlayer;
    }

  // Game state
  | {
      type: 'GAME_STATE';
      state: GameState;
    }
  | {
      type: 'GAME_STATE_DIFF';
      version: number;
      diff: Partial<GameState>;
    }

  // Action results
  | {
      type: 'ACTION_RESULT';
      success: boolean;
      error?: string;
      actionType: string;
    }

  // Chat
  | {
      type: 'CHAT_BROADCAST';
      message: NetworkChatMessage;
    }

  // Log
  | {
      type: 'LOG_ENTRY';
      entry: NetworkLogEntry;
    }
  | {
      type: 'LOG_ENTRIES';
      entries: NetworkLogEntry[];
    }

  // Connection events
  | {
      type: 'PLAYER_CONNECTED';
      playerId: string;
    }
  | {
      type: 'PLAYER_DISCONNECTED';
      playerId: string;
      timeout: number; // Seconds until kicked
    }
  | {
      type: 'PLAYER_RECONNECTED';
      playerId: string;
    }
  | {
      type: 'HOST_MIGRATED';
      newHostId: string;
    }

  // Timing
  | {
      type: 'TIMER_UPDATE';
      timeRemaining: number;
    }
  | {
      type: 'PONG';
      timestamp: number;
      serverTime: number;
    }

  // Errors
  | {
      type: 'ERROR';
      code: ErrorCode;
      message: string;
    }

  // Game events
  | {
      type: 'GAME_STARTED';
      gameId: string;
      turnOrder: string[];
    }
  | {
      type: 'GAME_ENDED';
      winnerId: string;
      finalScores: Record<string, number>;
    };

// --- PartyKit Server Messages ---

/**
 * Internal messages handled by PartyKit server
 */
export type ServerMessage =
  | { type: 'WELCOME'; playerId: string; sessionToken: string; roomCode: string; isHost: boolean }
  | {
      type: 'ROOM_CREATED';
      roomCode: string;
      hostId: string;
    }
  | {
      type: 'ROOM_JOINED';
      roomCode: string;
      playerId: string;
      sessionToken: string;
    }
  | {
      type: 'ROOM_NOT_FOUND';
      roomCode: string;
    }
  | {
      type: 'ROOM_FULL';
      roomCode: string;
    }
  | {
      type: 'ROOM_EXPIRED';
      roomCode: string;
    }
  | {
      type: 'NAME_TAKEN';
      name: string;
    }
  | {
      type: 'COLOR_TAKEN';
      color: PlayerColor;
    }
  | {
      type: 'CONNECTION_ESTABLISHED';
      playerId: string;
      sessionToken: string;
    };

// --- Error Codes ---

/**
 * Error codes for client-facing errors
 */
export type ErrorCode =
  // Room errors
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_EXPIRED'
  | 'ROOM_IN_PROGRESS'

  // Player errors
  | 'NAME_REQUIRED'
  | 'NAME_TAKEN'
  | 'COLOR_TAKEN'
  | 'NOT_YOUR_TURN'
  | 'NOT_HOST'

  // Action errors
  | 'INVALID_ACTION'
  | 'INVALID_PHASE'
  | 'INSUFFICIENT_RESOURCES'
  | 'INVALID_PLACEMENT'
  | 'PIECE_LIMIT_REACHED'

  // Connection errors
  | 'CONNECTION_LOST'
  | 'RECONNECT_FAILED'
  | 'SESSION_EXPIRED'

  // Generic
  | 'UNKNOWN_ERROR';

/**
 * Connection state for a client
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

/**
 * Client connection information
 */
export interface ConnectionInfo {
  /** Current connection state */
  state: ConnectionState;
  /** Player ID (assigned by server) */
  playerId?: string;
  /** Session token for reconnection */
  sessionToken?: string;
  /** Room code */
  roomCode?: string;
  /** Last successful ping time (ms) */
  latency?: number;
  /** Timestamp of last successful communication */
  lastPing?: number;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
}

/**
 * Room creation options
 */
export interface CreateRoomOptions {
  /** Host player's display name */
  hostName: string;
  /** Initial game settings */
  settings?: Partial<GameSettings>;
}

/**
 * Room join options
 */
export interface JoinRoomOptions {
  /** Room code to join */
  roomCode: string;
  /** Player's display name */
  playerName: string;
  /** Session token for reconnection (optional) */
  sessionToken?: string;
}

/**
 * Room code configuration
 */
export const ROOM_CODE_CONFIG = {
  /** Length of room codes */
  length: 6,
  /** Characters to use (excluding ambiguous: 0/O, 1/I/L) */
  characters: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  /** Room expiration time in milliseconds */
  expirationMs: 30 * 60 * 1000, // 30 minutes
  /** Reconnection timeout in milliseconds */
  reconnectTimeoutMs: 60 * 1000, // 1 minute
} as const;
