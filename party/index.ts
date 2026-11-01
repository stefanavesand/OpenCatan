import { isCommand } from "../src/session/protocol";
/**
 * OpenCatan PartyKit Server
 *
 * This is the main PartyKit server that handles real-time communication for OpenCatan.
 *
 * =============================================================================
 * ARCHITECTURE: HOST-AUTHORITY MODEL
 * =============================================================================
 *
 * OpenCatan uses a host-authority model where one player's browser runs the
 * authoritative game logic. This design offers several benefits:
 *
 * 1. **Reduced Server Complexity**: The PartyKit server only handles message
 *    routing and connection management, not game rules.
 *
 * 2. **Client-Side Game Engine**: All game logic runs in the browser, making
 *    development and debugging easier.
 *
 * 3. **Offline Development**: The game engine can be tested without a server.
 *
 * 4. **Scalability**: PartyKit handles WebSocket infrastructure; we don't need
 *    to worry about scaling game logic servers.
 *
 * MESSAGE FLOW:
 *
 *   Player Action                PartyKit Server              Host Browser
 *        |                             |                           |
 *        |--- GAME_ACTION ------------>|                           |
 *        |                             |--- relay action --------->|
 *        |                             |                           |
 *        |                             |                    [validate action]
 *        |                             |                    [update state]
 *        |                             |                           |
 *        |                             |<-- GAME_STATE ------------|
 *        |<-- broadcast state ---------|                           |
 *        |                             |                           |
 *
 * The host browser:
 * - Receives all game actions from peers
 * - Validates actions against game rules
 * - Updates the authoritative game state
 * - Broadcasts the new state to all players
 *
 * Peers (non-host players):
 * - Send actions to the server (which relays to host)
 * - Receive state updates from the host
 * - Use optimistic UI updates for responsiveness
 * - Rollback if action is rejected
 *
 * =============================================================================
 * HOST MIGRATION
 * =============================================================================
 *
 * If the host disconnects, we need to promote a new host:
 *
 * 1. Server detects host disconnection
 * 2. Server selects new host (next player by join order)
 * 3. Server broadcasts HOST_MIGRATED message
 * 4. New host's browser takes over game engine responsibilities
 * 5. New host broadcasts current game state to confirm authority
 *
 * The game state is preserved because:
 * - All clients receive state updates
 * - The new host already has the full game state
 * - No state is stored server-side (stateless design)
 *
 * =============================================================================
 * RECONNECTION
 * =============================================================================
 *
 * Players can reconnect after disconnection:
 *
 * 1. Client stores session token in localStorage
 * 2. On reconnect, client sends RECONNECT with token
 * 3. Server validates token against stored player data
 * 4. If valid, player is restored to their seat
 * 5. Player receives current game state
 *
 * Reconnection window is limited (default 60 seconds) to prevent
 * stale sessions from blocking games.
 *
 * =============================================================================
 */

import type * as Party from "partykit/server";
import type {
  RoomState,
  PlayerConnection,
  ClientMessage,
  ServerMessage,
  LobbyState,
  LobbyPlayer,
  GameSettings,
  PlayerColor,
} from "./types";
import {
  generateSessionToken,
  generatePlayerId,
  validatePlayerName,
  parseMessage,
  stringifyMessage,
  createLogger,
  now,
  shuffle,
} from "./utils";

// =============================================================================
// PLAYER COLORS
// =============================================================================

/**
 * All available player colors for auto-assignment.
 */
const ALL_PLAYER_COLORS: PlayerColor[] = [
  'red', 'blue', 'orange', 'white',
  'green', 'purple', 'black', 'bronze',
  'gold', 'silver', 'pink', 'mysticblue'
];

// =============================================================================
// DEFAULT SETTINGS
// =============================================================================

/**
 * Default game settings for new rooms.
 */
const DEFAULT_GAME_SETTINGS: GameSettings = {
  mode: 'base',
  maxPlayers: 4,
  victoryPoints: 10,
  turnTimer: 90,
  discardLimit: 7,
  mapType: 'random',
  friendlyRobber: false,
  hideBankCards: false,
};

/**
 * Timeout for reconnection (30 seconds as per requirements).
 */
const RECONNECT_TIMEOUT = 30000;

