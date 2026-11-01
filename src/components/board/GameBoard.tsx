/**
 * GameBoard - Main board container component for OpenCatan
 *
 * This component combines the HexGrid with interactive overlays for:
 * - Building placement (settlements, cities)
 * - Road placement
 * - Robber movement
 *
 * It manages build mode states and coordinates click interactions.
 */

import React, { useCallback, useMemo } from 'react';
import type {
  HexCoord,
  VertexCoord,
  EdgeCoord,
  HexTile as HexTileType,
  Building,
  Road,
  PlayerColor,
} from '../../types';
import { HEX_SIZE } from '../../utils/hexMath';
import HexGrid from './HexGrid';
import styles from './board.module.css';

// ============================================================
// Types
// ============================================================

/**
 * Build mode determines what the player is currently trying to place
 */
export type BuildMode =
  | 'none'           // No build action active
  | 'settlement'     // Placing a settlement
  | 'city'           // Upgrading to a city
  | 'road'           // Placing a road
  | 'ship'           // Placing a ship (Seafarers)
  | 'robber'         // Moving the robber
  | 'pirate'         // Moving the pirate (Seafarers)
  | 'knight';        // Placing/moving a knight (C&K)

/**
 * Props for the GameBoard component
 */
export interface GameBoardProps {
  // Board data
  tiles: HexTileType[];
  buildings: Building[];
  roads: Road[];
  robberLocation: HexCoord;
  pirateLocation?: HexCoord;

  // Current player info
  currentPlayerColor?: PlayerColor;

  // Build mode
  buildMode: BuildMode;

  // Valid placement locations (only shown when in corresponding build mode)
  validSettlementVertices?: VertexCoord[];
  validCityVertices?: VertexCoord[];
  validRoadEdges?: EdgeCoord[];
  validRobberHexes?: HexCoord[];

  // Event handlers
  onPlaceSettlement?: (vertex: VertexCoord) => void;
  onPlaceCity?: (vertex: VertexCoord) => void;
  onPlaceRoad?: (edge: EdgeCoord) => void;
  onMoveRobber?: (hex: HexCoord) => void;
  onClickRobber?: () => void;

  // Board configuration
  hexSize?: number;

  // UI state
  disabled?: boolean;
}

// ============================================================
// Component
// ============================================================

/**
 * GameBoard - The main interactive game board component.
 *
 * This component wraps the HexGrid and manages:
 * - Build mode highlighting
 * - Click interactions for placing buildings, roads, and robber
 * - Keyboard shortcuts for build modes (optional)
 *
 * @example
 * ```tsx
 * <GameBoard
 *   tiles={gameState.tiles}
 *   buildings={gameState.buildings}
 *   roads={gameState.roads}
 *   robberLocation={gameState.robberLocation}
 *   buildMode="settlement"
 *   validSettlementVertices={validVertices}
 *   onPlaceSettlement={handlePlaceSettlement}
 *   currentPlayerColor="red"
 * />
 * ```
 */
