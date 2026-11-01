/**
 * OpenCatan PartyKit Server Types
 *
 * This file defines the server-side types for room management and player connections.
 * These types are used internally by the PartyKit server and complement the client-side
 * types defined in the main application.
 */

// =============================================================================
// PLAYER COLORS
// =============================================================================

/**
 * Available player colors - matches client-side PlayerColor type.
 * 12 colors available to avoid confusion between similar shades.
 */
export type PlayerColor =
  | 'red' | 'blue' | 'orange' | 'white'
  | 'green' | 'purple' | 'black' | 'bronze'
  | 'gold' | 'silver' | 'pink' | 'mysticblue';

// =============================================================================
// PLAYER CONNECTION
// =============================================================================

/**
 * Represents a connected player in the room.
 *
 * The session token is critical for reconnection:
 * - Stored in player's localStorage on the client
 * - Used to identify returning players after disconnect
 * - Links player to their seat (color, position, game state)
 */
export interface PlayerConnection {
  /** Unique identifier for this player (matches PartyKit connection ID) */
  id: string;

  /** Display name chosen by the player */
  name: string;

  /** Player's chosen color (first-come first-served) */
  color: PlayerColor | null;

  /** Persistent token for reconnection (stored in client localStorage) */
  sessionToken: string;

  /** Whether player is currently connected */
  isConnected: boolean;

  /** Whether player has marked themselves as ready in lobby */
  isReady: boolean;

  /** Order in which player joined (used for host migration) */
  joinOrder: number;

  /** Timestamp of last activity (for timeout detection) */
  lastSeen: number;
}

// =============================================================================
// ROOM STATE
// =============================================================================

/**
 * Server-side room state managed by PartyKit.
 *
 * This state is authoritative for connection management and lobby state.
 * Game state is managed separately by the host's browser.
 */
export interface RoomState {
  gameId?: string;
  /** 6-character alphanumeric room code */
  roomCode: string;

  /** ID of the current host player (runs game logic) */
  hostId: string | null;

  /** All players in the room (connected or disconnected with valid session) */
  players: Map<string, PlayerConnection>;

  /** Whether the game has started (prevents new joins) */
  gameStarted: boolean;

  /** Timestamp of room creation */
  createdAt: number;

  /** Timestamp of last activity (for room expiration) */
  lastActivity: number;

  /** Counter for assigning join order */
  joinOrderCounter: number;

  /** Game settings configured by host (passed to clients) */
  gameSettings: GameSettings;
}

/**
 * Game settings configurable in the lobby.
 * Host can modify these until the game starts.
 */
export interface GameSettings {
  /** Game mode selection */
  mode: 'base' | 'cities-knights' | 'seafarers';

  /** Maximum players (2-8) */
  maxPlayers: number;

  /** Victory point target (1-20) */
  victoryPoints: number;

  /** Turn timer in seconds (15-300, or 0 = unlimited) */
  turnTimer: number;

  /** Hand size before forced discard on 7 (5-15) */
  discardLimit: number;

  /** Map preset or random */
  mapType: 'random' | string;

  /** Friendly robber rule enabled */
  friendlyRobber: boolean;

  /** Hide bank card counts (show ? instead) */
  hideBankCards: boolean;
}

// =============================================================================
// CLIENT -> SERVER MESSAGES
// =============================================================================

/**
 * Messages sent from clients to the PartyKit server.
 * These are relayed to the host for validation when appropriate.
 */
export type ClientMessage =
  | import("../src/session/protocol").SessionClientMessage
  | JoinRoomMessage
  | SelectColorMessage
  | MarkReadyMessage
  | UnmarkReadyMessage
  | UpdateSettingsMessage
  | StartGameMessage
  | GameActionMessage
  | ChatMessage
  | LeaveRoomMessage
  | ReconnectMessage
  | HostGameStateMessage;

/** Player requests to join the room */
export interface JoinRoomMessage {
  type: 'JOIN_ROOM';
  playerName: string;
  /** Optional: existing session token for reconnection */
  sessionToken?: string;
}

/** Player selects a color */
export interface SelectColorMessage {
  type: 'SELECT_COLOR';
  color: PlayerColor;
}

/** Player marks themselves as ready */
export interface MarkReadyMessage {
  type: 'MARK_READY';
}

/** Player unmarks ready status */
export interface UnmarkReadyMessage {
  type: 'UNMARK_READY';
}

/** Host updates game settings */
export interface UpdateSettingsMessage {
  type: 'UPDATE_SETTINGS';
  settings: Partial<GameSettings>;
}

/** Host starts the game */
export interface StartGameMessage {
  type: 'START_GAME';
}

/**
 * Game action during active gameplay.
 * These are relayed to the host for validation.
 * The host's browser runs the authoritative game engine.
 */
export interface GameActionMessage {
  type: 'GAME_ACTION';
  action: GameAction;
}

/** Chat message from a player */
export interface ChatMessage {
  type: 'CHAT_MESSAGE';
  text: string;
}

