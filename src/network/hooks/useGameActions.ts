import { setErrorMessage } from '@/game/state/slices/lobbySlice';
/**
 * useGameActions - React hook for game actions with network routing
 *
 * Provides game action functions that properly route through the network:
 * - If host: process locally, then broadcast
 * - If peer: send to host, wait for state update
 */

import { useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@/game/state/store';
import type { GameAction } from '@/types/game';
import type { ResourceType, ResourceCounts } from '@/types/common';
import type { VertexCoord, EdgeCoord, HexCoord } from '@/types/coordinates';
import type { DevelopmentCardType } from '@/types/cards';
import { partyClient } from '../partyClient';
import { hostManager } from '../hostManager';
import { peerManager } from '../peerManager';

// ============================================================================
// Types
// ============================================================================

export interface UseGameActionsReturn {
  // Dice
  rollDice: () => void;

  // Building
  buildRoad: (edge: EdgeCoord) => void;
  buildSettlement: (vertex: VertexCoord) => void;
  buildCity: (vertex: VertexCoord) => void;
  buildShip: (edge: EdgeCoord) => void;
  moveShip: (from: EdgeCoord, to: EdgeCoord) => void;

  // Development Cards
  buyDevCard: () => void;
  playDevCard: (card: DevelopmentCardType, params?: PlayDevCardParams) => void;

  // Robber/Pirate
  moveRobber: (hex: HexCoord) => void;
  movePirate: (hex: HexCoord) => void;
  stealResource: (victimId: string) => void;
  skipSteal: () => void;

  // Discard
  discardResources: (resources: Partial<ResourceCounts>) => void;

  // Trading
  sendTradeOffer: (offer: TradeOfferInput) => void;
  respondToTrade: (offerId: string, response: 'accept' | 'decline') => void;
  counterOffer: (originalOfferId: string, counterOffer: TradeOfferInput) => void;
  cancelTrade: (offerId: string) => void;
  bankTrade: (give: ResourceTradeInput, receive: ResourceTradeInput) => void;

  // Turn Management
  endTurn: () => void;

  // C&K Knights
  buildKnight: (vertex: VertexCoord) => void;
  activateKnight: (knightId: string) => void;
  upgradeKnight: (knightId: string) => void;
  moveKnight: (knightId: string, vertex: VertexCoord) => void;

  // C&K City Improvements
  buildCityImprovement: (improvementType: 'trade' | 'politics' | 'science') => void;

  // Helper
  isMyTurn: boolean;
  canPerformAction: boolean;
}

export interface TradeOfferInput {
  toPlayerId: string | null;
  offering: Partial<ResourceCounts>;
  requesting: Partial<ResourceCounts>;
}

export interface ResourceTradeInput {
  resource: ResourceType;
  amount: number;
}

export interface PlayDevCardParams {
  /** Target hex for Knight card */
  hex?: HexCoord;
  /** Target victim for Knight card */
  victimId?: string;
  /** Resources for Year of Plenty */
  resources?: [ResourceType, ResourceType];
  /** Resource for Monopoly */
  resource?: ResourceType;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for game actions with network routing
 */
export function useGameActions(): UseGameActionsReturn {
  const dispatch = useDispatch<AppDispatch>();

  // Redux state
  const gameState = useSelector((state: RootState) => state.game);
  const localPlayerId = useSelector((state: RootState) => state.lobby.localPlayerId);
  const isHost = useSelector((state: RootState) => state.lobby.isHost);

  // Derived state
  const isMyTurn = gameState.currentPlayerId === localPlayerId;
  const canPerformAction = partyClient.isConnected && isMyTurn;

  // ==========================================================================
  // Helper to send action
  // ==========================================================================

  const sendAction = useCallback((action: GameAction) => {
    if (!partyClient.isConnected) {
      // An offline browser must not acquire authority over an online session.
      return;
    }

    if (isHost) {
      // Host: process locally via host manager
      const result = hostManager.handleAction(localPlayerId || '', action);
      dispatch(setErrorMessage(result.success ? null : result.error ?? 'Action rejected'));
    } else {
      // Peer: send to host
      peerManager.sendAction(action);
    }
  }, [isHost, localPlayerId, dispatch]);

  // ==========================================================================
  // Game Actions
  // ==========================================================================

  const rollDice = useCallback(() => {
    sendAction({ type: 'ROLL_DICE' });
  }, [sendAction]);

  const buildRoad = useCallback((edge: EdgeCoord) => {
    sendAction({ type: 'BUILD_ROAD', edge });
  }, [sendAction]);

  const buildSettlement = useCallback((vertex: VertexCoord) => {
    sendAction({ type: 'BUILD_SETTLEMENT', vertex });
  }, [sendAction]);

  const buildCity = useCallback((vertex: VertexCoord) => {
    sendAction({ type: 'BUILD_CITY', vertex });
  }, [sendAction]);

  const buildShip = useCallback((edge: EdgeCoord) => {
    sendAction({ type: 'BUILD_SHIP', edge });
  }, [sendAction]);

  const moveShip = useCallback((from: EdgeCoord, to: EdgeCoord) => {
    sendAction({ type: 'MOVE_SHIP', from, to });
  }, [sendAction]);

  const buyDevCard = useCallback(() => {
    sendAction({ type: 'BUY_DEVELOPMENT_CARD' });
  }, [sendAction]);

  const playDevCard = useCallback((card: DevelopmentCardType, params?: PlayDevCardParams) => {
    if (card === 'knight') {
      // Knight card - initiate robber move phase
      sendAction({
        type: 'PLAY_KNIGHT',
        hex: params?.hex,
      });
    } else if (card === 'roadBuilding') {
      // Road Building card - enter road building phase
      sendAction({ type: 'PLAY_ROAD_BUILDING' });
    } else if (card === 'yearOfPlenty') {
      // Year of Plenty - require resources param
      if (params?.resources) {
        sendAction({
          type: 'PLAY_YEAR_OF_PLENTY',
          resources: params.resources,
        });
      }
    } else if (card === 'monopoly') {
      // Monopoly - require resource param
      if (params?.resource) {
        sendAction({
          type: 'PLAY_MONOPOLY',
          resource: params.resource,
        });
      }
    }
  }, [sendAction]);

  const moveRobber = useCallback((hex: HexCoord) => {
    sendAction({ type: 'MOVE_ROBBER', hex });
  }, [sendAction]);

  const movePirate = useCallback((hex: HexCoord) => {
    sendAction({ type: 'MOVE_PIRATE', hex });
  }, [sendAction]);

  const stealResource = useCallback((victimId: string) => {
    sendAction({ type: 'STEAL_RESOURCE', victimId });
  }, [sendAction]);

  const skipSteal = useCallback(() => {
    sendAction({ type: 'SKIP_STEAL' });
  }, [sendAction]);

  const discardResources = useCallback((resources: Partial<ResourceCounts>) => {
    sendAction({ type: 'DISCARD_RESOURCES', resources });
  }, [sendAction]);

  const sendTradeOffer = useCallback((offer: TradeOfferInput) => {
    sendAction({
      type: 'OFFER_TRADE',
      offer: {
        fromPlayerId: localPlayerId || '',
        toPlayerId: offer.toPlayerId,
        offering: offer.offering,
        requesting: offer.requesting,
      },
    });
  }, [sendAction, localPlayerId]);

  const respondToTrade = useCallback((offerId: string, response: 'accept' | 'decline') => {
    if (response === 'accept') {
      sendAction({ type: 'ACCEPT_TRADE', offerId });
    } else {
      sendAction({ type: 'DECLINE_TRADE', offerId });
    }
  }, [sendAction]);

  const counterOffer = useCallback((originalOfferId: string, counter: TradeOfferInput) => {
    sendAction({
      type: 'COUNTER_OFFER',
      originalOfferId,
      counterOffer: {
        fromPlayerId: localPlayerId || '',
        toPlayerId: counter.toPlayerId,
        offering: counter.offering,
        requesting: counter.requesting,
      },
    });
  }, [sendAction, localPlayerId]);

  const cancelTrade = useCallback((offerId: string) => {
    sendAction({ type: 'CANCEL_TRADE', offerId });
  }, [sendAction]);

  const bankTrade = useCallback((give: ResourceTradeInput, receive: ResourceTradeInput) => {
    sendAction({ type: 'BANK_TRADE', give, receive });
  }, [sendAction]);

  const endTurn = useCallback(() => {
    sendAction({ type: 'END_TURN' });
  }, [sendAction]);

  // C&K Actions
  const buildKnight = useCallback((vertex: VertexCoord) => {
    sendAction({ type: 'BUILD_KNIGHT', vertex });
  }, [sendAction]);

  const activateKnight = useCallback((knightId: string) => {
    sendAction({ type: 'ACTIVATE_KNIGHT', knightId });
  }, [sendAction]);

  const upgradeKnight = useCallback((knightId: string) => {
    sendAction({ type: 'UPGRADE_KNIGHT', knightId });
  }, [sendAction]);

  const moveKnight = useCallback((knightId: string, vertex: VertexCoord) => {
    sendAction({ type: 'MOVE_KNIGHT', knightId, vertex });
  }, [sendAction]);

  const buildCityImprovement = useCallback((
    improvementType: 'trade' | 'politics' | 'science'
  ) => {
    sendAction({ type: 'BUILD_CITY_IMPROVEMENT', improvementType });
  }, [sendAction]);

  // ==========================================================================
  // Return Value
  // ==========================================================================

  return useMemo(() => ({
    rollDice,
    buildRoad,
    buildSettlement,
    buildCity,
    buildShip,
    moveShip,
    buyDevCard,
    playDevCard,
    moveRobber,
    movePirate,
    stealResource,
    skipSteal,
    discardResources,
    sendTradeOffer,
    respondToTrade,
    counterOffer,
    cancelTrade,
    bankTrade,
    endTurn,
    buildKnight,
    activateKnight,
    upgradeKnight,
    moveKnight,
    buildCityImprovement,
    isMyTurn,
    canPerformAction,
  }), [
    rollDice,
    buildRoad,
    buildSettlement,
    buildCity,
    buildShip,
    moveShip,
    buyDevCard,
    playDevCard,
    moveRobber,
    movePirate,
    stealResource,
    skipSteal,
    discardResources,
    sendTradeOffer,
    respondToTrade,
    counterOffer,
    cancelTrade,
    bankTrade,
    endTurn,
    buildKnight,
    activateKnight,
    upgradeKnight,
    moveKnight,
    buildCityImprovement,
    isMyTurn,
    canPerformAction,
  ]);
}

export default useGameActions;
