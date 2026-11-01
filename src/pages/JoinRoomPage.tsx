/**
 * JoinRoomPage - Page for joining an existing game room
 *
 * Uses the JoinRoom component and connects to PartyKit.
 * Supports pre-filled room code from URL params for direct links.
 */

import { useCallback, useEffect, useState } from 'react';
import { JoinRoom } from '@/components/lobby';
import { usePartyConnection } from '@/network/hooks';
import { useGameNavigation, useRoomCode } from '@/hooks';

/**
 * Join room page
 *
 * Routes:
 * - /join - Empty code input
 * - /join/:code - Pre-filled code from URL
 *
 * Flow:
 * 1. User enters name and room code (code may be pre-filled)
 * 2. On submit, joins room via PartyKit
 * 3. On success, navigates to /room/:code
 * 4. On error, displays error message
 */
export function JoinRoomPage() {
  const { goToLanding, goToLobby } = useGameNavigation();
  const { joinRoom, isConnecting, error } = usePartyConnection();
  const urlCode = useRoomCode();

  // Track the actual error to display (may include room-specific errors)
  const [displayError, setDisplayError] = useState<string | null>(null);

  // Clear display error when URL code changes
  useEffect(() => {
    setDisplayError(null);
  }, [urlCode]);

  // Sync error from connection hook
  useEffect(() => {
    if (error) {
      setDisplayError(error);
    }
  }, [error]);

  const handleJoinRoom = useCallback(
    async (roomCode: string, playerName: string) => {
      setDisplayError(null);

      try {
        await joinRoom(roomCode, playerName);
        goToLobby(roomCode);
      } catch (err) {
        // Check for specific error types
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to join room';

        // Handle common errors
        if (
          errorMessage.toLowerCase().includes('not found') ||
          errorMessage.toLowerCase().includes('invalid')
        ) {
          setDisplayError('Room not found. Please check the code and try again.');
        } else if (errorMessage.toLowerCase().includes('full')) {
          setDisplayError('Room is full. Cannot join at this time.');
        } else if (errorMessage.toLowerCase().includes('started')) {
          setDisplayError('Game has already started. Cannot join.');
        } else {
          setDisplayError(errorMessage);
        }

        console.error('Failed to join room:', err);
      }
    },
    [joinRoom, goToLobby]
  );

  return (
    <JoinRoom
      initialCode={urlCode}
      onJoinRoom={handleJoinRoom}
      isLoading={isConnecting}
      error={displayError}
    />
  );
}

export default JoinRoomPage;
