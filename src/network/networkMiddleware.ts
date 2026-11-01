/**
 * Network Middleware - Redux middleware for network synchronization
 *
 * Intercepts game actions and routes them appropriately:
 * - If host: process locally, then broadcast to peers
 * - If peer: send to host, wait for state update
 *
 * This middleware ensures all game state changes are properly synchronized
 * across the network.
 */

import type { Middleware, MiddlewareAPI, Dispatch, AnyAction } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from '@/game/state/store';
import type { GameAction } from '@/types/game';
import { partyClient } from './partyClient';
import { hostManager } from './hostManager';
import { peerManager } from './peerManager';

// ============================================================================
// Types
// ============================================================================

/**
 * Action types that should be intercepted and sent over network
 */
const NETWORK_ACTION_TYPES = [
  // Game actions that need to be synchronized
  'game/rollDice',
  'game/buildSettlement',
  'game/buildCity',
  'game/buildRoad',
  'game/buildShip',
  'game/buyDevCard',
  'game/playDevCard',
  'game/moveRobber',
  'game/stealResource',
  'game/discardResources',
  'game/endTurn',
  'game/offerTrade',
  'game/acceptTrade',
  'game/declineTrade',
  'game/cancelTrade',
  'game/bankTrade',

  // C&K actions
  'game/buildKnight',
  'game/activateKnight',
  'game/upgradeKnight',
  'game/moveKnight',
  'game/buildCityImprovement',

  // Seafarers actions
  'game/moveShip',
] as const;

/**
 * Action types that should be processed locally first, then synced
 */
const LOCAL_FIRST_ACTIONS = [
  'lobby/setPlayerColor',
  'lobby/setReady',
  'lobby/setSettings',
] as const;

/**
 * Actions that indicate network operations
 */
interface NetworkAction extends AnyAction {
  /** Whether this action originated from the network */
  meta?: {
    fromNetwork?: boolean;
    playerId?: string;
  };
}

// ============================================================================
// Middleware
// ============================================================================

/**
 * Network middleware that intercepts game actions and routes them appropriately
 */
export const networkMiddleware: Middleware =
  (storeApi: MiddlewareAPI<Dispatch<AnyAction>, RootState>) =>
  (next: Dispatch<AnyAction>) =>
  (action: NetworkAction) => {
    // If action came from network, just process it locally
    if (action.meta?.fromNetwork) {
      return next(action);
    }

    // Check if this is a network-synchronized action
    const isNetworkAction = NETWORK_ACTION_TYPES.some((type) =>
      action.type === type
    );

    const isLocalFirstAction = LOCAL_FIRST_ACTIONS.some((type) =>
      action.type === type
    );

    // Debug logging
    if (action.type.startsWith('lobby/')) {
      console.log('[NetworkMiddleware] Lobby action:', action.type, {
        isNetworkAction,
        isLocalFirstAction,
        isHost: hostManager.isHost,
        isConnected: partyClient.isConnected,
      });
    }

    // If not connected, just process locally
    if (!partyClient.isConnected) {
      return next(action);
    }

    // Handle different scenarios based on host/peer status
    if (hostManager.isHost) {
      // Host: process locally first, then broadcast
      return handleHostAction(storeApi, next, action, isNetworkAction, isLocalFirstAction);
    } else {
      // Peer: send to host, wait for state update
      return handlePeerAction(storeApi, next, action, isNetworkAction, isLocalFirstAction);
    }
  };

/**
 * Handle action when this client is the host
 */
function handleHostAction(
  storeApi: MiddlewareAPI<Dispatch<AnyAction>, RootState>,
  next: Dispatch<AnyAction>,
  action: NetworkAction,
  isNetworkAction: boolean,
  isLocalFirstAction: boolean
): unknown {
  if (isNetworkAction) {
    const gameAction = convertToGameAction(action, storeApi.getState());
    return gameAction ? hostManager.handleAction(storeApi.getState().lobby.localPlayerId ?? '', gameAction) : undefined;
  }
  const result = next(action);


  // Host also needs to send lobby actions to the server
  // so the server can broadcast updated lobby state to all players
  if (isLocalFirstAction) {
    sendLobbyAction(action);
  }

  return result;
}

/**
 * Handle action when this client is a peer
 */
function handlePeerAction(
  storeApi: MiddlewareAPI<Dispatch<AnyAction>, RootState>,
  next: Dispatch<AnyAction>,
  action: NetworkAction,
  isNetworkAction: boolean,
  isLocalFirstAction: boolean
): unknown {
  if (isNetworkAction) {
    // Convert Redux action to GameAction
    const gameAction = convertToGameAction(action, storeApi.getState());

    if (gameAction) {
      // Send to host, don't process locally
      // State will be updated when host broadcasts new state
      peerManager.sendAction(gameAction);

      // Return undefined since we're not processing locally
      return undefined;
    }
  }

  if (isLocalFirstAction) {
    // Process locally first, then send to server
    const result = next(action);

    // Send corresponding message to server
    sendLobbyAction(action);

    return result;
  }

  // Default: just process locally
  return next(action);
}

