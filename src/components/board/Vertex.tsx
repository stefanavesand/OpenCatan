import React from 'react';
import type { VertexCoord, Building as BuildingType, PlayerColor } from '../../types';
import { vertexToPixel, vertexKey } from '../../utils/hex';
import Building from './Building';

interface VertexProps {
  coord: VertexCoord;
  building?: BuildingType;
  isValid?: boolean;
  isHighlighted?: boolean;
  onClick?: (coord: VertexCoord) => void;
  size?: number;
  playerColor?: PlayerColor; // For showing valid placement preview
}

/**
 * Vertex - Renders an intersection point where buildings can be placed.
 * Shows a small circle indicator, and if a building exists, renders it.
 */
export const Vertex: React.FC<VertexProps> = ({
  coord,
  building,
  isValid = false,
  isHighlighted = false,
  onClick,
  size = 50,
  playerColor,
}) => {
  const position = vertexToPixel(coord, size);
  const key = vertexKey(coord);

  const handleClick = () => {
    if (onClick && (isValid || building)) {
      onClick(coord);
    }
  };

  // Determine the visual state
  const showPlacementIndicator = isValid && !building;
  const showHighlight = isHighlighted && !building;

  return (
    <g
      className="vertex"
      data-can-place={isValid && !building && !!onClick ? "true" : undefined}
      data-vertex-key={key}
      onClick={handleClick}
      style={{ cursor: onClick && (isValid || building) ? 'pointer' : 'default' }}
    >
      {/* Valid placement indicator */}
      {showPlacementIndicator && (
        <circle
          cx={position.x}
          cy={position.y}
          r={8}
          fill={playerColor ? getPlayerColorValue(playerColor) : '#4caf50'}
          fillOpacity={0.6}
          stroke={playerColor ? getPlayerColorValue(playerColor) : '#4caf50'}
          strokeWidth={2}
          className="valid-placement"
        >
          <animate
            attributeName="r"
            values="6;8;6"
            dur="1s"
            repeatCount="indefinite"
          />
        </circle>
      )}

      {showPlacementIndicator && (
        <circle cx={position.x} cy={position.y} r={12} fill="transparent" className="placement-hit" />
      )}

      {/* Hover highlight */}
      {showHighlight && (
        <circle
          cx={position.x}
          cy={position.y}
          r={10}
          fill="rgba(255, 255, 255, 0.3)"
          stroke="#fff"
          strokeWidth={2}
        />
      )}

      {/* Building */}
      {building && (
        <Building
          type={building.type}
          color={building.playerColor}
          position={position}
        />
      )}

      {/* Debug/development: small dot showing vertex position */}
      {!building && !showPlacementIndicator && (
        <circle
          cx={position.x}
          cy={position.y}
          r={3}
          fill="rgba(0, 0, 0, 0.1)"
          className="vertex-dot"
        />
      )}
    </g>
  );
};

/**
 * Helper to get player color hex value
 */
function getPlayerColorValue(color: PlayerColor): string {
  const colors: Record<PlayerColor, string> = {
    red: '#e53935',
    blue: '#1e88e5',
    orange: '#fb8c00',
    white: '#f5f5f5',
    green: '#43a047',
    purple: '#8e24aa',
    black: '#424242',
    bronze: '#cd7f32',
    gold: '#ffd700',
    silver: '#c0c0c0',
    pink: '#f48fb1',
    mysticblue: '#4fc3f7',
  };
  return colors[color];
}

export default Vertex;
