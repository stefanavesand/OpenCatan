import React, { useState, useCallback, useRef, useMemo } from 'react';
import type {
  HexCoord,
  VertexCoord,
  EdgeCoord,
  HexTile as HexTileType,
  Building,
  Road,
  PlayerColor,
  Port,
} from '../../types';
import {
  axialToPixel,
  hexToString,
  vertexKey,
  edgeKey,
  getHexVertices,
  getHexEdges,
} from '../../utils/hex';
import HexTile from './HexTile';
import Vertex from './Vertex';
import Edge from './Edge';
import { AnimatedRobber } from '../animations';
import PortIcon from './PortIcon';
import { generateStandardPorts, type PortPosition } from '../../utils/portGenerator';
import styles from './HexGrid.module.css';

interface HexGridProps {
  tiles: HexTileType[];
  buildings: Building[];
  roads: Road[];
  robberLocation: HexCoord;
  ports?: Port[];
  showPorts?: boolean;
  onVertexClick?: (coord: VertexCoord) => void;
  onEdgeClick?: (coord: EdgeCoord) => void;
  onHexClick?: (coord: HexCoord) => void;
  onRobberClick?: () => void;
  validVertices?: VertexCoord[];
  validEdges?: EdgeCoord[];
  validHexes?: HexCoord[];
  highlightedVertex?: VertexCoord;
  highlightedEdge?: EdgeCoord;
  currentPlayerColor?: PlayerColor;
  hexSize?: number;
}

/**
 * Calculate the bounding box for the board based on tile positions.
 */
function calculateBounds(tiles: HexTileType[], size: number) {
  if (tiles.length === 0) {
    return { minX: -200, maxX: 200, minY: -200, maxY: 200 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const tile of tiles) {
    const center = axialToPixel(tile.coord, size);
    const hexWidth = size * Math.sqrt(3);
    const hexHeight = size * 2;

    minX = Math.min(minX, center.x - hexWidth / 2);
    maxX = Math.max(maxX, center.x + hexWidth / 2);
    minY = Math.min(minY, center.y - hexHeight / 2);
    maxY = Math.max(maxY, center.y + hexHeight / 2);
  }

  // Add padding
  const padding = size;
  return {
    minX: minX - padding,
    maxX: maxX + padding,
    minY: minY - padding,
    maxY: maxY + padding,
  };
}

/**
 * Collect unique vertices from all tiles.
 */
function collectVertices(tiles: HexTileType[]): VertexCoord[] {
  const vertexSet = new Set<string>();
  const vertices: VertexCoord[] = [];

  for (const tile of tiles) {
    const hexVertices = getHexVertices(tile.coord);
    for (const v of hexVertices) {
      const key = vertexKey(v);
      if (!vertexSet.has(key)) {
        vertexSet.add(key);
        vertices.push(v);
      }
    }
  }

  return vertices;
}

/**
 * Collect unique edges from all tiles.
 */
function collectEdges(tiles: HexTileType[]): EdgeCoord[] {
  const edgeSet = new Set<string>();
  const edges: EdgeCoord[] = [];

  for (const tile of tiles) {
    const hexEdges = getHexEdges(tile.coord);
    for (const e of hexEdges) {
      const key = edgeKey(e);
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push(e);
      }
    }
  }

  return edges;
}

/**
 * HexGrid - Main board container component.
 * Renders the hex board with tiles, buildings, roads, and the robber.
 * Supports zoom and pan with transform.
 */