export const GameBoard: React.FC<GameBoardProps> = ({
  tiles,
  buildings,
  roads,
  robberLocation,
  // pirateLocation is reserved for Seafarers expansion
  pirateLocation: _pirateLocation,
  currentPlayerColor,
  buildMode,
  validSettlementVertices = [],
  validCityVertices = [],
  validRoadEdges = [],
  validRobberHexes = [],
  onPlaceSettlement,
  onPlaceCity,
  onPlaceRoad,
  onMoveRobber,
  onClickRobber,
  hexSize = HEX_SIZE,
  disabled = false,
}) => {
  // Reserved for future hover state preview functionality
  // const [hoveredVertex, setHoveredVertex] = useState<VertexCoord | null>(null);
  // const [hoveredEdge, setHoveredEdge] = useState<EdgeCoord | null>(null);
  // const [hoveredHex, setHoveredHex] = useState<HexCoord | null>(null);
  void _pirateLocation; // Suppress unused variable warning

  // Determine which valid placements to show based on build mode
  // During setup phase, valid placements are passed directly and should always be shown
  const activeValidVertices = useMemo(() => {
    if (disabled) return [];
    switch (buildMode) {
      case 'settlement':
        return validSettlementVertices;
      case 'city':
        return validCityVertices;
      case 'none':
      default:
        // During setup phase or when no explicit build mode,
        // show settlement vertices if they're provided
        // This allows setup phase to work without requiring buildMode to be set
        return validSettlementVertices.length > 0 ? validSettlementVertices : [];
    }
  }, [buildMode, validSettlementVertices, validCityVertices, disabled]);

  const activeValidEdges = useMemo(() => {
    if (disabled) return [];
    switch (buildMode) {
      case 'road':
      case 'ship':
        return validRoadEdges;
      case 'none':
      default:
        // During setup phase or when no explicit build mode,
        // show road edges if they're provided
        return validRoadEdges.length > 0 ? validRoadEdges : [];
    }
  }, [buildMode, validRoadEdges, disabled]);

  const activeValidHexes = useMemo(() => {
    switch (buildMode) {
      case 'robber':
      case 'pirate':
        return validRobberHexes;
      case 'none':
      default:
        // During robber phase or when no explicit build mode,
        // show robber hexes if they're provided
        // This allows robber phase to work without requiring buildMode to be set
        return validRobberHexes.length > 0 ? validRobberHexes : [];
    }
  }, [buildMode, validRobberHexes]);

  // Handle vertex click based on build mode
  const handleVertexClick = useCallback((vertex: VertexCoord) => {
    if (disabled) return;

    switch (buildMode) {
      case 'settlement':
        if (onPlaceSettlement) {
          onPlaceSettlement(vertex);
        }
        break;
      case 'city':
        if (onPlaceCity) {
          onPlaceCity(vertex);
        }
        break;
      case 'none':
      default:
        // During setup phase or when no explicit build mode,
        // still allow placing settlements if valid vertices are provided
        if (validSettlementVertices.length > 0 && onPlaceSettlement) {
          onPlaceSettlement(vertex);
        }
        break;
    }
  }, [buildMode, disabled, onPlaceSettlement, onPlaceCity, validSettlementVertices]);

  // Handle edge click based on build mode
  const handleEdgeClick = useCallback((edge: EdgeCoord) => {
    if (disabled) return;

    switch (buildMode) {
      case 'road':
      case 'ship':
        if (onPlaceRoad) {
          onPlaceRoad(edge);
        }
        break;
      case 'none':
      default:
        // During setup phase or when no explicit build mode,
        // still allow placing roads if valid edges are provided
        if (validRoadEdges.length > 0 && onPlaceRoad) {
          onPlaceRoad(edge);
        }
        break;
    }
  }, [buildMode, disabled, onPlaceRoad, validRoadEdges]);

  // Handle hex click based on build mode
  const handleHexClick = useCallback((hex: HexCoord) => {
    if (disabled) return;

    switch (buildMode) {
      case 'robber':
      case 'pirate':
        if (onMoveRobber) {
          onMoveRobber(hex);
        }
        break;
      case 'none':
      default:
        // During robber phase or when no explicit build mode,
        // still allow moving robber if valid hexes are provided
        if (validRobberHexes.length > 0 && onMoveRobber) {
          onMoveRobber(hex);
        }
        break;
    }
  }, [buildMode, disabled, onMoveRobber, validRobberHexes]);

  // Handle robber click
  const handleRobberClick = useCallback(() => {
    if (disabled) return;

    if (onClickRobber) {
      onClickRobber();
    }
  }, [disabled, onClickRobber]);

  // Get build mode indicator text
  const getBuildModeText = (): string => {
    switch (buildMode) {
      case 'settlement':
        return 'Click a highlighted intersection to place a settlement';
      case 'city':
        return 'Click a settlement to upgrade it to a city';
      case 'road':
        return 'Click a highlighted edge to place a road';
      case 'ship':
        return 'Click a highlighted edge to place a ship';
      case 'robber':
        return 'Click a hex to move the robber';
      case 'pirate':
        return 'Click a water hex to move the pirate';
      case 'knight':
        return 'Click a vertex to place or move a knight';
      default:
        return '';
    }
  };

  const buildModeText = getBuildModeText();

  return (
    <div
      className={`${styles.gameBoardContainer} ${disabled ? styles.disabled : ''}`}
      data-build-mode={buildMode}
    >
      {/* Build mode indicator */}
      {buildMode !== 'none' && buildModeText && (
        <div className={styles.buildModeIndicator}>
          <span className={styles.buildModeIcon}>
            {buildMode === 'settlement' && '🏠'}
            {buildMode === 'city' && '🏰'}
            {buildMode === 'road' && '🛤️'}
            {buildMode === 'ship' && '⛵'}
            {buildMode === 'robber' && '🦹'}
            {buildMode === 'pirate' && '🏴‍☠️'}
            {buildMode === 'knight' && '⚔️'}
          </span>
          <span className={styles.buildModeText}>{buildModeText}</span>
        </div>
      )}

      {/* Main hex grid */}
      <HexGrid
        tiles={tiles}
        buildings={buildings}
        roads={roads}
        robberLocation={robberLocation}
        onVertexClick={handleVertexClick}
        onEdgeClick={handleEdgeClick}
        onHexClick={handleHexClick}
        onRobberClick={handleRobberClick}
        validVertices={activeValidVertices}
        validEdges={activeValidEdges}
        validHexes={activeValidHexes}
        highlightedVertex={undefined}
        highlightedEdge={undefined}
        currentPlayerColor={currentPlayerColor}
        hexSize={hexSize}
      />

    </div>
  );
};

export default GameBoard;