/** Player explicitly leaves the room */
export interface LeaveRoomMessage {
  type: 'LEAVE_ROOM';
}

/** Player attempts to reconnect with session token */
export interface ReconnectMessage {
  type: 'RECONNECT';
  sessionToken: string;
}

/**
 * Host sends game state to server for broadcast to all peers.
 * Only the host can send this message.
 */
export interface HostGameStateMessage {
  type: 'GAME_STATE';
  state: unknown; // Full GameState from client types
}

// =============================================================================
// SERVER -> CLIENT MESSAGES
// =============================================================================

/**
 * Messages sent from the PartyKit server to clients.
 * These include both server-originated messages and relayed host messages.
 */
export type ServerMessage =
  | import("../src/session/protocol").SessionServerMessage
  | WelcomeMessage
  | LobbyStateMessage
  | GameStateMessage
  | ActionResultMessage
  | ChatBroadcastMessage
  | PlayerConnectedMessage
  | PlayerDisconnectedMessage
  | HostMigratedMessage
  | ErrorMessage
  | GameStartedMessage
  | RelayedGameActionMessage;

/** Sent to newly connected player with their session info */
export interface WelcomeMessage {
  type: 'WELCOME';
  playerId: string;
  sessionToken: string;
  roomCode: string;
  isHost: boolean;
}

/** Broadcast lobby state to all players */
export interface LobbyStateMessage {
  type: 'LOBBY_STATE';
  state: LobbyState;
}

/** Host broadcasts validated game state to all peers */
export interface GameStateMessage {
  type: 'GAME_STATE';
  state: unknown; // Full GameState from client types
}

/** Host responds to a game action */
export interface ActionResultMessage {
  type: 'ACTION_RESULT';
  success: boolean;
  error?: string;
  /** Original action for client-side correlation */
  actionType?: string;
}

/** Chat message broadcast to all players */
export interface ChatBroadcastMessage {
  type: 'CHAT_BROADCAST';
  from: string;
  fromName: string;
  fromColor: PlayerColor | null;
  text: string;
  timestamp: number;
}

/** Player connected notification */
export interface PlayerConnectedMessage {
  type: 'PLAYER_CONNECTED';
  playerId: string;
  playerName: string;
  isReconnect: boolean;
}

/** Player disconnected notification */
export interface PlayerDisconnectedMessage {
  type: 'PLAYER_DISCONNECTED';
  playerId: string;
  playerName: string;
}

/** Host has migrated to a new player */
export interface HostMigratedMessage {
  type: 'HOST_MIGRATED';
  newHostId: string;
  newHostName: string;
}

/** Error message for the requesting client */
export interface ErrorMessage {
  type: 'ERROR';
  message: string;
  code?: string;
}

/** Game has started - no more joins allowed */
export interface GameStartedMessage {
  type: 'GAME_STARTED';
  gameId: string;
  turnOrder: string[];
}

/**
 * Game action relayed from a peer to the host.
 * Server adds the playerId to ensure it cannot be spoofed.
 */
export interface RelayedGameActionMessage {
  type: 'GAME_ACTION';
  action: GameAction & { playerId: string };
}

// =============================================================================
// LOBBY STATE
// =============================================================================

/**
 * Lobby state broadcast to all connected players.
 * This is the public view of the room before game starts.
 */
export interface LobbyState {
  gameStarted: boolean;
  gameId?: string;
  /** Room code for sharing */
  roomCode: string;

  /** Current players in the lobby */
  players: LobbyPlayer[];

  /** ID of the host player */
  hostId: string;

  /** Current game settings */
  settings: GameSettings;

  /** Whether all players are ready (host can start) */
  allReady: boolean;

  /** Colors that are already taken */
  takenColors: PlayerColor[];
}

/**
 * Player info visible in the lobby.
 * Limited view compared to full PlayerConnection.
 */
export interface LobbyPlayer {
  id: string;
  name: string;
  color: PlayerColor | null;
  isReady: boolean;
  isHost: boolean;
  isConnected: boolean;
}

// =============================================================================
// GAME ACTIONS
// =============================================================================

/**
 * Game actions that can be performed during gameplay.
 * These are validated by the host's game engine.
 *
 * This is a placeholder - the full action types are defined
 * in the client-side game engine types.
 */
export interface GameAction {
  /** Type of action being performed */
  actionType: string;

  /** Action-specific payload */
  payload: unknown;

  /** Player performing the action */
  playerId: string;

  /** Timestamp for ordering */
  timestamp: number;
}

// =============================================================================
// ROOM MANAGEMENT
// =============================================================================

/**
 * Reconnection timeout in milliseconds.
 * Players have this long to reconnect before their seat is released.
 */
export const RECONNECT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Room expiration timeout in milliseconds.
 * Rooms are deleted after this much inactivity.
 */
export const ROOM_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Minimum players required to start a game.
 */
export const MIN_PLAYERS = 2;

/**
 * Maximum players in any game mode.
 */
export const MAX_PLAYERS = 6;