/**
 * Minimum players to start a game.
 * TODO: Change back to 2 for production
 */
const MIN_PLAYERS_TO_START = 1;

/**
 * Room expiration timeout (30 minutes of inactivity).
 */
const ROOM_EXPIRATION_TIMEOUT = 30 * 60 * 1000;

// =============================================================================
// PARTYKIT SERVER
// =============================================================================

/**
 * Main PartyKit server class for OpenCatan room management.
 *
 * Each room is an independent PartyKit "party" instance.
 * The room ID in the URL becomes the room code.
 */
export default class OpenCatanServer implements Party.Server {
  /** PartyKit room reference */
  readonly room: Party.Room;

  /** Room state tracking all players and game status */
  private state: RoomState;

  /** Logger for this room */
  private log: ReturnType<typeof createLogger>;

  /** Timeout handles for reconnection windows */
  private reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /** Timeout handle for room expiration */
  private roomExpirationTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(room: Party.Room) {
    this.room = room;

    // Initialize room state
    // The room code comes from the room ID (set when client creates/joins room)
    const roomCode = room.id.toUpperCase();

    this.state = {
      roomCode,
      hostId: null,
      players: new Map(),
      gameStarted: false,
      createdAt: now(),
      lastActivity: now(),
      joinOrderCounter: 0,
      gameSettings: { ...DEFAULT_GAME_SETTINGS },
    };

    this.log = createLogger(roomCode);
    this.log.info('Room created');

    // Start room expiration timer
    this.resetRoomExpirationTimer();
  }

  // ===========================================================================
  // CONNECTION LIFECYCLE
  // ===========================================================================

  /**
   * Called when a new WebSocket connection is established.
   *
   * At this point, we don't know who the player is yet.
   * They need to send a JOIN_ROOM or RECONNECT message.
   */
  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    this.log.info(`Connection opened: ${conn.id}`);
    this.updateActivity();

