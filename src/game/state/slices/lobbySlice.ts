/**
 * Lobby Slice - Pre-game lobby state management for OpenCatan
 *
 * Manages:
 * - Room code and connection status
 * - Player list with ready states and color selections
 * - Game settings configuration
 * - Host management
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import type {
  PlayerColor,
  GameSettings,
  GameMode,
  VictoryPointTarget,
  TurnTimerOption,
  DiscardLimit,
  LobbyPlayer,
} from '@/types';
import { PLAYER_COLORS, DEFAULT_GAME_SETTINGS } from '@/types';

/**
 * Lobby settings (subset of game settings configurable in lobby)
 */
export interface LobbySettings {
  mode: GameMode;
  playerCount: number; // 2-8 players
  victoryPoints: number; // 1-20 victory points
  turnTimer: number; // 15-300 seconds or 0 for unlimited
  discardLimit: number; // 5-15 cards
  friendlyRobber: boolean;
  hideBankCards: boolean; // Hide bank card counts (show ? instead)
  mapType: 'random' | string;
}

/**
 * Lobby state interface
 */
export interface LobbyState {
  /** Room code for this lobby */
  roomCode: string | null;

  /** Players currently in the lobby */
  players: LobbyPlayer[];

  /** Local player's ID */
  localPlayerId: string | null;

  /** Whether the local player is the host */
  isHost: boolean;

  /** Whether the game has started */
  gameStarted: boolean;

  /** Lobby settings */
  settings: LobbySettings;

  /** Colors still available for selection */
  availableColors: PlayerColor[];

  /** Connection status */
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';

  /** Error message if any */
  errorMessage: string | null;
}

const ALL_COLORS: PlayerColor[] = [...PLAYER_COLORS];

const defaultSettings: LobbySettings = {
  mode: DEFAULT_GAME_SETTINGS.mode,
  playerCount: DEFAULT_GAME_SETTINGS.playerCount as 3 | 4 | 5 | 6,
  victoryPoints: DEFAULT_GAME_SETTINGS.victoryPoints,
  turnTimer: DEFAULT_GAME_SETTINGS.turnTimer,
  discardLimit: DEFAULT_GAME_SETTINGS.discardLimit,
  friendlyRobber: DEFAULT_GAME_SETTINGS.friendlyRobber,
  hideBankCards: DEFAULT_GAME_SETTINGS.hideBankCards,
  mapType: DEFAULT_GAME_SETTINGS.map,
};

const initialState: LobbyState = {
  roomCode: null,
  players: [],
  localPlayerId: null,
  isHost: false,
  gameStarted: false,
  settings: defaultSettings,
  availableColors: [...ALL_COLORS],
  connectionStatus: 'disconnected',
  errorMessage: null,
};

const lobbySlice = createSlice({
  name: 'lobby',
  initialState,
  reducers: {
    /**
     * Set the room code
     */
    setRoomCode: (state, action: PayloadAction<string>) => {
      state.roomCode = action.payload;
    },

    /**
     * Set the local player ID
     */
    setLocalPlayerId: (state, action: PayloadAction<string>) => {
      state.localPlayerId = action.payload;
    },

    /**
     * Add a player to the lobby
     */
    addPlayer: (state, action: PayloadAction<LobbyPlayer>) => {
      // Don't add if already exists
      if (state.players.find((p) => p.id === action.payload.id)) {
        return;
      }
      state.players.push(action.payload);

      // Remove selected color from available colors
      if (action.payload.color) {
        state.availableColors = state.availableColors.filter(
          (c) => c !== action.payload.color
        );
      }

      // Check if this player is the local player and host
      if (action.payload.id === state.localPlayerId && action.payload.isHost) {
        state.isHost = true;
      }
    },

    /**
     * Remove a player from the lobby
     */
    removePlayer: (state, action: PayloadAction<string>) => {
      const player = state.players.find((p) => p.id === action.payload);
      if (player) {
        // Return color to available colors
        if (player.color) {
          state.availableColors.push(player.color);
        }
        state.players = state.players.filter((p) => p.id !== action.payload);
      }
    },

    /**
     * Update a lobby player's properties
     */
    updatePlayer: (
      state,
      action: PayloadAction<{ playerId: string; updates: Partial<LobbyPlayer> }>
    ) => {
      const player = state.players.find(
        (p) => p.id === action.payload.playerId
      );
      if (player) {
        // Handle color change - update available colors
        if (action.payload.updates.color !== undefined) {
          // Return old color
          if (player.color) {
            state.availableColors.push(player.color);
          }
          // Remove new color
          if (action.payload.updates.color) {
            state.availableColors = state.availableColors.filter(
              (c) => c !== action.payload.updates.color
            );
          }
        }
        Object.assign(player, action.payload.updates);
      }
    },

    /**
     * Set player ready status
     */
    setReady: (
      state,
      action: PayloadAction<{ playerId: string; isReady: boolean }>
    ) => {
      const player = state.players.find(
        (p) => p.id === action.payload.playerId
      );
      if (player) {
        player.isReady = action.payload.isReady;
      }
    },

    /**
     * Set player color
     */
    setPlayerColor: (
      state,
      action: PayloadAction<{ playerId: string; color: PlayerColor }>
    ) => {
      const player = state.players.find(
        (p) => p.id === action.payload.playerId
      );
      if (player) {
        // Return old color to available
        if (player.color) {
          state.availableColors.push(player.color);
        }
        // Set new color and remove from available
        player.color = action.payload.color;
        state.availableColors = state.availableColors.filter(
          (c) => c !== action.payload.color
        );
      }
    },

    /**
     * Update lobby settings (host only)
     */
    setSettings: (state, action: PayloadAction<Partial<LobbySettings>>) => {
      state.settings = { ...state.settings, ...action.payload };
    },

    /**
     * Set local player as host or not
     */
    setLocalPlayer: (
      state,
      action: PayloadAction<{ playerId: string; isHost: boolean }>
    ) => {
      state.localPlayerId = action.payload.playerId;
      state.isHost = action.payload.isHost;
    },

    /**
     * Set connection status
     */
    setConnectionStatus: (
      state,
      action: PayloadAction<'disconnected' | 'connecting' | 'connected' | 'error'>
    ) => {
      state.connectionStatus = action.payload;
      if (action.payload !== 'error') {
        state.errorMessage = null;
      }
    },

    /**
     * Set error message
     */
    setErrorMessage: (state, action: PayloadAction<string | null>) => {
      state.errorMessage = action.payload;
    },

    /**
     * Mark game as started
     */
    startGame: (state) => {
      state.gameStarted = true;
    },

    /**
     * Transfer host to another player
     */
    transferHost: (state, action: PayloadAction<string>) => {
      state.players.forEach((p) => {
        p.isHost = p.id === action.payload;
      });
      state.isHost = action.payload === state.localPlayerId;
    },

    /**
     * Set player connection status
     */
    setPlayerConnected: (
      state,
      action: PayloadAction<{ playerId: string; isConnected: boolean }>
    ) => {
      const player = state.players.find(
        (p) => p.id === action.payload.playerId
      );
      if (player) {
        player.isConnected = action.payload.isConnected;
      }
    },

    /**
     * Sync entire lobby state (from host)
     */
    syncLobbyState: (
      state,
      action: PayloadAction<{
        roomCode: string;
        players: LobbyPlayer[];
        settings: LobbySettings;
        gameStarted: boolean;
      }>
    ) => {
      state.roomCode = action.payload.roomCode;
      state.players = action.payload.players;
      state.settings = action.payload.settings;
      state.gameStarted = action.payload.gameStarted;

      // Recalculate available colors
      const usedColors = state.players
        .filter((p) => p.color)
        .map((p) => p.color as PlayerColor);
      state.availableColors = ALL_COLORS.filter(
        (c) => !usedColors.includes(c)
      );

      // Update isHost based on local player
      const localPlayer = state.players.find(
        (p) => p.id === state.localPlayerId
      );
      state.isHost = localPlayer?.isHost ?? false;
    },

    /**
     * Reset lobby state
     */
    resetLobby: () => initialState,
  },
});

