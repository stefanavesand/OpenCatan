// @ts-nocheck
// TODO: Fix TypeScript errors in this file
/**
 * usePartyConnection - React hook for PartyKit connection management
 *
 * Provides a clean React interface for:
 * - Creating and joining rooms
 * - Connection state management
 * - Automatic reconnection handling
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { partyClient, type ConnectionState } from '../partyClient';
import { hostManager } from '../hostManager';
import { peerManager } from '../peerManager';
import { store, type RootState, type AppDispatch } from '@/game/state/store';
import type { LobbyPlayer, LobbyState } from '@/types/network';
import type { GameSettings } from '@/types/game';
import {
  setRoomCode,
  setLocalPlayerId,
  setLocalPlayer,
  setConnectionStatus,
  setErrorMessage,
  syncLobbyState,
  addPlayer,
  removePlayer,
  updatePlayer,
  transferHost,
  resetLobby,
} from '@/game/state/slices/lobbySlice';
import { generateRoomCode } from '../constants';
import { getSessionData, canReconnect as checkCanReconnect } from '../session';

// ============================================================================
// Types
// ============================================================================

export interface UsePartyConnectionReturn {
  /** Current connection state */
  connectionState: ConnectionState;
  /** Whether connected to a room */
  isConnected: boolean;
  /** Whether currently connecting */
  isConnecting: boolean;
  /** Whether this client is the host */
  isHost: boolean;
  /** Current room code */
  roomCode: string | null;
  /** Local player's ID */
  playerId: string | null;
  /** Players in the room */
  players: LobbyPlayer[];
  /** Current lobby state */
  lobbyState: LobbyState | null;
  /** Error message if any */
  error: string | null;

  // Actions
  /** Create a new room as host. Optionally specify a room code. */
  createRoom: (playerName: string, roomCode?: string, settings?: Partial<GameSettings>) => Promise<string>;
  /** Join an existing room */
  joinRoom: (roomCode: string, playerName: string) => Promise<void>;
  /** Leave the current room */
  leaveRoom: () => void;
  /** Try to reconnect to previous session */
  tryReconnect: () => Promise<boolean>;
  /** Alias for tryReconnect for compatibility */
  reconnect: () => Promise<boolean>;
  /** Start the game (host only) */
  startGame: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for PartyKit connection management
 */
