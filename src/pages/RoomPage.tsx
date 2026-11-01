/**
 * RoomPage - Unified page for handling room codes
 *
 * Handles /:code routes where code is 1-6 letters (no numbers)
 * - If room exists with active game: shows GamePage
 * - If room exists with lobby: shows LobbyPage
 * - If room doesn't exist: creates a new lobby
 * - If code is invalid format: shows 404
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAppSelector, useAppDispatch, useGameNavigation } from '@/hooks';
import { usePartyConnection } from '@/network/hooks';
import { partyClient } from '@/network/partyClient';
import {
  selectGameStarted,
  selectConnectionStatus,
  selectLocalPlayerId,
  selectLobbyPlayers,
  resetLobby,
  resetGame,
  resetPlayers,
} from '@/game/state';
import { GamePage } from './GamePage';
import { LobbyPage } from './LobbyPage';
import styles from './RoomPage.module.css';

// Valid room code pattern: 1-6 letters only, no numbers
const VALID_ROOM_CODE = /^[A-Za-z]{1,6}$/;

/**
 * Generate a random two-word name for the player
 */
const generateRandomName = (): string => {
  const adjectives = [
    'Swift', 'Brave', 'Clever', 'Mighty', 'Noble', 'Bold', 'Wise', 'Quick',
    'Fierce', 'Gentle', 'Happy', 'Lucky', 'Eager', 'Calm', 'Keen', 'Proud',
  ];
  const nouns = [
    'Settler', 'Builder', 'Trader', 'Knight', 'Merchant', 'Explorer',
    'Pioneer', 'Farmer', 'Sailor', 'Ranger', 'Guardian', 'Champion',
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
};

type RoomState =
  | 'validating' // Checking if room exists
  | 'joining' // Joining existing room
  | 'creating' // Creating new room
  | 'lobby' // In lobby
  | 'game' // In game
  | 'error' // Error state
  | 'invalid'; // Invalid room code format

/**
 * RoomPage component
 */
export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const dispatch = useAppDispatch();
  const { goToLanding } = useGameNavigation();
  const { joinRoom, createRoom, isConnecting, isConnected, error } = usePartyConnection();

  // Redux state
  const gameStarted = useAppSelector(selectGameStarted);
  const connectionStatus = useAppSelector(selectConnectionStatus);
  const localPlayerId = useAppSelector(selectLocalPlayerId);
  const lobbyPlayers = useAppSelector(selectLobbyPlayers);

  // Local state
  const [roomState, setRoomState] = useState<RoomState>('validating');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasAttemptedJoin, setHasAttemptedJoin] = useState(false);
  const joinInFlight = useRef(false);

  // Validate room code format
  const normalizedCode = code?.toUpperCase() || '';
  const isValidFormat = VALID_ROOM_CODE.test(normalizedCode);

  // Track previous room code to detect room changes
  const prevRoomCodeRef = useRef<string | null>(null);

  // Reset state when room code changes (entering a new room)
  useEffect(() => {
    if (normalizedCode && normalizedCode !== prevRoomCodeRef.current) {
      // Disconnect from any existing connection
      if (partyClient.isConnected) {
        partyClient.disconnect();
      }

      // Reset all game state when entering a new room
      dispatch(resetLobby());
      dispatch(resetGame());
      dispatch(resetPlayers());
      setRoomState('validating');
      setHasAttemptedJoin(false);
      joinInFlight.current = false;
      setErrorMessage(null);

      prevRoomCodeRef.current = normalizedCode;
    }
  }, [normalizedCode, dispatch]);

  // Determine room state based on connection and game state
  useEffect(() => {
    if (!isValidFormat) {
      setRoomState('invalid');
      return;
    }

    // If connected and game started, show game
    if (isConnected && gameStarted) {
      setRoomState('game');
      return;
    }

    // If connected and in lobby, show lobby
    if (isConnected && !gameStarted && lobbyPlayers && lobbyPlayers.length > 0) {
      setRoomState('lobby');
      return;
    }

    // If not connected and not attempting to join yet, try to join
    if (!isConnected && !isConnecting && !hasAttemptedJoin && !joinInFlight.current) {
      joinInFlight.current = true;
      setHasAttemptedJoin(true);
      setRoomState('joining');

      // Generate a random name and try to join
      const playerName = generateRandomName();

      // Try to join the room first
      joinRoom(normalizedCode, playerName)
        .then(() => {
          // Successfully joined
          setRoomState('lobby');
        })
        .catch((err) => {
          // Room doesn't exist, create it
          console.log('Room does not exist, creating new lobby...');
          setRoomState('creating');

          createRoom(playerName, normalizedCode, undefined)
            .then(() => {
              setRoomState('lobby');
            })
            .catch((createErr) => {
              console.error('Failed to create room:', createErr);
              setErrorMessage('Failed to create room. Please try again.');
              setRoomState('error');
            });
        });
    }
  }, [
    isValidFormat,
    isConnected,
    isConnecting,
    gameStarted,
    lobbyPlayers,
    hasAttemptedJoin,
    normalizedCode,
    joinRoom,
    createRoom,
  ]);

  // Handle external errors
  useEffect(() => {
    if (error) {
      setErrorMessage(error);
      if (roomState !== 'lobby' && roomState !== 'game') {
        setRoomState('error');
      }
    }
  }, [error, roomState]);

  // Invalid room code format - show 404-like page
  if (roomState === 'invalid') {
    return (
      <div className={styles.errorContainer}>
        <h1>404</h1>
        <p>Invalid room code. Room codes must be 1-6 letters (no numbers).</p>
        <button onClick={goToLanding} className={styles.homeButton}>
          Return to Home
        </button>
      </div>
    );
  }

  // Show loading state while validating/joining/creating
  if (roomState === 'validating' || roomState === 'joining' || roomState === 'creating') {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>
          {roomState === 'validating' && 'Checking room...'}
          {roomState === 'joining' && `Joining ${normalizedCode}...`}
          {roomState === 'creating' && `Creating room ${normalizedCode}...`}
        </p>
      </div>
    );
  }

  // Error state
  if (roomState === 'error') {
    return (
      <div className={styles.errorContainer}>
        <h2>Connection Error</h2>
        <p>{errorMessage || 'An unexpected error occurred.'}</p>
        <button onClick={goToLanding} className={styles.homeButton}>
          Return to Home
        </button>
      </div>
    );
  }

  // Show game page if game has started
  if (roomState === 'game') {
    return <GamePage />;
  }

  // Show lobby page
  return <LobbyPage />;
}

export default RoomPage;