/**
 * Convert a Redux action to a GameAction for network transmission
 */
function convertToGameAction(
  action: AnyAction,
  state: RootState
): GameAction | null {
  const playerId = state.lobby.localPlayerId || partyClient.playerId || '';

  // Map Redux action types to GameAction types
  switch (action.type) {
    case 'game/rollDice':
      return { type: 'ROLL_DICE' };

    case 'game/endTurn':
      return { type: 'END_TURN' };

    case 'game/buildSettlement':
      if (action.payload?.vertex) {
        return { type: 'BUILD_SETTLEMENT', vertex: action.payload.vertex };
      }
      return null;

    case 'game/buildCity':
      if (action.payload?.vertex) {
        return { type: 'BUILD_CITY', vertex: action.payload.vertex };
      }
      return null;

    case 'game/buildRoad':
      if (action.payload?.edge) {
        return { type: 'BUILD_ROAD', edge: action.payload.edge };
      }
      return null;

    case 'game/buildShip':
      if (action.payload?.edge) {
        return { type: 'BUILD_SHIP', edge: action.payload.edge };
      }
      return null;

    case 'game/buyDevCard':
      return { type: 'BUY_DEVELOPMENT_CARD' };

    case 'game/moveRobber':
      if (action.payload?.hex) {
        return { type: 'MOVE_ROBBER', hex: action.payload.hex };
      }
      return null;

    case 'game/stealResource':
      if (action.payload?.victimId) {
        return { type: 'STEAL_RESOURCE', victimId: action.payload.victimId };
      }
      return null;

    case 'game/discardResources':
      if (action.payload?.resources) {
        return { type: 'DISCARD_RESOURCES', resources: action.payload.resources };
      }
      return null;

    case 'game/offerTrade':
      if (action.payload?.offer) {
        return { type: 'OFFER_TRADE', offer: action.payload.offer };
      }
      return null;

    case 'game/acceptTrade':
      if (action.payload?.offerId) {
        return { type: 'ACCEPT_TRADE', offerId: action.payload.offerId };
      }
      return null;

    case 'game/declineTrade':
      if (action.payload?.offerId) {
        return { type: 'DECLINE_TRADE', offerId: action.payload.offerId };
      }
      return null;

    case 'game/cancelTrade':
      if (action.payload?.offerId) {
        return { type: 'CANCEL_TRADE', offerId: action.payload.offerId };
      }
      return null;

    case 'game/bankTrade':
      if (action.payload?.give && action.payload?.receive) {
        return {
          type: 'BANK_TRADE',
          give: action.payload.give,
          receive: action.payload.receive,
        };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Send lobby-related action to the server
 */
function sendLobbyAction(action: AnyAction): void {
  console.log('[NetworkMiddleware] sendLobbyAction called with:', action.type, action.payload);

  switch (action.type) {
    case 'lobby/setPlayerColor':
      if (action.payload?.color) {
        partyClient.send({
          type: 'SELECT_COLOR',
          color: action.payload.color,
        });
      }
      break;

    case 'lobby/setReady':
      // Server expects MARK_READY or UNMARK_READY
      const readyMessage = {
        type: action.payload?.isReady ? 'MARK_READY' : 'UNMARK_READY',
      };
      console.log('[NetworkMiddleware] Sending ready message:', readyMessage);
      partyClient.send(readyMessage as any);
      break;

    case 'lobby/setSettings':
      if (action.payload) {
        // Convert client settings to server format
        const serverSettings: Record<string, unknown> = {
          mode: action.payload.mode,
          maxPlayers: action.payload.playerCount,
          victoryPoints: action.payload.victoryPoints,
          turnTimer: action.payload.turnTimer,
          discardLimit: action.payload.discardLimit,
          friendlyRobber: action.payload.friendlyRobber,
          mapType: action.payload.mapType,
        };
        partyClient.send({
          type: 'UPDATE_SETTINGS',
          settings: serverSettings,
        });
      }
      break;
  }
}

// ============================================================================
// Helper to create network-aware action
// ============================================================================

/**
 * Create an action that indicates it came from the network
 */
export function createNetworkAction<T extends AnyAction>(
  action: T,
  playerId: string
): T & { meta: { fromNetwork: true; playerId: string } } {
  return {
    ...action,
    meta: {
      ...((action as any).meta || {}),
      fromNetwork: true,
      playerId,
    },
  };
}

export default networkMiddleware;