export const HexGrid: React.FC<HexGridProps> = ({
  tiles,
  buildings,
  roads,
  robberLocation,
  ports,
  showPorts = true,
  onVertexClick,
  onEdgeClick,
  onHexClick,
  onRobberClick,
  validVertices = [],
  validEdges = [],
  validHexes = [],
  highlightedVertex,
  highlightedEdge,
  currentPlayerColor,
  hexSize = 50,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Zoom and pan state
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Touch state for pinch-to-zoom
  const [touches, setTouches] = useState<React.TouchList | null>(null);
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);

  // Calculate viewBox dimensions
  const bounds = calculateBounds(tiles, hexSize);
  const viewWidth = bounds.maxX - bounds.minX;
  const viewHeight = bounds.maxY - bounds.minY;

  // Collect all vertices and edges for rendering
  const allVertices = collectVertices(tiles);
  const allEdges = collectEdges(tiles);

  // Create lookup maps for buildings and roads
  const buildingMap = new Map<string, Building>();
  for (const building of buildings) {
    buildingMap.set(vertexKey(building.vertex), building);
  }

  const roadMap = new Map<string, Road>();
  for (const road of roads) {
    roadMap.set(edgeKey(road.edge), road);
  }

  // Create lookup sets for valid placements
  const validVertexSet = new Set(validVertices.map(vertexKey));
  const validEdgeSet = new Set(validEdges.map(edgeKey));
  const validHexSet = new Set(validHexes.map(hexToString));

  // Get robber pixel position
  const robberPos = axialToPixel(robberLocation, hexSize);

  // Generate port positions for rendering
  // If ports are provided, use their position data; otherwise generate standard ports
  const portPositions: PortPosition[] = useMemo(() => {
    if (ports && ports.length > 0 && ports[0].position) {
      // Convert Port[] to PortPosition[] format
      return ports.map((port) => ({
        id: port.id,
        type: port.type,
        ratio: port.ratio,
        vertices: port.vertices || [
          { hex: { q: 0, r: 0 }, direction: 'N' as const },
          { hex: { q: 0, r: 0 }, direction: 'S' as const },
        ],
        x: port.position?.x || 0,
        y: port.position?.y || 0,
        rotation: port.position?.rotation || 0,
      }));
    }
    // Generate standard port positions
    return generateStandardPorts(hexSize);
  }, [ports, hexSize]);

  // Mouse handlers for pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) { // Left click only
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    }
  }, [transform.x, transform.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Wheel handler for zoom - slower zoom centered on mouse position
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    // Much slower zoom factor (was 0.95/1.05, now 0.98/1.02)
    const scaleFactor = e.deltaY > 0 ? 0.98 : 1.02;
    const newScale = Math.min(Math.max(transform.scale * scaleFactor, 0.5), 3);

    // Zoom toward cursor position
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (rect && svg) {
      // Get mouse position relative to the SVG element viewport
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Convert viewport coordinates to SVG coordinates using viewBox
      const viewportWidth = rect.width;
      const viewportHeight = rect.height;

      // The SVG coordinate that corresponds to the mouse position
      const svgX = bounds.minX + (mouseX / viewportWidth) * viewWidth;
      const svgY = bounds.minY + (mouseY / viewportHeight) * viewHeight;

      // Calculate the difference in scale
      const scaleRatio = newScale / transform.scale;

      // Calculate new translation to keep the point under cursor stationary
      // The formula: newTranslate = currentTranslate + (1 - scaleRatio) * pointInSVG
      const newX = transform.x + (1 - scaleRatio) * svgX;
      const newY = transform.y + (1 - scaleRatio) * svgY;

      setTransform({
        x: newX,
        y: newY,
        scale: newScale,
      });
    }
  }, [transform, viewWidth, viewHeight, bounds]);

  // Reset view on double-click
  const handleDoubleClick = useCallback(() => {
    setTransform({ x: 0, y: 0, scale: 1 });
  }, []);

  // Prevent default context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Touch handlers for pinch-to-zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Two fingers - prepare for pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      setLastPinchDistance(distance);
      setTouches(e.touches);
    } else if (e.touches.length === 1) {
      // Single touch - prepare for pan
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - transform.x,
        y: e.touches[0].clientY - transform.y
      });
    }
  }, [transform.x, transform.y]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDistance !== null) {
      // Pinch zoom
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];

      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      const scale = currentDistance / lastPinchDistance;
      const newScale = Math.min(Math.max(transform.scale * scale, 0.5), 3);

      // Calculate pinch center
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;

      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        // Get center position relative to the SVG element viewport
        const relX = centerX - rect.left;
        const relY = centerY - rect.top;

        // Convert viewport coordinates to SVG coordinates using viewBox
        const viewportWidth = rect.width;
        const viewportHeight = rect.height;

        // The SVG coordinate that corresponds to the pinch center
        const svgX = bounds.minX + (relX / viewportWidth) * viewWidth;
        const svgY = bounds.minY + (relY / viewportHeight) * viewHeight;

        // Calculate the difference in scale
        const scaleRatio = newScale / transform.scale;

        // Calculate new translation to keep the pinch center stationary
        const newX = transform.x + (1 - scaleRatio) * svgX;
        const newY = transform.y + (1 - scaleRatio) * svgY;

        setTransform({
          x: newX,
          y: newY,
          scale: newScale,
        });
      }

      setLastPinchDistance(currentDistance);
    } else if (e.touches.length === 1 && isDragging) {
      // Pan with single touch
      setTransform(prev => ({
        ...prev,
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y,
      }));
    }
  }, [transform, lastPinchDistance, isDragging, dragStart, viewWidth, viewHeight, bounds]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    setLastPinchDistance(null);
    setTouches(null);
  }, []);

  return (
    <div className={styles.hexGridContainer}>
      <svg
        ref={svgRef}
        className={styles.hexGrid}
        viewBox={`${bounds.minX} ${bounds.minY} ${viewWidth} ${viewHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <defs>
          {/* Gradient definitions for terrain textures */}
          <pattern id="hills-pattern" patternUnits="userSpaceOnUse" width="10" height="10">
            <circle cx="5" cy="5" r="2" fill="rgba(139, 69, 19, 0.3)" />
          </pattern>
          <pattern id="forest-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
            <path d="M0,4 L4,0 L8,4 L4,8 Z" fill="rgba(0, 100, 0, 0.2)" />
          </pattern>
          <pattern id="mountains-pattern" patternUnits="userSpaceOnUse" width="12" height="12">
            <path d="M0,12 L6,0 L12,12 Z" fill="rgba(100, 100, 100, 0.2)" />
          </pattern>
          <pattern id="pasture-pattern" patternUnits="userSpaceOnUse" width="6" height="6">
            <circle cx="3" cy="3" r="1" fill="rgba(255, 255, 255, 0.2)" />
          </pattern>

          {/* Building shadow removed for cleaner look */}

          {/* Sea edge blur filter */}
          <filter id="seaEdgeBlur">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
          </filter>
        </defs>

        <g
          className={styles.boardContent}
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          {/* Layer 1: Hex tiles (background) */}
          <g className={styles.tilesLayer}>
            {tiles.map((tile) => (
              <HexTile
                key={hexToString(tile.coord)}
                hex={tile.coord}
                terrain={tile.terrain}
                number={tile.number}
                hasRobber={false} // Robber rendered separately
                isValid={validHexSet.has(hexToString(tile.coord))}
                onClick={validHexSet.has(hexToString(tile.coord)) ? onHexClick : undefined}
                size={hexSize}
                allTiles={tiles}
              />
            ))}
          </g>

          {/* Layer 2: Edges (roads) */}
          <g className={styles.edgesLayer}>
            {allEdges.map((edge) => {
              const key = edgeKey(edge);
              return (
                <Edge
                  key={key}
                  coord={edge}
                  road={roadMap.get(key)}
                  isValid={validEdgeSet.has(key)}
                  isHighlighted={highlightedEdge ? edgeKey(highlightedEdge) === key : false}
                  onClick={onEdgeClick}
                  size={hexSize}
                  playerColor={currentPlayerColor}
                  allTiles={tiles}
                />
              );
            })}
          </g>

          {/* Layer 3: Vertices (buildings) */}
          <g className={styles.verticesLayer}>
            {allVertices.map((vertex) => {
              const key = vertexKey(vertex);
              return (
                <Vertex
                  key={key}
                  coord={vertex}
                  building={buildingMap.get(key)}
                  isValid={validVertexSet.has(key)}
                  isHighlighted={highlightedVertex ? vertexKey(highlightedVertex) === key : false}
                  onClick={onVertexClick}
                  size={hexSize}
                  playerColor={currentPlayerColor}
                />
              );
            })}
          </g>

          {/* Layer 4: Ports */}
          {showPorts && (
            <g className={styles.portsLayer}>
              {portPositions.map((port) => (
                <PortIcon
                  key={port.id}
                  type={port.type}
                  ratio={port.ratio}
                  x={port.x}
                  y={port.y}
                  rotation={port.rotation}
                  size={hexSize * 0.6}
                  vertices={port.vertices}
                  hexSize={hexSize}
                />
              ))}
            </g>
          )}

          {/* Layer 5: Robber */}
          <g className={styles.robberLayer}>
            <AnimatedRobber
              position={robberPos}
              onClick={onRobberClick}
            />
          </g>
        </g>
      </svg>

      {/* Zoom controls */}
      <div className={styles.zoomControls}>
        <button
          className={styles.zoomButton}
          onClick={() => setTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }))}
          title="Zoom In"
        >
          +
        </button>
        <button
          className={styles.zoomButton}
          onClick={() => setTransform(prev => ({ ...prev, scale: Math.max(prev.scale * 0.8, 0.5) }))}
          title="Zoom Out"
        >
          -
        </button>
        <button
          className={styles.zoomButton}
          onClick={() => setTransform({ x: 0, y: 0, scale: 1 })}
          title="Reset View"
        >
          R
        </button>
      </div>
    </div>
  );
};

export default HexGrid;