// Export actions
export const {
  setRoomCode,
  setLocalPlayerId,
  addPlayer,
  removePlayer,
  updatePlayer,
  setReady,
  setPlayerColor,
  setSettings,
  setLocalPlayer,
  setConnectionStatus,
  setErrorMessage,
  startGame,
  transferHost,
  setPlayerConnected,
  syncLobbyState,
  resetLobby,
} = lobbySlice.actions;

// Selectors
export const selectRoomCode = (state: RootState) => state.lobby.roomCode;
export const selectLobbyPlayers = (state: RootState) => state.lobby.players || [];
export const selectLocalPlayerId = (state: RootState) =>
  state.lobby.localPlayerId;
export const selectIsHost = (state: RootState) => state.lobby.isHost;
export const selectGameStarted = (state: RootState) => state.lobby.gameStarted;
export const selectLobbySettings = (state: RootState) => state.lobby.settings;
export const selectAvailableColors = (state: RootState) =>
  state.lobby.availableColors;
export const selectConnectionStatus = (state: RootState) =>
  state.lobby.connectionStatus;
export const selectErrorMessage = (state: RootState) =>
  state.lobby.errorMessage;

/**
 * Get the local player's lobby data
 */
export const selectLocalLobbyPlayer = (state: RootState) =>
  state.lobby.players.find((p) => p.id === state.lobby.localPlayerId);

/**
 * Check if all players are ready
 */
export const selectAllPlayersReady = (state: RootState) =>
  state.lobby.players.length > 0 &&
  state.lobby.players.every((p) => p.isReady) &&
  state.lobby.players.every((p) => p.color !== null);

/**
 * Check if lobby has minimum players for the selected mode
 */
export const selectHasMinimumPlayers = (state: RootState) => {
  const minPlayers = 2;
  return state.lobby.players.length >= minPlayers;
};

/**
 * Check if lobby has room for more players
 */
export const selectCanAddMorePlayers = (state: RootState) =>
  state.lobby.players.length < state.lobby.settings.playerCount;

/**
 * Get the host player
 */
export const selectLobbyHost = (state: RootState) =>
  state.lobby.players.find((p) => p.isHost);

/**
 * Check if game can be started
 */
export const selectCanStartGame = (state: RootState) =>
  state.lobby.isHost &&
  state.lobby.players.length >= 3 &&
  state.lobby.players.length <= state.lobby.settings.playerCount &&
  state.lobby.players.every((p) => p.isReady && p.color !== null);

/**
 * Get connected players count
 */
export const selectConnectedPlayersCount = (state: RootState) =>
  state.lobby.players.filter((p) => p.isConnected).length;

/**
 * Get player by ID
 */
export const selectLobbyPlayerById = (state: RootState, playerId: string) =>
  state.lobby.players.find((p) => p.id === playerId);

export default lobbySlice.reducer;
