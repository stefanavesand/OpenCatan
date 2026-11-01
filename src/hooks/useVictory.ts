/**
 * useVictory Hook - Victory state and navigation for end game
 *
 * Provides:
 * - Victory detection and winner info
 * - Final scores and rankings
 * - VP breakdown for each player
 * - Navigation callbacks (return to lobby, create new room)
 */

import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from './useAppSelector';
import { useAppDispatch } from './useAppDispatch';
import { useGameStats } from './useGameStats';
import {
  selectPhase,
  selectWinnerId,
  selectFinalScores,
  selectLongestRoad,
  selectLargestArmy,
  resetGame,
} from '../game/state/slices/gameSlice';
import { selectPlayers, resetPlayers } from '../game/state/slices/playersSlice';
import { selectBuildings } from '../game/state/slices/boardSlice';
import { resetBoard } from '../game/state/slices/boardSlice';
import { resetStats } from '../game/state/slices/statsSlice';
import type { Player, PlayerColor, Building } from '../types';
import type { VPBreakdown, PlayerStats, GameStats } from '../game/engine/statsTracker';
import type { VictoryPlayer, VictoryGameStats } from '../components/overlays/VictoryScreen';

/**
 * Return type for useVictory hook
 */
export interface UseVictoryReturn {
  /** Whether the game has ended */
  isGameOver: boolean;
  /** Whether the victory screen should be shown */
  showVictoryScreen: boolean;
  /** The winning player (if game is over) */
  winner: VictoryPlayer | null;
  /** All players with their final scores and VP breakdown */
  finalPlayers: VictoryPlayer[];
  /** Final scores by player ID */
  finalScores: Record<string, number>;
  /** Complete game statistics for victory screen */
  gameStats: VictoryGameStats;
  /** Navigate back to lobby */
  returnToLobby: () => void;
  /** Create a new game room */
  createNewRoom: () => void;
}

/**
 * Calculate VP breakdown for a player
 */
function calculateVPBreakdown(
  player: Player,
  buildings: Building[],
  longestRoadHolderId: string | null,
  largestArmyHolderId: string | null,
  finalScore?: number
): VPBreakdown {
  const playerId = player.id;

  // Count settlements
  const settlements = buildings.filter(
    (b) => b.playerId === playerId && b.type === 'settlement'
  );
  const settlementCount = settlements.length;

  // Count cities
  const cities = buildings.filter(
    (b) => b.playerId === playerId && b.type === 'city'
  );
  const cityCount = cities.length;

  // Check for longest road
  const hasLongestRoad = longestRoadHolderId === playerId;

  // Check for largest army
  const hasLargestArmy = largestArmyHolderId === playerId;

  // Count VP cards
  const vpCards = player.developmentCards.filter(
    (c) => c.type === 'victoryPoint' && !c.isPlayed
  );
  const publicScore = settlementCount + cityCount * 2 + (hasLongestRoad ? 2 : 0) + (hasLargestArmy ? 2 : 0) + cities.filter(c => c.hasMetropolis).length * 2;
  const vpCardCount = finalScore === undefined ? vpCards.length : Math.max(0, finalScore - publicScore);

  // Count metropolises
  const metropolises = cities.filter((c) => c.hasMetropolis);
  const metropolisCount = metropolises.length;

  const total =
    settlementCount +
    cityCount * 2 +
    (hasLongestRoad ? 2 : 0) +
    (hasLargestArmy ? 2 : 0) +
    vpCardCount +
    metropolisCount * 2;

  return {
    settlements: settlementCount,
    settlementCount,
    cities: cityCount * 2,
    cityCount,
    longestRoad: hasLongestRoad ? 2 : 0,
    largestArmy: hasLargestArmy ? 2 : 0,
    victoryPointCards: vpCardCount,
    vpCardCount,
    metropolis: metropolisCount * 2,
    metropolisCount,
    total,
  };
}

/**
 * Hook for accessing victory state and navigation
 */
export function useVictory(): UseVictoryReturn {
  const dispatch = useAppDispatch();
  // Note: useNavigate may not be available if not using react-router
  // In that case, we'll provide a fallback
  let navigate: ((path: string) => void) | null = null;
  try {
    navigate = useNavigate();
  } catch {
    // Not in a router context
  }

  // Select game state
  const phase = useAppSelector(selectPhase);
  const winnerId = useAppSelector(selectWinnerId);
  const storeScores = useAppSelector(selectFinalScores);
  const players = useAppSelector(selectPlayers);
  const buildings = useAppSelector(selectBuildings);
  const longestRoad = useAppSelector(selectLongestRoad);
  const largestArmy = useAppSelector(selectLargestArmy);

  // Get game stats
  const { gameStats: baseGameStats, getPlayerStats } = useGameStats();

  // Determine if game is over
  const isGameOver = phase === 'ended';
  const showVictoryScreen = isGameOver && winnerId !== null;

  // Calculate final scores if not already set
  const finalScores = useMemo(() => {
    if (storeScores) return storeScores;

    const scores: Record<string, number> = {};
    players.forEach((player) => {
      const breakdown = calculateVPBreakdown(
        player,
        buildings,
        longestRoad?.playerId || null,
        largestArmy?.playerId || null
      );
      scores[player.id] = breakdown.total;
    });
    return scores;
  }, [storeScores, players, buildings, longestRoad, largestArmy]);

  // Build victory players array
  const finalPlayers: VictoryPlayer[] = useMemo(() => {
    return players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      victoryPoints: finalScores[player.id] || 0,
      vpBreakdown: calculateVPBreakdown(
        player,
        buildings,
        longestRoad?.playerId || null,
        largestArmy?.playerId || null,
        isGameOver ? finalScores[player.id] : undefined
      ),
    }));
  }, [players, finalScores, buildings, longestRoad, largestArmy, isGameOver]);

  // Get winner
  const winner = useMemo<VictoryPlayer | null>(() => {
    if (!winnerId) return null;
    return finalPlayers.find((p) => p.id === winnerId) || null;
  }, [winnerId, finalPlayers]);

  // Build complete game stats
  const gameStats: VictoryGameStats = useMemo(() => {
    const playerStats: Record<string, PlayerStats> = {};
    players.forEach((player) => {
      playerStats[player.id] = getPlayerStats(player.id);
    });

    return {
      ...baseGameStats,
      playerStats,
    };
  }, [baseGameStats, players, getPlayerStats]);

  // Navigation callbacks
  const returnToLobby = useCallback(() => {
    // Reset all game state
    dispatch(resetGame());
    dispatch(resetPlayers());
    dispatch(resetBoard());
    dispatch(resetStats());

    // Navigate to lobby
    if (navigate) {
      navigate('/');
    } else {
      // Fallback: reload the page
      window.location.href = '/';
    }
  }, [dispatch, navigate]);

  const createNewRoom = useCallback(() => {
    // Reset game state but keep player info for quick rematch
    dispatch(resetGame());
    dispatch(resetBoard());
    dispatch(resetStats());

    // Navigate to create room
    if (navigate) {
      navigate('/create');
    } else {
      // Fallback: reload to create page
      window.location.href = '/create';
    }
  }, [dispatch, navigate]);

  return {
    isGameOver,
    showVictoryScreen,
    winner,
    finalPlayers,
    finalScores,
    gameStats,
    returnToLobby,
    createNewRoom,
  };
}

export default useVictory;
