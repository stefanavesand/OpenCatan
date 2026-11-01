// @ts-nocheck
// TODO: Fix TypeScript errors in this file
/**
 * useDevCards Hook
 *
 * Hook for managing development card logic including:
 * - Tracking owned development cards
 * - Checking if cards can be played
 * - Checking if cards can be bought
 * - Playing various card types
 */

import { useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../game/state/store';
import type { DevelopmentCard, DevelopmentCardType } from '../types/cards';
import type { ResourceType } from '../types/common';
import type { HexCoord } from '../types/coordinates';
import { useGameActions } from '../network/hooks/useGameActions';

export interface UseDevCardsReturn {
  /** Development cards owned by current player */
  myDevCards: DevelopmentCard[];
  /** Whether player can play a dev card this turn */
  canPlayDevCard: boolean;
  /** Whether player has already played a dev card this turn */
  hasPlayedThisTurn: boolean;
  /** Whether player can afford to buy a dev card */
  canBuyDevCard: boolean;
  /** Number of cards remaining in the deck */
  deckCount: number;
  /** Whether it's currently the player's turn */
  isPlayerTurn: boolean;
  /** Current turn number */
  currentTurn: number;
  /** Buy a development card */
  buyDevCard: () => void;
  /** Play a knight card */
  playKnight: (hex: HexCoord, victimId?: string) => void;
  /** Play road building card */
  playRoadBuilding: () => void;
  /** Play year of plenty card */
  playYearOfPlenty: (res1: ResourceType, res2: ResourceType) => void;
  /** Play monopoly card */
  playMonopoly: (resource: ResourceType) => void;
  /** Count of each card type */
  cardCounts: Record<DevelopmentCardType, number>;
  /** Number of knights played (for largest army) */
  knightsPlayed: number;
}

// Dev card cost
const DEV_CARD_COST = {
  ore: 1,
  grain: 1,
  wool: 1,
};

/**
 * Hook for development card logic
 */
export function useDevCards(): UseDevCardsReturn {
  const gameState = useSelector((state: RootState) => state.game);
  const players = useSelector((state: RootState) => state.players.players) || [];
  const localPlayerId = useSelector((state: RootState) => state.lobby.localPlayerId);
  const {
    buyDevCard: buyDevCardAction,
    playDevCard,
  } = useGameActions();

  // Get current player
  const currentPlayer = useMemo(() => {
    return players.find((p) => p.id === localPlayerId);
  }, [players, localPlayerId]);

  // Check if it's player's turn
  const isPlayerTurn = gameState.currentPlayerId === localPlayerId;

  // Current turn number
  const currentTurn = gameState.turn;

  // Get my dev cards
  const myDevCards = useMemo((): DevelopmentCard[] => {
    return currentPlayer?.developmentCards || [];
  }, [currentPlayer]);

  // Count cards by type
  const cardCounts = useMemo((): Record<DevelopmentCardType, number> => {
    const counts: Record<DevelopmentCardType, number> = {
      knight: 0,
      victoryPoint: 0,
      roadBuilding: 0,
      yearOfPlenty: 0,
      monopoly: 0,
    };

    for (const card of myDevCards) {
      if (!card.isPlayed) {
        counts[card.type]++;
      }
    }

    return counts;
  }, [myDevCards]);

  // Count knights played
  const knightsPlayed = useMemo(() => {
    return myDevCards.filter(
      (card) => card.type === 'knight' && card.isPlayed
    ).length;
  }, [myDevCards]);

  // Check if player has played a dev card this turn
  const hasPlayedThisTurn = useMemo(() => {
    // Check if any non-VP card was played this turn
    return currentPlayer?.hasPlayedDevCard ?? false;
  }, [currentPlayer]);

  // Check if player can play a dev card
  const canPlayDevCard = useMemo(() => {
    // Must be player's turn
    if (!isPlayerTurn) return false;

    // Cannot have already played a non-VP card this turn
    if (hasPlayedThisTurn) return false;

    // Must be in main phase
    if (gameState.phase !== 'main' && gameState.phase !== 'roll') return false;

    // Must have at least one playable card (not VP, not bought this turn)
    const playableCards = myDevCards.filter((card) => {
      if (card.isPlayed) return false;
      if (card.type === 'victoryPoint') return false;
      if (card.turnBought === currentTurn) return false;
      return true;
    });

    return playableCards.length > 0;
  }, [isPlayerTurn, hasPlayedThisTurn, gameState.phase, myDevCards, currentTurn]);

  // Check if player can afford a dev card
  const canBuyDevCard = useMemo(() => {
    if (!currentPlayer) return false;
    if (!isPlayerTurn) return false;
    if (gameState.phase !== 'main') return false;

    const { resources } = currentPlayer;
    return (
      resources.ore >= DEV_CARD_COST.ore &&
      resources.grain >= DEV_CARD_COST.grain &&
      resources.wool >= DEV_CARD_COST.wool
    );
  }, [currentPlayer, isPlayerTurn, gameState.phase]);

  // Get deck count
  const deckCount = gameState.developmentDeckCount;

  // Action handlers
  const buyDevCard = useCallback(() => {
    if (canBuyDevCard && deckCount > 0) {
      buyDevCardAction();
    }
  }, [canBuyDevCard, deckCount, buyDevCardAction]);

  const playKnight = useCallback(
    (hex: HexCoord, victimId?: string) => {
      playDevCard('knight', { hex, victimId });
    },
    [playDevCard]
  );

  const playRoadBuilding = useCallback(() => {
    playDevCard('roadBuilding');
  }, [playDevCard]);

  const playYearOfPlenty = useCallback(
    (res1: ResourceType, res2: ResourceType) => {
      playDevCard('yearOfPlenty', { resources: [res1, res2] });
    },
    [playDevCard]
  );

  const playMonopoly = useCallback(
    (resource: ResourceType) => {
      playDevCard('monopoly', { resource });
    },
    [playDevCard]
  );

  return {
    myDevCards,
    canPlayDevCard,
    hasPlayedThisTurn,
    canBuyDevCard,
    deckCount,
    isPlayerTurn,
    currentTurn,
    buyDevCard,
    playKnight,
    playRoadBuilding,
    playYearOfPlenty,
    playMonopoly,
    cardCounts,
    knightsPlayed,
  };
}

export default useDevCards;
