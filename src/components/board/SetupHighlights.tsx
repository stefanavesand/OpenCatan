/**
 * SetupHighlights - Board overlay for highlighting valid setup placements
 *
 * Displays:
 * - Highlighted valid settlement spots during settlement placement
 * - Highlighted valid road spots during road placement
 * - Animated pulse effect on valid spots
 * - Only shows spots based on current setup constraints
 */

import React, { useMemo } from 'react';
import type { VertexCoord, EdgeCoord, PlayerColor } from '../../types';
import { PLAYER_COLOR_HEX, vertexToKey, edgeToKey } from '../../types';
import { hexToPixel, HEX_SIZE, getEdgePosition, getEdgeRotation } from '../../utils/hexMath';
import styles from '../overlays/setup.module.css';

// ============================================================================
// Types
// ============================================================================

export interface SetupHighlightsProps {
  /** Valid settlement vertices to highlight */
  validSettlements: VertexCoord[];
  /** Valid road edges to highlight */
  validRoads: EdgeCoord[];
  /** Current placement type */
  placementType: 'settlement' | 'road';
  /** Current player's color */
  playerColor: PlayerColor;
  /** Whether it's the local player's turn */
  isMyTurn: boolean;
  /** Callback when a vertex is clicked */
  onVertexClick?: (vertex: VertexCoord) => void;
  /** Callback when an edge is clicked */
  onEdgeClick?: (edge: EdgeCoord) => void;
  /** Hex size for positioning */
  hexSize?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert vertex coordinate to pixel position
 */
function vertexToPixel(
  vertex: VertexCoord,
  hexSize: number = HEX_SIZE
): { x: number; y: number } {
  const hexCenter = hexToPixel(vertex.hex.q, vertex.hex.r, hexSize);

  // Calculate vertex offset based on direction
  // For pointy-top hexagons:
  // N vertex is at the top
  // S vertex is at the bottom
  const verticalOffset = vertex.direction === 'N' ? -hexSize : hexSize;

  return {
    x: hexCenter.x,
    y: hexCenter.y + verticalOffset,
  };
}

// ============================================================================
// Component
// ============================================================================

export const SetupHighlights: React.FC<SetupHighlightsProps> = ({
  validSettlements,
  validRoads,
  placementType,
  playerColor,
  isMyTurn,
  onVertexClick,
  onEdgeClick,
  hexSize = HEX_SIZE,
}) => {
  // Get color value
  const colorHex = PLAYER_COLOR_HEX[playerColor] || '#888888';

  // Only show highlights if it's the player's turn
  if (!isMyTurn) {
    return null;
  }

  // Memoize vertex highlights
  const settlementHighlights = useMemo(() => {
    if (placementType !== 'settlement') return null;

    return validSettlements.map((vertex) => {
      const pos = vertexToPixel(vertex, hexSize);
      const key = vertexToKey(vertex);

      return (
        <g key={key} className={styles.setupHighlightVertex}>
          {/* Pulse animation ring */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={12}
            fill="none"
            stroke={colorHex}
            strokeWidth={2}
            className={styles.pulseRing}
            opacity={0.6}
          />

          {/* Main highlight circle */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={10}
            fill={`${colorHex}40`}
            stroke={colorHex}
            strokeWidth={2}
            className={styles.highlightCircle}
            onClick={() => onVertexClick?.(vertex)}
            style={{ cursor: 'pointer' }}
          />

          {/* Center dot */}
          <circle
            cx={pos.x}
            cy={pos.y}
            r={4}
            fill={colorHex}
            className={styles.highlightDot}
          />
        </g>
      );
    });
  }, [placementType, validSettlements, colorHex, hexSize, onVertexClick]);

  // Memoize edge highlights
  const roadHighlights = useMemo(() => {
    if (placementType !== 'road') return null;

    // Road dimensions match Edge.tsx and RoadPiece.tsx - vertical orientation
    const roadLength = hexSize * 1.0;
    const roadThickness = hexSize * 0.25;

    return validRoads.map((edge) => {
      // Use the same edge position calculation as Edge.tsx
      const direction = edge.direction as 'NE' | 'E' | 'SE';
      const position = getEdgePosition(edge.hex, direction, hexSize);
      const rotation = getEdgeRotation(direction);
      const key = edgeToKey(edge);

      return (
        <g
          key={key}
          className={styles.setupHighlightEdge}
          transform={`translate(${position.x}, ${position.y}) rotate(${rotation})`}
        >
          {/* Pulse animation rect - vertical orientation */}
          <rect
            x={-roadThickness / 2 - 2}
            y={-roadLength / 2 - 2}
            width={roadThickness + 4}
            height={roadLength + 4}
            fill={colorHex}
            rx={4}
            ry={4}
            className={styles.pulseEdge}
            opacity={0.3}
          />

          {/* Main highlight rect - vertical orientation */}
          <rect
            x={-roadThickness / 2}
            y={-roadLength / 2}
            width={roadThickness}
            height={roadLength}
            fill={`${colorHex}80`}
            stroke={colorHex}
            strokeWidth={2}
            rx={3}
            ry={3}
            className={styles.highlightLine}
            onClick={() => onEdgeClick?.(edge)}
            style={{ cursor: 'pointer' }}
          />

          {/* Center indicator */}
          <circle
            cx={0}
            cy={0}
            r={5}
            fill={colorHex}
            className={styles.highlightEdgeDot}
          />
        </g>
      );
    });
  }, [placementType, validRoads, colorHex, hexSize, onEdgeClick]);

  return (
    <g className={styles.setupHighlights}>
      {/* Render settlement highlights */}
      {settlementHighlights}

      {/* Render road highlights */}
      {roadHighlights}
    </g>
  );
};

export default SetupHighlights;
