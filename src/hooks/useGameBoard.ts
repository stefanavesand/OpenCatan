import { robberPlacements } from '@/game/engine/base/turn';
import { validRoads, validSettlements } from '@/game/engine/base/board';
import { validSetupSettlements, validSetupRoads } from '@/game/engine/setupValidation';
/**
 * useGameBoard - Hook for connecting GameBoard to Redux state
 *
 * Provides all data and handlers needed by the GameBoard component,
 * including tiles, buildings, roads, robber location, valid placements,
 * and click handlers for building/moving pieces.
 */

import { useCallback, useMemo } from 'react';
import { useAppSelector, useAppDispatch } from '@/hooks';
import {
  // Board selectors
  selectTiles,
  selectBuildings,
  selectRoads,
  selectRobberLocation,
  selectPirateLocation,
  // UI selectors
  selectBuildMode,
  selectSelectedAction,
  // Game selectors
  selectPhase,
  selectCurrentPlayerId,
  selectLocalPlayerId,
  // Player selectors
  selectCurrentPlayer,
  // UI actions
  setBuildMode,
  clearSelectedAction,
} from '@/game/state';
import { useGameActions } from '@/network/hooks/useGameActions';
import type { HexCoord, VertexCoord, EdgeCoord } from '@/types/coordinates';
import type { HexTile, Building, Road } from '@/types/board';
import type { PlayerColor } from '@/types/common';
import type { BuildMode } from '@/game/state/slices/uiSlice';

/**
 * Return type for useGameBoard hook
 */
export interface UseGameBoardReturn {
  // Board data
  tiles: HexTile[];
  buildings: Building[];
  roads: Road[];
  robberLocation: HexCoord;
  pirateLocation: HexCoord | null;

  // Current player info
  currentPlayerColor: PlayerColor | undefined;

  // Build mode
  buildMode: BuildMode;

  // Valid placement locations
  validSettlementVertices: VertexCoord[];
  validCityVertices: VertexCoord[];
  validRoadEdges: EdgeCoord[];
  validRobberHexes: HexCoord[];

  // Click handlers
  handlePlaceSettlement: (vertex: VertexCoord) => void;
  handlePlaceCity: (vertex: VertexCoord) => void;
  handlePlaceRoad: (edge: EdgeCoord) => void;
  handleMoveRobber: (hex: HexCoord) => void;
  handleClickRobber: () => void;

  // Build mode controls
  setBuildMode: (mode: BuildMode) => void;
  cancelBuildMode: () => void;

  // State flags
  isMyTurn: boolean;
  disabled: boolean;
}

/**
 * Hook for connecting GameBoard to Redux state
 *
 * @example
 * ```tsx
 * function GamePage() {
 *   const {
 *     tiles,
 *     buildings,
 *     roads,
 *     robberLocation,
 *     buildMode,
 *     validSettlementVertices,
 *     handlePlaceSettlement,
 *     handlePlaceRoad,
 *   } = useGameBoard();
 *
 *   return (
 *     <GameBoard
 *       tiles={tiles}
 *       buildings={buildings}
 *       roads={roads}
 *       robberLocation={robberLocation}
 *       buildMode={buildMode}
 *       validSettlementVertices={validSettlementVertices}
 *       onPlaceSettlement={handlePlaceSettlement}
 *       onPlaceRoad={handlePlaceRoad}
 *     />
 *   );
 * }
 * ```
 */