export function usePartyConnection(): UsePartyConnectionReturn {
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const lobbyState = useSelector((state: RootState) => state.lobby);
  const { players, localPlayerId, isHost, roomCode: storeRoomCode, errorMessage } = lobbyState;

  // Local state for connection - initialize from partyClient's actual state
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    () => partyClient.connectionState
  );
  const [localLobbyState, setLocalLobbyState] = useState<LobbyState | null>(null);

  // Sync Redux state on mount if partyClient is already connected
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!hasInitialized.current && partyClient.isConnected) {
      hasInitialized.current = true;
      dispatch(setConnectionStatus('connected'));
    }
  }, [dispatch]);


  // Derived state
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';

  // ==========================================================================
  // Message Handlers
  // ==========================================================================

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const subscribe = (type: string, handler: (message: any) => void) => {
      partyClient.on(type as any, handler);
      cleanups.push(() => partyClient.off(type, handler));
    };
    // Handle connection state changes
    subscribe('CONNECTION_STATE_CHANGE' as any, (data: any) => {
      setConnectionState(data.state);
      dispatch(setConnectionStatus(
        data.state === 'connected' ? 'connected' :
        data.state === 'connecting' || data.state === 'reconnecting' ? 'connecting' :
        'disconnected'
      ));
    });

    // Handle lobby state updates
    subscribe('LOBBY_STATE', (message) => {
      if ('state' in message) {
        setLocalLobbyState(message.state);

        // Ensure localPlayerId is set before syncing (may arrive before createRoom resolves)
        const currentPlayerId = partyClient.playerId;
        if (currentPlayerId) {
          dispatch(setLocalPlayerId(currentPlayerId));
        }

        // Server sends maxPlayers, mapType; client uses playerCount, mapType
        const serverSettings = message.state.settings;

        // Get current gameStarted state from Redux store - don't reset to false if game already started
        // Use store.getState() to get fresh state (avoid stale closure)
        const currentStoreState = store.getState();
        const serverGameStarted = message.state.gameStarted;
        const preserveGameStarted = currentStoreState.lobby.gameStarted || serverGameStarted || false;

        dispatch(syncLobbyState({
          roomCode: message.state.roomCode,
          players: message.state.players,
          settings: {
            mode: serverSettings.mode,
            playerCount: serverSettings.maxPlayers || serverSettings.playerCount || 4,
            victoryPoints: serverSettings.victoryPoints,
            turnTimer: serverSettings.turnTimer,
            discardLimit: serverSettings.discardLimit,
            friendlyRobber: serverSettings.friendlyRobber,
            mapType: serverSettings.mapType || serverSettings.map || 'random',
          },
          gameStarted: preserveGameStarted,
        }));
        if (message.state.gameId && !partyClient.isHost) peerManager.begin(message.state.gameId);
      }
    });

    // Handle player joined
    subscribe('PLAYER_JOINED', (message) => {
      if ('player' in message) {
        dispatch(addPlayer(message.player));
      }
    });

    // Handle player left
    subscribe('PLAYER_LEFT', (message) => {
      if ('playerId' in message) {
        dispatch(removePlayer(message.playerId));
      }
    });

    // Handle player updated
    subscribe('PLAYER_UPDATED', (message) => {
      if ('player' in message) {
        dispatch(updatePlayer({
          playerId: message.player.id,
          updates: message.player,
        }));
      }
    });

    // Handle host migration
    subscribe('HOST_MIGRATED', (message) => {
      if ('newHostId' in message) {
        dispatch(transferHost(message.newHostId));
      }
    });

    // Handle errors
    subscribe('ERROR', (message) => {
      if ('message' in message) {
        dispatch(setErrorMessage(message.message));
      }
    });

    // Handle game started
    subscribe('GAME_STARTED', (message) => {
      if (partyClient.isHost) hostManager.startGame(message.gameId, message.turnOrder);
      else peerManager.begin(message.gameId);
      dispatch({ type: 'lobby/startGame' });
    });

    // Cleanup
    return () => {
      cleanups.forEach(cleanup => cleanup());
    };
  }, [dispatch]);

  // ==========================================================================
  // Actions
  // ==========================================================================

  /**
   * Create a new room as host
   */
  const createRoom = useCallback(async (
    playerName: string,
    specifiedRoomCode?: string,
    settings?: Partial<GameSettings>
  ): Promise<string> => {
    const newRoomCode = specifiedRoomCode?.toUpperCase() || generateRoomCode();

    dispatch(setConnectionStatus('connecting'));
    dispatch(setRoomCode(newRoomCode));

    try {
      await partyClient.connect(newRoomCode, playerName);

      // Initialize as host
      const playerId = partyClient.playerId || '';
      dispatch(setLocalPlayer({ playerId, isHost: partyClient.isHost }));

      dispatch(setConnectionStatus('connected'));

      return newRoomCode;
    } catch (error) {
      dispatch(setConnectionStatus('error'));
      dispatch(setErrorMessage(error instanceof Error ? error.message : 'Failed to create room'));
      throw error;
    }
  }, [dispatch]);

  /**
   * Join an existing room
   */
  const joinRoom = useCallback(async (
    roomCode: string,
    playerName: string
  ): Promise<void> => {
    dispatch(setConnectionStatus('connecting'));
    dispatch(setRoomCode(roomCode.toUpperCase()));

    try {
      await partyClient.connect(roomCode, playerName);

      const playerId = partyClient.playerId || '';
      dispatch(setLocalPlayer({ playerId, isHost: partyClient.isHost }));
      dispatch(setConnectionStatus('connected'));
    } catch (error) {
      dispatch(setConnectionStatus('error'));
      dispatch(setErrorMessage(error instanceof Error ? error.message : 'Failed to join room'));
      throw error;
    }
  }, [dispatch]);

  /**
   * Leave the current room
   */
  const leaveRoom = useCallback(() => {
    partyClient.disconnect();
    hostManager.stopHost();
    peerManager.clearPendingActions();
    dispatch(resetLobby());
    setLocalLobbyState(null);
  }, [dispatch]);

  /**
   * Try to reconnect to previous session
   */
  const tryReconnect = useCallback(async (): Promise<boolean> => {
    if (!checkCanReconnect()) {
      return false;
    }

    const sessionData = getSessionData();
    if (!sessionData.roomCode || !sessionData.token) {
      return false;
    }

    dispatch(setConnectionStatus('connecting'));

    try {
      await partyClient.reconnect(sessionData.roomCode, sessionData.token);

      const playerId = partyClient.playerId || sessionData.playerId || '';
      dispatch(setLocalPlayerId(playerId));
      dispatch(setRoomCode(sessionData.roomCode));
      dispatch(setConnectionStatus('connected'));

      // Request state sync
      peerManager.requestSync();

      return true;
    } catch (error) {
      dispatch(setConnectionStatus('error'));
      return false;
    }
  }, [dispatch]);

  /**
   * Start the game (host only)
   */
  const startGame = useCallback(() => {
    if (!isHost) {
      console.warn('Only the host can start the game');
      return;
    }
    partyClient.send({ type: 'START_GAME' });
  }, [isHost]);

  // ==========================================================================
  // Return Value
  // ==========================================================================

  return useMemo(() => ({
    connectionState,
    isConnected,
    isConnecting,
    isHost,
    roomCode: storeRoomCode,
    playerId: localPlayerId,
    players,
    lobbyState: localLobbyState,
    error: errorMessage,

    createRoom,
    joinRoom,
    leaveRoom,
    tryReconnect,
    reconnect: tryReconnect,
    startGame,
  }), [
    connectionState,
    isConnected,
    isConnecting,
    isHost,
    storeRoomCode,
    localPlayerId,
    players,
    localLobbyState,
    errorMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    tryReconnect,
    startGame,
  ]);
}

export default usePartyConnection;
