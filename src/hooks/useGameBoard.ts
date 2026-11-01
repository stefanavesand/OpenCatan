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
  selectLastPlacedSettlement,
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
import { getVerticesForHex, getAdjacentVertices, normalizeVertex } from '@/utils/vertex';
import { getEdgesForHex, getEdgesFromVertex } from '@/utils/edge';

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
 * Check if two vertices are equal
 */
function vertexEquals(a: VertexCoord, b: VertexCoord): boolean {
  return a.hex.q === b.hex.q && a.hex.r === b.hex.r && a.direction === b.direction;
}

/**
 * Check if two edges are equal
 */
function edgeEquals(a: EdgeCoord, b: EdgeCoord): boolean {
  return a.hex.q === b.hex.q && a.hex.r === b.hex.r && a.direction === b.direction;
}

/**
 * Check if two hexes are equal
 */
function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
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
  const lastPlacedSettlement = useAppSelector(selectLastPlacedSettlement);

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
    const validVertices: VertexCoord[] = [];
    const occupiedVertices = new Set<string>();
    const occupiedEdges = new Set<string>();

    // Helper to create normalized vertex key
    const getVertexKey = (v: VertexCoord): string => {
      const normalized = normalizeVertex(v);
      return `${normalized.hex.q},${normalized.hex.r},${normalized.direction}`;
    };

    // Build sets of occupied locations
    buildings.forEach(b => {
      occupiedVertices.add(getVertexKey(b.vertex));
      // Also add adjacent vertices (distance rule)
      const adjacentVerts = getAdjacentVertices(b.vertex);
      adjacentVerts.forEach(v => {
        occupiedVertices.add(getVertexKey(v));
      });
    });

    roads.forEach(r => {
      occupiedEdges.add(`${r.edge.hex.q},${r.edge.hex.r},${r.edge.direction}`);
    });

    // For setup phase, any unoccupied vertex on land is valid
    if (isSetupPhase) {
      const addedKeys = new Set<string>(); // Track added vertices to avoid duplicates
      tiles.forEach(tile => {
        if (tile.terrain === 'water') return;

        const vertices = getVerticesForHex(tile.coord);
        vertices.forEach(vertex => {
          const key = getVertexKey(vertex);
          if (!occupiedVertices.has(key) && !addedKeys.has(key)) {
            // Check if this vertex is on at least one land tile
            validVertices.push(vertex);
            addedKeys.add(key);
          }
        });
      });
    } else {
      // Normal gameplay: must be connected to player's roads
      const myRoads = roads.filter(r => r.playerId === localPlayerId);

      myRoads.forEach(road => {
        // Get vertices at each end of the road
        const roadVertices = getVerticesFromEdge(road.edge);
        roadVertices.forEach(vertex => {
          const key = getVertexKey(vertex);
          if (!occupiedVertices.has(key)) {
            // Check if already added
            if (!validVertices.some(v => vertexEquals(v, vertex))) {
              validVertices.push(vertex);
            }
          }
        });
      });
    }

    return validVertices;
  }, [buildMode, phase, buildings, roads, tiles, localPlayerId, isSetupPhase, setupBoard]);

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
    const validEdges: EdgeCoord[] = [];
    const occupiedEdges = new Set<string>();

    // Build set of occupied edges
    roads.forEach(r => {
      occupiedEdges.add(`${r.edge.hex.q},${r.edge.hex.r},${r.edge.direction}`);
    });

    // For setup phase after placing settlement, road must connect to that settlement
    if (isSetupPhase && lastPlacedSettlement) {
      const edgesFromSettlement = getEdgesFromVertex(lastPlacedSettlement);
      edgesFromSettlement.forEach(edge => {
        const key = `${edge.hex.q},${edge.hex.r},${edge.direction}`;
        if (!occupiedEdges.has(key)) {
          // Check if edge is on land (at least one adjacent hex is not water)
          const isOnLand = tiles.some(
            t => t.terrain !== 'water' && (
              hexEquals(t.coord, edge.hex) ||
              // Check if edge connects to this tile
              getEdgesForHex(t.coord).some(e => edgeEquals(e, edge))
            )
          );
          if (isOnLand) {
            validEdges.push(edge);
          }
        }
      });
    } else {
      // Normal gameplay: must be connected to player's roads or buildings
      const myBuildings = buildings.filter(b => b.playerId === localPlayerId);
      const myRoads = roads.filter(r => r.playerId === localPlayerId);

      // Edges from buildings
      myBuildings.forEach(building => {
        const edgesFromBuilding = getEdgesFromVertex(building.vertex);
        edgesFromBuilding.forEach(edge => {
          const key = `${edge.hex.q},${edge.hex.r},${edge.direction}`;
          if (!occupiedEdges.has(key)) {
            if (!validEdges.some(e => edgeEquals(e, edge))) {
              validEdges.push(edge);
            }
          }
        });
      });

      // Edges from existing roads
      myRoads.forEach(road => {
        const roadVertices = getVerticesFromEdge(road.edge);
        roadVertices.forEach(vertex => {
          // Check if there's an enemy building blocking
          const blockingBuilding = buildings.find(
            b => b.playerId !== localPlayerId && vertexEquals(b.vertex, vertex)
          );
          if (blockingBuilding) return;

          const edgesFromVertex = getEdgesFromVertex(vertex);
          edgesFromVertex.forEach(edge => {
            const key = `${edge.hex.q},${edge.hex.r},${edge.direction}`;
            if (!occupiedEdges.has(key)) {
              if (!validEdges.some(e => edgeEquals(e, edge))) {
                validEdges.push(edge);
              }
            }
          });
        });
      });
    }

    return validEdges;
  }, [buildMode, phase, roads, buildings, tiles, localPlayerId, isSetupPhase, lastPlacedSettlement, setupBoard]);

  // Calculate valid robber hexes
  const validRobberHexes = useMemo(() => {
    if (!isRobberPhase || !isMyTurn) {
      return [];
    }

    // All land tiles except current robber location
    return tiles
      .filter(t => t.terrain !== 'water' && !hexEquals(t.coord, robberLocation))
      .map(t => t.coord);
  }, [isRobberPhase, isMyTurn, tiles, robberLocation]);

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

/**
 * Get the two vertices at the ends of an edge
 */
function getVerticesFromEdge(edge: EdgeCoord): VertexCoord[] {
  // Edge directions: E, NE, NW, W, SW, SE
  // Each edge connects two vertices
  const { hex, direction } = edge;

  switch (direction) {
    case 'E':
      return [
        { hex, direction: 'NE' },
        { hex, direction: 'SE' },
      ];
    case 'NE':
      return [
        { hex, direction: 'N' },
        { hex, direction: 'NE' },
      ];
    case 'NW':
      return [
        { hex, direction: 'N' },
        { hex, direction: 'NW' },
      ];
    case 'W':
      return [
        { hex, direction: 'NW' },
        { hex, direction: 'SW' },
      ];
    case 'SW':
      return [
        { hex, direction: 'S' },
        { hex, direction: 'SW' },
      ];
    case 'SE':
      return [
        { hex, direction: 'S' },
        { hex, direction: 'SE' },
      ];
    default:
      return [];
  }
}

export default useGameBoard;