export function useGameBoard(): UseGameBoardReturn {
  const dispatch = useAppDispatch();

  // Board state
  const boardState = useAppSelector(state => state.board);
  const gameState = useAppSelector(state => state.game);
  const playerState = useAppSelector(state => state.players);
  const setupBoard = useMemo(() => ({ board: boardState, game: gameState }), [boardState, gameState]);
  const tiles = useAppSelector(selectTiles);
  const buildings = useAppSelector(selectBuildings);
  const roads = useAppSelector(selectRoads);
  const robberLocation = useAppSelector(selectRobberLocation);
  const pirateLocation = useAppSelector(selectPirateLocation);

  // UI state
  const buildMode = useAppSelector(selectBuildMode);
  const selectedAction = useAppSelector(selectSelectedAction);

  // Game state
  const phase = useAppSelector(selectPhase);
  const currentPlayerId = useAppSelector(selectCurrentPlayerId);
  const localPlayerId = useAppSelector(selectLocalPlayerId);

  // Player state
  const currentPlayer = useAppSelector(selectCurrentPlayer);
  const currentPlayerColor = currentPlayer?.color;

  // Game actions
  const {
    buildSettlement,
    buildCity,
    buildRoad,
    moveRobber,
  } = useGameActions();

  // Derived state
  const isMyTurn = currentPlayerId === localPlayerId;
  const isSetupPhase = phase.startsWith('setup-');
  const isRobberPhase = ['robber-move', 'pirate-move'].includes(phase);

  // Calculate valid settlement vertices
  const validSettlementVertices = useMemo(() => {
    if (buildMode !== 'settlement' && !phase.includes('settlement')) {
      return [];
    }

    if (isSetupPhase) return validSetupSettlements(setupBoard);
    return validSettlements(setupBoard, localPlayerId ?? "");
  }, [buildMode, phase, localPlayerId, isSetupPhase, setupBoard]);

  // Calculate valid city vertices (player's settlements)
  const validCityVertices = useMemo(() => {
    if (buildMode !== 'city') {
      return [];
    }

    return buildings
      .filter(b => b.playerId === localPlayerId && b.type === 'settlement')
      .map(b => b.vertex);
  }, [buildMode, buildings, localPlayerId]);

  // Calculate valid road edges
  const validRoadEdges = useMemo(() => {
    if (buildMode !== 'road' && !phase.includes('road')) {
      return [];
    }

    if (isSetupPhase) return validSetupRoads(setupBoard);
    return validRoads(setupBoard, localPlayerId ?? "");
  }, [buildMode, phase, localPlayerId, isSetupPhase, setupBoard]);

  // Calculate valid robber hexes
  const validRobberHexes = useMemo(() => {
    if (!isRobberPhase || !isMyTurn) {
      return [];
    }

    return robberPlacements({ ...setupBoard, players: playerState }, localPlayerId ?? '');
  }, [isRobberPhase, isMyTurn, setupBoard, playerState, localPlayerId]);

  // Click handlers
  const handlePlaceSettlement = useCallback((vertex: VertexCoord) => {
    if (!isMyTurn) return;
    buildSettlement(vertex);
    dispatch(clearSelectedAction());
  }, [isMyTurn, buildSettlement, dispatch]);

  const handlePlaceCity = useCallback((vertex: VertexCoord) => {
    if (!isMyTurn) return;
    buildCity(vertex);
    dispatch(clearSelectedAction());
  }, [isMyTurn, buildCity, dispatch]);

  const handlePlaceRoad = useCallback((edge: EdgeCoord) => {
    if (!isMyTurn) return;
    buildRoad(edge);
    // Don't clear action during setup (might need to place more)
    if (!isSetupPhase) {
      dispatch(clearSelectedAction());
    }
  }, [isMyTurn, buildRoad, dispatch, isSetupPhase]);

  const handleMoveRobber = useCallback((hex: HexCoord) => {
    if (!isMyTurn || !isRobberPhase) return;
    moveRobber(hex);
  }, [isMyTurn, isRobberPhase, moveRobber]);

  const handleClickRobber = useCallback(() => {
    // Could trigger robber info modal or other interaction
    console.log('Robber clicked');
  }, []);

  // Build mode controls
  const handleSetBuildMode = useCallback((mode: BuildMode) => {
    dispatch(setBuildMode(mode));
  }, [dispatch]);

  const cancelBuildMode = useCallback(() => {
    dispatch(clearSelectedAction());
  }, [dispatch]);

  // Determine if board should be disabled
  const disabled = !isMyTurn || phase === 'ended' || phase === 'lobby';

  return {
    // Board data
    tiles,
    buildings,
    roads,
    robberLocation,
    pirateLocation,

    // Current player info
    currentPlayerColor,

    // Build mode
    buildMode,

    // Valid placements
    validSettlementVertices,
    validCityVertices,
    validRoadEdges,
    validRobberHexes,

    // Click handlers
    handlePlaceSettlement,
    handlePlaceCity,
    handlePlaceRoad,
    handleMoveRobber,
    handleClickRobber,

    // Build mode controls
    setBuildMode: handleSetBuildMode,
    cancelBuildMode,

    // State flags
    isMyTurn,
    disabled,
  };
}

export default useGameBoard;
