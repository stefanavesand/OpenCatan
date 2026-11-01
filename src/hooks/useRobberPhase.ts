import { robberPlacements } from '@/game/engine/base/turn';
// @ts-nocheck
// TODO: Fix TypeScript errors in this file
/**
 * useRobberPhase Hook
 *
 * Hook for managing robber phase logic including:
 * - Tracking current robber phase (discard, move, steal)
 * - Calculating which players need to discard
 * - Determining valid robber hexes
 * - Finding potential steal targets
 */

import { useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../game/state/store';
import type { ResourceCounts, ResourceType } from '../types/common';
import type { HexCoord } from '../types/coordinates';
import type { PlayerColor } from '../types/common';
import { useGameActions } from '../network/hooks/useGameActions';

export type RobberPhaseType = 'discard' | 'move' | 'steal' | null;

export interface PlayerDiscardInfo {
  id: string;
  name: string;
  color: PlayerColor;
  cardCount: number;
  discardRequired: number;
  hasDiscarded: boolean;
}

export interface StealTarget {
  id: string;
  name: string;
  color: PlayerColor;
  cardCount: number;
}

export interface UseRobberPhaseReturn {
  /** Current robber phase */
  phase: RobberPhaseType;
  /** Whether current player must discard */
  mustDiscard: boolean;
  /** Number of cards current player must discard */
  discardCount: number;
  /** Players who need to discard */
  playersNeedingDiscard: PlayerDiscardInfo[];
  /** Current player's hand */
  localPlayerHand: ResourceCounts;
  /** Valid hexes for robber placement */
  validRobberHexes: HexCoord[];
  /** Current robber location */
  currentRobberLocation: HexCoord | null;
  /** Potential steal targets */
  stealTargets: StealTarget[];
  /** Whether friendly robber rule is enabled */
  friendlyRobberEnabled: boolean;
  /** Whether current player is the active player */
  isActivePlayer: boolean;
  /** Active player's name */
  activePlayerName: string;
  /** Submit discard selection */
  submitDiscard: (resources: ResourceCounts) => void;
  /** Move robber to hex */
  moveRobber: (hex: HexCoord) => void;
  /** Steal from player */
  stealFrom: (playerId: string) => void;
  /** Skip steal if no valid targets */
  skipSteal: () => void;
}

/**
 * Hook for robber phase logic
 */
export function useRobberPhase(): UseRobberPhaseReturn {
  const gameState = useSelector((state: RootState) => state.game);
  const boardState = useSelector((state: RootState) => state.board);
  const playerState = useSelector((state: RootState) => state.players);
  const players = playerState.players;
  const localPlayerId = useSelector((state: RootState) => state.lobby.localPlayerId);
  const { discardResources, moveRobber: moveRobberAction, stealResource, skipSteal: skipStealAction } = useGameActions();

  // Get board data with fallbacks
  const tiles = boardState?.tiles || [];
  const buildings = boardState?.buildings || [];
  const robberLocation = boardState?.robberLocation || null;

  // Determine current robber phase
  const phase = useMemo((): RobberPhaseType => {
    switch (gameState.phase) {
      case 'discard':
        return 'discard';
      case 'robber-move':
        return 'move';
      case 'robber-steal':
        return 'steal';
      default:
        return null;
    }
  }, [gameState.phase]);

  // Check if local player is active player
  const isActivePlayer = gameState.currentPlayerId === localPlayerId;

  // Get active player name
  const activePlayerName = useMemo(() => {
    const player = players.find((p) => p.id === gameState.currentPlayerId);
    return player?.name || 'Unknown';
  }, [players, gameState.currentPlayerId]);

  // Check if local player must discard
  const mustDiscard = useMemo(() => {
    return gameState.pendingDiscard?.includes(localPlayerId || '') ?? false;
  }, [gameState.pendingDiscard, localPlayerId]);

  // Get local player's discard count
  const discardCount = useMemo(() => {
    if (!localPlayerId) return 0;

    const player = players.find((p) => p.id === localPlayerId);
    if (!player) return 0;

    const cardCount = player.resourceCount ?? Object.values(player.resources).reduce((sum, c) => sum + c, 0);
    const discardLimit = gameState.settings.discardLimit || 7;

    // Only discard if over the limit
    if (cardCount <= discardLimit) return 0;

    // Discard half (rounded down)
    return Math.floor(cardCount / 2);
  }, [localPlayerId, players, gameState.settings.discardLimit]);

  // Get local player's hand
  const localPlayerHand = useMemo((): ResourceCounts => {
    const player = players.find((p) => p.id === localPlayerId);
    return player?.resources || {
      brick: 0,
      lumber: 0,
      ore: 0,
      grain: 0,
      wool: 0,
    };
  }, [players, localPlayerId]);

  // Get players needing to discard
  const playersNeedingDiscard = useMemo((): PlayerDiscardInfo[] => {
    if (!gameState.pendingDiscard) return [];

    return gameState.pendingDiscard.map((playerId) => {
      const player = players.find((p) => p.id === playerId);
      if (!player) {
        return {
          id: playerId,
          name: 'Unknown',
          color: 'white' as PlayerColor,
          cardCount: 0,
          discardRequired: 0,
          hasDiscarded: false,
        };
      }

      const cardCount = player.resourceCount ?? Object.values(player.resources).reduce((sum, c) => sum + c, 0);
      // Calculate discard required based on current card count
      const discardRequired = Math.floor(cardCount / 2);

      return {
        id: player.id,
        name: player.name,
        color: player.color,
        cardCount,
        discardRequired,
        hasDiscarded: false, // They are still in pendingDiscard, so haven't discarded yet
      };
    });
  }, [gameState.pendingDiscard, players]);

  // Get valid robber hexes
  const validRobberHexes = useMemo((): HexCoord[] => robberPlacements({
    game: gameState, board: boardState, players: playerState,
  }, localPlayerId ?? ''), [gameState, boardState, playerState, localPlayerId]);

  // Get current robber location
  const currentRobberLocation = robberLocation;

  // Get steal targets - players with buildings adjacent to robber hex
  const stealTargets = useMemo((): StealTarget[] => {
    if (!robberLocation) return [];

    // Get all 6 vertices adjacent to the robber hex
    const { q, r } = robberLocation;
    const adjacentVertexKeys = [
      // Top and bottom vertices of this hex
      `${q},${r}:N`,
      `${q},${r}:S`,
      // Adjacent vertices from neighboring hexes
      `${q - 1},${r + 1}:N`,  // Bottom-left neighbor's N vertex
      `${q},${r + 1}:N`,      // Bottom neighbor's N vertex
      `${q},${r - 1}:S`,      // Top neighbor's S vertex
      `${q + 1},${r - 1}:S`,  // Top-right neighbor's S vertex
    ];

    const targets: StealTarget[] = [];
    const seenPlayerIds = new Set<string>();

    for (const building of buildings) {
      // Skip own buildings
      if (building.playerId === localPlayerId) continue;
      if (seenPlayerIds.has(building.playerId)) continue;

      // Check if building is on an adjacent vertex
      const buildingKey = `${building.vertex.hex.q},${building.vertex.hex.r}:${building.vertex.direction}`;
      if (!adjacentVertexKeys.includes(buildingKey)) continue;

      const player = players.find((p) => p.id === building.playerId);
      if (!player) continue;

      const cardCount = player.resourceCount ?? Object.values(player.resources).reduce((sum, c) => sum + c, 0);

      // Only include players with cards
      if (cardCount > 0) {
        seenPlayerIds.add(player.id);
        targets.push({
          id: player.id,
          name: player.name,
          color: player.color,
          cardCount,
        });
      }
    }

    return targets;
  }, [robberLocation, buildings, players, localPlayerId]);

  // Friendly robber enabled
  const friendlyRobberEnabled = gameState.settings.friendlyRobber;

  // Action handlers
  const submitDiscard = useCallback(
    (resources: ResourceCounts) => {
      const partial: Partial<ResourceCounts> = {};
      for (const [key, value] of Object.entries(resources)) {
        if (value > 0) {
          partial[key as ResourceType] = value;
        }
      }
      discardResources(partial);
    },
    [discardResources]
  );

  const moveRobber = useCallback(
    (hex: HexCoord) => {
      moveRobberAction(hex);
    },
    [moveRobberAction]
  );

  const stealFrom = useCallback(
    (playerId: string) => {
      stealResource(playerId);
    },
    [stealResource]
  );

  const skipSteal = useCallback(() => {
    skipStealAction();
  }, [skipStealAction]);

  return {
    phase,
    mustDiscard,
    discardCount,
    playersNeedingDiscard,
    localPlayerHand,
    validRobberHexes,
    currentRobberLocation,
    stealTargets,
    friendlyRobberEnabled,
    isActivePlayer,
    activePlayerName,
    submitDiscard,
    moveRobber,
    stealFrom,
    skipSteal,
  };
}

export default useRobberPhase;