    // We wait for the client to send a JOIN_ROOM or RECONNECT message
    // The connection is just a socket at this point
  }

  /**
   * Called when a WebSocket connection is closed.
   *
   * This triggers:
   * - Disconnection notifications to other players
   * - Reconnection timeout start
   * - Host migration if the host disconnected
   */
  async onClose(conn: Party.Connection) {
    this.log.info(`Connection closed: ${conn.id}`);

    // Find the player associated with this connection
    const player = this.findPlayerByConnectionId(conn.id);

    if (!player) {
      // Connection was never fully joined, nothing to do
      return;
    }

    this.log.info(`Player ${player.name} disconnected`);

    // Mark player as disconnected (but keep their data for reconnection)
    player.isConnected = false;
    player.lastSeen = now();

    // Notify other players
    this.broadcast({
      type: 'PLAYER_DISCONNECTED',
      playerId: player.id,
      playerName: player.name,
    }, conn.id);

    // Start reconnection timeout
    this.startReconnectTimeout(player.id);

    // If this was the host, migrate to a new host
    if (player.id === this.state.hostId) {
      await this.migrateHost();
    }

    // Broadcast updated lobby state
    this.broadcastLobbyState();
  }

  /**
   * Called when a message is received from a client.
   *
   * This is the main message router that handles:
   * - Join/reconnect requests
   * - Lobby actions (color selection, ready status)
   * - Game actions (relayed to host)
   * - Chat messages
   */
  onRequest(): Response { return new Response('OpenCatan relay ready'); }

  async onMessage(message: string, sender: Party.Connection) {
    this.updateActivity();

    const parsed = parseMessage<ClientMessage>(message);

    if (!parsed) {
      this.log.warn(`Invalid message from ${sender.id}: ${message}`);
      this.sendTo(sender, {
        type: 'ERROR',
        message: 'Invalid message format',
        code: 'INVALID_MESSAGE',
      });
      return;
    }

    this.log.debug(`Received ${parsed.type} from ${sender.id}`);

    try {
      switch (parsed.type) {
        case 'SESSION_COMMAND':
        case 'SESSION_REQUEST':
        case 'SESSION_DELIVERY':
          this.handleSessionMessage(sender, parsed);
          break;

        case 'JOIN_ROOM':
          await this.handleJoinRoom(sender, parsed.playerName, parsed.sessionToken);
          break;

        case 'RECONNECT':
          await this.handleReconnect(sender, parsed.sessionToken);
          break;

        case 'SELECT_COLOR':
          await this.handleSelectColor(sender, parsed.color);
          break;

        case 'MARK_READY':
          await this.handleMarkReady(sender, true);
          break;

        case 'UNMARK_READY':
          await this.handleMarkReady(sender, false);
          break;

        case 'UPDATE_SETTINGS':
          await this.handleUpdateSettings(sender, parsed.settings);
          break;

        case 'START_GAME':
          await this.handleStartGame(sender);
          break;

        case 'GAME_ACTION':
          await this.handleGameAction(sender, parsed.action);
          break;

        case 'CHAT_MESSAGE':
          await this.handleChatMessage(sender, parsed.text);
          break;

        case 'LEAVE_ROOM':
          await this.handleLeaveRoom(sender);
          break;

        case 'GAME_STATE':
          this.sendTo(sender, { type: 'ERROR', code: 'LEGACY_PROTOCOL_DISABLED', message: 'Use recipient-specific session delivery' });
          break;

        case 'PING':
          // Respond to keepalive ping with pong
          this.sendTo(sender, { type: 'PONG' });
          break;

        default:
          this.log.warn(`Unknown message type: ${(parsed as { type: string }).type}`);
          this.sendTo(sender, {
            type: 'ERROR',
            message: 'Unknown message type',
            code: 'UNKNOWN_MESSAGE_TYPE',
          });
      }
    } catch (error) {
      this.log.error(`Error handling ${parsed.type}:`, error);
      this.sendTo(sender, {
        type: 'ERROR',
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  }

  // ===========================================================================
  // MESSAGE HANDLERS
  // ===========================================================================

  /**
   * Handles a player joining the room.
   *
   * If the player provides a valid session token, this becomes a reconnection.
   * Otherwise, creates a new player.
   *
   * The first player to join becomes the host.
   */
  private async handleJoinRoom(
    conn: Party.Connection,
    playerName: string,
    sessionToken?: string
  ): Promise<void> {
    // If session token provided, try reconnection first
    if (sessionToken) {
      const reconnected = await this.tryReconnect(conn, sessionToken);
      if (reconnected) {
        return;
      }
      // If reconnection failed, continue with new join
    }

    // Validate player name
    const { valid, sanitized, error } = validatePlayerName(playerName);
    if (!valid) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: error || 'Invalid player name',
        code: 'INVALID_NAME',
      });
      return;
    }

    // Check if game has already started
    if (this.state.gameStarted) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Game has already started',
        code: 'GAME_IN_PROGRESS',
      });
      return;
    }

    // Check if room is full
    const connectedCount = this.getConnectedPlayerCount();
    if (connectedCount >= this.state.gameSettings.maxPlayers) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Room is full',
        code: 'ROOM_FULL',
      });
      return;
    }

    // Create new player
    const playerId = generatePlayerId();
    const newSessionToken = generateSessionToken();

    // Auto-assign a random available color
    const autoColor = this.getRandomAvailableColor();

    const player: PlayerConnection = {
      id: playerId,
      name: sanitized,
      color: autoColor,
      sessionToken: newSessionToken,
      isConnected: true,
      isReady: false,
      joinOrder: this.state.joinOrderCounter++,
      lastSeen: now(),
    };

    if (autoColor) {
      this.log.info(`Auto-assigned color ${autoColor} to ${sanitized}`);
    }

    // Store player with connection ID as key for lookup
    this.state.players.set(playerId, player);

    // Store mapping from connection to player
    (conn as Party.Connection & { playerId?: string }).playerId = playerId;

    // First player becomes host
    const isHost = this.state.hostId === null;
    if (isHost) {
      this.state.hostId = playerId;
      this.log.info(`${sanitized} is now the host`);
    }

    this.log.info(`${sanitized} joined the room (${this.getConnectedPlayerCount()}/${this.state.gameSettings.maxPlayers})`);

    // Send welcome message to the new player
    this.sendTo(conn, {
      type: 'WELCOME',
      playerId,
      sessionToken: newSessionToken,
      roomCode: this.state.roomCode,
      isHost,
    });

    // Notify others of new player
    this.broadcast({
      type: 'PLAYER_CONNECTED',
      playerId,
      playerName: sanitized,
      isReconnect: false,
    }, conn.id);

    // Broadcast updated lobby state
    this.broadcastLobbyState();
  }

  /**
   * Handles a reconnection attempt.
   */
  private async handleReconnect(
    conn: Party.Connection,
    sessionToken: string
  ): Promise<void> {
    const reconnected = await this.tryReconnect(conn, sessionToken);

    if (!reconnected) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Invalid session token or session expired',
        code: 'INVALID_SESSION',
      });
    }
  }

  /**
   * Attempts to reconnect a player using their session token.
   *
   * @returns True if reconnection succeeded
   */
  private async tryReconnect(
    conn: Party.Connection,
    sessionToken: string
  ): Promise<boolean> {
    // Find player with matching session token
    const player = this.findPlayerBySessionToken(sessionToken);

    if (!player) {
      this.log.debug('Reconnection failed: no player with token');
      return false;
    }

    // Clear any pending reconnect timeout
    this.clearReconnectTimeout(player.id);

    // Update player connection state
    player.isConnected = true;
    player.lastSeen = now();

    // Store mapping from connection to player
    (conn as Party.Connection & { playerId?: string }).playerId = player.id;

    this.log.info(`${player.name} reconnected`);

    // Send welcome message (same as join, but with existing data)
    this.sendTo(conn, {
      type: 'WELCOME',
      playerId: player.id,
      sessionToken: player.sessionToken,
      roomCode: this.state.roomCode,
      isHost: player.id === this.state.hostId,
    });

    // Notify others of reconnection
    this.broadcast({
      type: 'PLAYER_CONNECTED',
      playerId: player.id,
      playerName: player.name,
      isReconnect: true,
    }, conn.id);

    // Broadcast updated lobby state
    this.broadcastLobbyState();

    // If game is in progress, the host will send the current game state
    // This happens automatically because the host receives the PLAYER_CONNECTED message

    return true;
  }

  /**
   * Handles color selection by a player.
   */
  private async handleSelectColor(
    conn: Party.Connection,
    color: PlayerColor
  ): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Not joined to room',
        code: 'NOT_JOINED',
      });
      return;
    }

    if (this.state.gameStarted) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Cannot change color after game started',
        code: 'GAME_IN_PROGRESS',
      });
      return;
    }

    // Check if color is taken by another player
    const colorTaken = Array.from(this.state.players.values()).some(
      p => p.id !== player.id && p.color === color
    );

    if (colorTaken) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Color already taken',
        code: 'COLOR_TAKEN',
      });
      return;
    }

    player.color = color;
    player.isReady = false; // Reset ready status on color change

    this.log.info(`${player.name} selected ${color}`);

    // Broadcast updated lobby state
    this.broadcastLobbyState();
  }

  /**
   * Handles player ready status toggle.
   */
  private async handleMarkReady(
    conn: Party.Connection,
    ready: boolean
  ): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Not joined to room',
        code: 'NOT_JOINED',
      });
      return;
    }

    if (this.state.gameStarted) {
      return; // Ignore during game
    }

    // Must have color selected to be ready
    if (ready && !player.color) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Must select a color first',
        code: 'NO_COLOR_SELECTED',
      });
      return;
    }

    player.isReady = ready;

    this.log.info(`${player.name} is ${ready ? 'ready' : 'not ready'}`);

    // Broadcast updated lobby state
    this.broadcastLobbyState();
  }

  /**
   * Handles game settings update (host only).
   */
  private async handleUpdateSettings(
    conn: Party.Connection,
    settings: Partial<GameSettings>
  ): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Not joined to room',
        code: 'NOT_JOINED',
      });
      return;
    }

    // Only host can update settings
    if (player.id !== this.state.hostId) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Only host can update settings',
        code: 'NOT_HOST',
      });
      return;
    }

    if (this.state.gameStarted) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Cannot change settings after game started',
        code: 'GAME_IN_PROGRESS',
      });
      return;
    }

    // Merge settings
    this.state.gameSettings = {
      ...this.state.gameSettings,
      ...settings,
    };

    this.log.info('Settings updated:', settings);

    // If max players reduced, unready any excess players
    const connectedPlayers = Array.from(this.state.players.values())
      .filter(p => p.isConnected)
      .sort((a, b) => a.joinOrder - b.joinOrder);

    if (connectedPlayers.length > this.state.gameSettings.maxPlayers) {
      // Unready players who would be over the limit
      connectedPlayers
        .slice(this.state.gameSettings.maxPlayers)
        .forEach(p => { p.isReady = false; });
    }

    // Broadcast updated lobby state
    this.broadcastLobbyState();
  }

  /**
   * Handles game start (host only).
   *
   * The host's browser will initialize the game engine and broadcast
   * the initial game state to all players.
   */
  private async handleStartGame(conn: Party.Connection): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Not joined to room',
        code: 'NOT_JOINED',
      });
      return;
    }

    // Only host can start game
    if (player.id !== this.state.hostId) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Only host can start game',
        code: 'NOT_HOST',
      });
      return;
    }

    if (this.state.gameStarted) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Game already started',
        code: 'GAME_IN_PROGRESS',
      });
      return;
    }

    // Check minimum players
    const connectedPlayers = Array.from(this.state.players.values())
      .filter(p => p.isConnected);

    if (connectedPlayers.length < MIN_PLAYERS_TO_START) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: `Need at least ${MIN_PLAYERS_TO_START} players to start`,
        code: 'NOT_ENOUGH_PLAYERS',
      });
      return;
    }

    // Check all players ready
    const allReady = connectedPlayers.every(p => p.isReady);
    if (!allReady) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'All players must be ready',
        code: 'NOT_ALL_READY',
      });
      return;
    }

    // Check all players have colors
    const allHaveColors = connectedPlayers.every(p => p.color !== null);
    if (!allHaveColors) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'All players must select a color',
        code: 'MISSING_COLORS',
      });
      return;
    }

    // Start the game
    this.state.gameStarted = true;
    this.state.gameId = crypto.randomUUID();

    // Randomize turn order
    const turnOrder = shuffle(connectedPlayers.map(p => p.id));

    this.log.info('Game started with turn order:', turnOrder.map(id =>
      this.state.players.get(id)?.name
    ));

    // Broadcast game started
    this.broadcast({
      type: 'GAME_STARTED',
      gameId: this.state.gameId,
      turnOrder,
    });

    // The host's browser will now initialize the game engine and send
    // the first GAME_STATE message
  }

  /**
   * Handles game actions during gameplay.
   *
   * Game actions are relayed to the host for validation.
   * The host's game engine processes the action and broadcasts
   * the updated state to all players.
   */
  private handleSessionMessage(conn: Party.Connection, message: import('../src/session/protocol').SessionClientMessage): void {
    const player = this.getPlayerFromConnection(conn);
    const fail = (code: string) => this.sendTo(conn, { type: 'ERROR', code, message: code });
    if (!player || !this.state.gameStarted || !this.state.gameId) return fail('NO_ACTIVE_SESSION');
    if (message.type === 'SESSION_COMMAND') {
      if (!isCommand(message.command)) return fail('INVALID_COMMAND');
      if (message.command.gameId !== this.state.gameId) return fail('WRONG_GAME');
      const host = this.findConnectionByPlayerId(this.state.hostId!);
      if (!host) return fail('HOST_DISCONNECTED');
      this.sendTo(host, { type: 'SESSION_COMMAND', command: { ...message.command, playerId: player.id } });
      return;
    }
    if (message.gameId !== this.state.gameId) return fail('WRONG_GAME');
    if (message.type === 'SESSION_REQUEST') {
      const host = this.findConnectionByPlayerId(this.state.hostId!);
      if (!host) return fail('HOST_DISCONNECTED');
      this.sendTo(host, { type: 'SESSION_REQUEST', gameId: this.state.gameId, playerId: player.id });
      return;
    }
    if (player.id !== this.state.hostId) return fail('NOT_HOST');
    const payload = message.payload;
    if (!payload || (payload.kind !== 'view' && payload.kind !== 'receipt')) return fail('INVALID_DELIVERY');
    const meta = payload.kind === 'view' ? payload : payload.receipt;
    if (!meta || meta.gameId !== this.state.gameId || meta.protocolVersion !== 1) return fail('INVALID_DELIVERY');
    if (!this.state.players.has(message.recipientId)) return fail('UNKNOWN_RECIPIENT');
    const recipient = this.findConnectionByPlayerId(message.recipientId);
    if (recipient) this.sendTo(recipient, { type: 'SESSION_MESSAGE', gameId: this.state.gameId, payload });
  }

  private async handleGameAction(
    conn: Party.Connection,
    action: unknown
  ): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Not joined to room',
        code: 'NOT_JOINED',
      });
      return;
    }

    if (!this.state.gameStarted) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Game has not started',
        code: 'GAME_NOT_STARTED',
      });
      return;
    }

    // If this is the host, they process locally
    // If not, relay to host
    if (player.id === this.state.hostId) {
      // Host processes their own actions locally
      // This message shouldn't normally be sent by the host to the server
      this.log.debug('Host sent GAME_ACTION - processing locally');
      return;
    }

    // Relay action to host
    const hostConnection = this.findConnectionByPlayerId(this.state.hostId!);

    if (!hostConnection) {
      this.log.error('Cannot relay action: host not connected');
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Host not connected',
        code: 'HOST_DISCONNECTED',
      });
      return;
    }

    // Forward the action to the host
    // The host will validate and broadcast the result
    this.sendTo(hostConnection, {
      type: 'GAME_ACTION',
      action: {
        ...(action as object),
        playerId: player.id, // Ensure player ID is set
      },
    } as ServerMessage);
  }

  /**
   * Handles chat messages.
   *
   * Chat is broadcast to all players in the room.
   */
  private async handleChatMessage(
    conn: Party.Connection,
    text: string
  ): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Not joined to room',
        code: 'NOT_JOINED',
      });
      return;
    }

    // Sanitize and validate chat text
    const sanitized = text.trim().slice(0, 500); // Max 500 chars

    if (sanitized.length === 0) {
      return; // Ignore empty messages
    }

    // Broadcast to all players
    this.broadcast({
      type: 'CHAT_BROADCAST',
      from: player.id,
      fromName: player.name,
      fromColor: player.color,
      text: sanitized,
      timestamp: now(),
    });
  }

  /**
   * Handles explicit room leave.
   */
  private async handleLeaveRoom(conn: Party.Connection): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      return; // Not joined, nothing to do
    }

    this.log.info(`${player.name} left the room`);

    // Remove player completely (not just disconnect)
    this.state.players.delete(player.id);
    this.clearReconnectTimeout(player.id);

    // Notify others
    this.broadcast({
      type: 'PLAYER_DISCONNECTED',
      playerId: player.id,
      playerName: player.name,
    }, conn.id);

    // If this was the host, migrate
    if (player.id === this.state.hostId) {
      await this.migrateHost();
    }

    // Broadcast updated lobby state
    this.broadcastLobbyState();

    // Close the connection
    conn.close();
  }

  /**
   * Handles GAME_STATE messages from the host.
   *
   * The host's browser sends the authoritative game state after processing
   * actions. This method broadcasts the state to all peers.
   *
   * Only the host can send GAME_STATE messages.
   */
  private async handleGameState(
    conn: Party.Connection,
    gameState: unknown
  ): Promise<void> {
    const player = this.getPlayerFromConnection(conn);
    if (!player) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Not joined to room',
        code: 'NOT_JOINED',
      });
      return;
    }

    // Only host can broadcast game state
    if (player.id !== this.state.hostId) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Only host can broadcast game state',
        code: 'NOT_HOST',
      });
      return;
    }

    if (!this.state.gameStarted) {
      this.sendTo(conn, {
        type: 'ERROR',
        message: 'Game has not started',
        code: 'GAME_NOT_STARTED',
      });
      return;
    }

    this.log.debug('Broadcasting game state from host');

    // Broadcast the game state to all players (including host for confirmation)
    this.broadcast({
      type: 'GAME_STATE',
      state: gameState,
    } as ServerMessage);
  }

  // ===========================================================================
  // HOST MIGRATION
  // ===========================================================================

  /**
   * Migrates the host role to another player.
   *
   * This is called when:
   * - The current host disconnects
   * - The current host leaves the room
   *
   * The new host is selected based on join order (first joined = priority).
   */
  private async migrateHost(): Promise<void> {
    // Private views cannot reconstruct the authoritative state. Keep the host identity.
    if (this.state.gameStarted) return;
    // Find connected players sorted by join order
    const candidates = Array.from(this.state.players.values())
      .filter(p => p.isConnected && p.id !== this.state.hostId)
      .sort((a, b) => a.joinOrder - b.joinOrder);

    if (candidates.length === 0) {
      this.log.info('No players remaining for host migration');
      this.state.hostId = null;
      return;
    }

    const newHost = candidates[0];
    this.state.hostId = newHost.id;

    this.log.info(`Host migrated to ${newHost.name}`);

    // Notify all players of the host change
    this.broadcast({
      type: 'HOST_MIGRATED',
      newHostId: newHost.id,
      newHostName: newHost.name,
    });

    // The new host's browser will need to:
    // 1. Receive this message
    // 2. Take over game engine responsibilities
    // 3. Broadcast current game state to confirm authority
  }

  // ===========================================================================
  // RECONNECTION TIMEOUT
  // ===========================================================================

  /**
   * Starts a reconnection timeout for a disconnected player.
   *
   * If the player doesn't reconnect within the timeout,
   * they are removed from the room.
   */
  private startReconnectTimeout(playerId: string): void {
    // Clear any existing timeout
    this.clearReconnectTimeout(playerId);

    const player = this.state.players.get(playerId);
    if (!player) return;

    this.log.info(`Starting reconnection timeout for ${player.name} (${RECONNECT_TIMEOUT / 1000}s)`);

    const timeout = setTimeout(() => {
      this.handleReconnectTimeout(playerId);
    }, RECONNECT_TIMEOUT);

    this.reconnectTimeouts.set(playerId, timeout);
  }

  /**
   * Clears a reconnection timeout.
   */
  private clearReconnectTimeout(playerId: string): void {
    const timeout = this.reconnectTimeouts.get(playerId);
    if (timeout) {
      clearTimeout(timeout);
      this.reconnectTimeouts.delete(playerId);
    }
  }

  /**
   * Handles reconnection timeout expiration.
   */
  private handleReconnectTimeout(playerId: string): void {
    const player = this.state.players.get(playerId);
    if (!player) return;

    if (player.isConnected) {
      // Player reconnected in time
      return;
    }

    this.log.info(`Reconnection timeout expired for ${player.name}`);

    // Preserve stable identities during a running game. No automatic host takeover.
    if (this.state.gameStarted) return;
    // Remove player from room
    this.state.players.delete(playerId);
    this.reconnectTimeouts.delete(playerId);

    // Notify others
    this.broadcast({
      type: 'PLAYER_DISCONNECTED',
      playerId: player.id,
      playerName: player.name,
    });

    // Broadcast updated lobby state
    this.broadcastLobbyState();
  }

  // ===========================================================================
  // LOBBY STATE
  // ===========================================================================

  /**
   * Broadcasts the current lobby state to all connected players.
   *
   * This is called after any change that affects the lobby:
   * - Player joins/leaves
   * - Color selection
   * - Ready status change
   * - Settings update
   */
  private broadcastLobbyState(): void {
    if (this.state.gameStarted) {
      // Don't broadcast lobby state during game
      return;
    }

    const lobbyState = this.buildLobbyState();

    this.broadcast({
      type: 'LOBBY_STATE',
      state: lobbyState,
    });
  }

  /**
   * Builds the lobby state object for broadcasting.
   */
  private buildLobbyState(): LobbyState {
    const players: LobbyPlayer[] = Array.from(this.state.players.values())
      .sort((a, b) => a.joinOrder - b.joinOrder)
      .map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        isReady: p.isReady,
        isHost: p.id === this.state.hostId,
        isConnected: p.isConnected,
      }));

    const takenColors = players
      .filter(p => p.color !== null)
      .map(p => p.color as PlayerColor);

    const connectedPlayers = players.filter(p => p.isConnected);
    const allReady = connectedPlayers.length >= MIN_PLAYERS_TO_START &&
      connectedPlayers.every(p => p.isReady && p.color !== null);

    return {
      roomCode: this.state.roomCode,
      gameId: this.state.gameId,
      gameStarted: this.state.gameStarted,
      players,
      hostId: this.state.hostId || '',
      settings: this.state.gameSettings,
      allReady,
      takenColors,
    };
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Updates the last activity timestamp and resets room expiration timer.
   */
  private updateActivity(): void {
    this.state.lastActivity = now();
    this.resetRoomExpirationTimer();
  }

  // ===========================================================================
  // ROOM EXPIRATION
  // ===========================================================================

  /**
   * Resets the room expiration timer.
   *
   * Called on any activity to prevent room from expiring.
   * Room expires after 30 minutes of inactivity.
   */
  private resetRoomExpirationTimer(): void {
    // Clear existing timer
    if (this.roomExpirationTimeout) {
      clearTimeout(this.roomExpirationTimeout);
      this.roomExpirationTimeout = null;
    }

    // Set new timer
    this.roomExpirationTimeout = setTimeout(() => {
      this.handleRoomExpiration();
    }, ROOM_EXPIRATION_TIMEOUT);
  }

  /**
   * Handles room expiration.
   *
   * Notifies all connected clients and closes connections.
   */
  private handleRoomExpiration(): void {
    this.log.info('Room expired due to inactivity');

    // Notify all players
    this.broadcast({
      type: 'ERROR',
      message: 'Room expired due to inactivity',
      code: 'ROOM_EXPIRED',
    });

    // Close all connections
    for (const conn of this.room.getConnections()) {
      conn.close();
    }

    // Clear all timeouts
    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();

    // Clear expiration timeout
    if (this.roomExpirationTimeout) {
      clearTimeout(this.roomExpirationTimeout);
      this.roomExpirationTimeout = null;
    }
  }

  /**
   * Gets the number of currently connected players.
   */
  private getConnectedPlayerCount(): number {
    return Array.from(this.state.players.values())
      .filter(p => p.isConnected)
      .length;
  }

  /**
   * Gets colors that are available (not taken by any player).
   */
  private getAvailableColors(): PlayerColor[] {
    const takenColors = new Set(
      Array.from(this.state.players.values())
        .filter(p => p.color !== null)
        .map(p => p.color as PlayerColor)
    );
    return ALL_PLAYER_COLORS.filter(c => !takenColors.has(c));
  }

  /**
   * Gets a random available color for auto-assignment.
   */
  private getRandomAvailableColor(): PlayerColor | null {
    const available = this.getAvailableColors();
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  /**
   * Finds a player by their connection ID.
   */
  private findPlayerByConnectionId(connectionId: string): PlayerConnection | undefined {
    // We stored the playerId on the connection object
    const conn = Array.from(this.room.getConnections()).find(c => c.id === connectionId);
    if (!conn) return undefined;

    const playerId = (conn as Party.Connection & { playerId?: string }).playerId;
    if (!playerId) return undefined;

    return this.state.players.get(playerId);
  }

  /**
   * Finds a player by their session token.
   */
  private findPlayerBySessionToken(token: string): PlayerConnection | undefined {
    return Array.from(this.state.players.values())
      .find(p => p.sessionToken === token);
  }

  /**
   * Gets the player associated with a connection.
   */
  private getPlayerFromConnection(conn: Party.Connection): PlayerConnection | undefined {
    const playerId = (conn as Party.Connection & { playerId?: string }).playerId;
    if (!playerId) return undefined;
    return this.state.players.get(playerId);
  }

  /**
   * Finds a connection by player ID.
   */
  private findConnectionByPlayerId(playerId: string): Party.Connection | undefined {
    return Array.from(this.room.getConnections()).find(conn => {
      return (conn as Party.Connection & { playerId?: string }).playerId === playerId;
    });
  }

  /**
   * Sends a message to a specific connection.
   */
  private sendTo(conn: Party.Connection, message: ServerMessage): void {
    conn.send(stringifyMessage(message));
  }

  /**
   * Broadcasts a message to all connected clients.
   *
   * @param message - The message to broadcast
   * @param exclude - Optional connection ID to exclude from broadcast
   */
  private broadcast(message: ServerMessage, exclude?: string): void {
    const data = stringifyMessage(message);

    for (const conn of this.room.getConnections()) {
      if (exclude && conn.id === exclude) {
        continue;
      }
      conn.send(data);
    }
  }
}

// Export for PartyKit
export { OpenCatanServer };
