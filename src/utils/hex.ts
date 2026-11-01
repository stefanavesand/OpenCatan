/**
 * Core hex grid math utilities for axial coordinate system.
 * Uses axial coordinates (q, r) where q is column and r is row.
 *
 * Hex orientation: pointy-top hexagons
 *
 * @module hex
 */

// TODO: Import HexCoord from /src/types when types module is created
/**
 * Axial coordinate for a hex tile.
 * q = column (increases going right/southeast)
 * r = row (increases going down/south)
 */
export interface HexCoord {
  q: number;
  r: number;
}

/**
 * Pixel position on screen.
 */
export interface PixelCoord {
  x: number;
  y: number;
}

/**
 * Direction vectors for the 6 neighbors of a hex in axial coordinates.
 * Ordered clockwise starting from East.
 */
const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },   // East
  { q: 1, r: -1 },  // Northeast
  { q: 0, r: -1 },  // Northwest
  { q: -1, r: 0 },  // West
  { q: -1, r: 1 },  // Southwest
  { q: 0, r: 1 },   // Southeast
] as const;

/**
 * Converts axial hex coordinates to pixel coordinates for rendering.
 * Uses pointy-top hex orientation.
 *
 * @param hex - The axial hex coordinate
 * @param size - The size (radius) of the hex from center to corner
 * @returns The pixel coordinates of the hex center
 *
 * @example
 * ```ts
 * const pixel = axialToPixel({ q: 0, r: 0 }, 50);
 * // Returns { x: 0, y: 0 } for the origin hex
 * ```
 */
export function axialToPixel(hex: HexCoord, size: number): PixelCoord {
  // For pointy-top hexes:
  // x = size * sqrt(3) * (q + r/2)
  // y = size * 3/2 * r
  const x = size * Math.sqrt(3) * (hex.q + hex.r / 2);
  const y = size * (3 / 2) * hex.r;
  return { x, y };
}

/**
 * Converts pixel coordinates to the nearest axial hex coordinate.
 * Uses pointy-top hex orientation with cube coordinate rounding.
 *
 * @param x - The x pixel coordinate
 * @param y - The y pixel coordinate
 * @param size - The size (radius) of the hex from center to corner
 * @returns The axial hex coordinate containing or nearest to the pixel
 *
 * @example
 * ```ts
 * const hex = pixelToAxial(100, 50, 50);
 * // Returns the hex coordinate at that pixel position
 * ```
 */
export function pixelToAxial(x: number, y: number, size: number): HexCoord {
  // Convert pixel to fractional axial coordinates
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
  const r = (2 / 3 * y) / size;

  // Convert to cube coordinates for rounding
  const cubeX = q;
  const cubeZ = r;
  const cubeY = -cubeX - cubeZ;

  // Round to nearest cube coordinate
  let rx = Math.round(cubeX);
  let ry = Math.round(cubeY);
  let rz = Math.round(cubeZ);

  // Fix rounding errors by resetting the component with largest diff
  const xDiff = Math.abs(rx - cubeX);
  const yDiff = Math.abs(ry - cubeY);
  const zDiff = Math.abs(rz - cubeZ);

  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }

  // Convert back to axial (q = x, r = z)
  return { q: rx, r: rz };
}

/**
 * Gets the 6 neighboring hex coordinates adjacent to the given hex.
 * Neighbors are returned in clockwise order starting from East.
 *
 * @param hex - The center hex coordinate
 * @returns Array of 6 neighboring hex coordinates
 *
 * @example
 * ```ts
 * const neighbors = getHexNeighbors({ q: 0, r: 0 });
 * // Returns the 6 hexes surrounding the origin
 * ```
 */
export function getHexNeighbors(hex: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map((dir) => ({
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  }));
}

/**
 * Gets a specific neighbor of a hex by direction index.
 * Direction indices: 0=E, 1=NE, 2=NW, 3=W, 4=SW, 5=SE
 *
 * @param hex - The center hex coordinate
 * @param direction - Direction index (0-5)
 * @returns The neighboring hex coordinate in that direction
 */
export function getHexNeighbor(hex: HexCoord, direction: number): HexCoord {
  const dir = HEX_DIRECTIONS[((direction % 6) + 6) % 6];
  return {
    q: hex.q + dir.q,
    r: hex.r + dir.r,
  };
}

/**
 * Calculates the Manhattan distance between two hexes.
 * This is the minimum number of hex steps to travel between them.
 *
 * @param a - First hex coordinate
 * @param b - Second hex coordinate
 * @returns The distance in hex steps
 *
 * @example
 * ```ts
 * const distance = getHexDistance({ q: 0, r: 0 }, { q: 2, r: -1 });
 * // Returns 2
 * ```
 */
export function getHexDistance(a: HexCoord, b: HexCoord): number {
  // Using cube coordinate distance formula
  // distance = (|x1-x2| + |y1-y2| + |z1-z2|) / 2
  // where x = q, z = r, y = -q - r
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = (-a.q - a.r) - (-b.q - b.r); // s = -q - r

  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));
}

/**
 * Checks if two hex coordinates are equal.
 *
 * @param a - First hex coordinate
 * @param b - Second hex coordinate
 * @returns True if the coordinates are equal
 */
export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

/**
 * Checks if two hexes are adjacent (neighbors).
 *
 * @param a - First hex coordinate
 * @param b - Second hex coordinate
 * @returns True if the hexes are adjacent
 */
export function areHexesAdjacent(a: HexCoord, b: HexCoord): boolean {
  return getHexDistance(a, b) === 1;
}

/**
 * Converts a hex coordinate to a unique string key.
 * Useful for using hex coordinates as Map/Set keys or object properties.
 *
 * @param hex - The hex coordinate
 * @returns A string representation like "0,0" or "-1,2"
 *
 * @example
 * ```ts
 * const key = hexToString({ q: -1, r: 2 });
 * // Returns "-1,2"
 * ```
 */
export function hexToString(hex: HexCoord): string {
  return `${hex.q},${hex.r}`;
}

/**
 * Parses a string key back to a hex coordinate.
 * Inverse of hexToString.
 *
 * @param str - String in format "q,r"
 * @returns The parsed hex coordinate
 * @throws Error if the string format is invalid
 *
 * @example
 * ```ts
 * const hex = stringToHex("-1,2");
 * // Returns { q: -1, r: 2 }
 * ```
 */
export function stringToHex(str: string): HexCoord {
  const parts = str.split(',');
  if (parts.length !== 2) {
    throw new Error(`Invalid hex string format: "${str}". Expected "q,r".`);
  }

  const q = parseInt(parts[0], 10);
  const r = parseInt(parts[1], 10);

  if (isNaN(q) || isNaN(r)) {
    throw new Error(`Invalid hex coordinates in string: "${str}". q and r must be integers.`);
  }

  return { q, r };
}

/**
 * Adds two hex coordinates together.
 *
 * @param a - First hex coordinate
 * @param b - Second hex coordinate (or offset)
 * @returns The sum of the two coordinates
 */
export function addHex(a: HexCoord, b: HexCoord): HexCoord {
  return {
    q: a.q + b.q,
    r: a.r + b.r,
  };
}

/**
 * Subtracts hex coordinate b from a.
 *
 * @param a - First hex coordinate
 * @param b - Hex coordinate to subtract
 * @returns The difference (a - b)
 */
export function subtractHex(a: HexCoord, b: HexCoord): HexCoord {
  return {
    q: a.q - b.q,
    r: a.r - b.r,
  };
}

/**
 * Scales a hex coordinate by a scalar value.
 *
 * @param hex - The hex coordinate
 * @param factor - The scale factor
 * @returns The scaled hex coordinate
 */
export function scaleHex(hex: HexCoord, factor: number): HexCoord {
  return {
    q: hex.q * factor,
    r: hex.r * factor,
  };
}

/**
 * Gets all hexes within a given radius of the center hex.
 * Includes the center hex itself.
 *
 * @param center - The center hex coordinate
 * @param radius - The radius in hex steps (0 = just center, 1 = center + neighbors, etc.)
 * @returns Array of all hex coordinates within the radius
 */
export function getHexesInRadius(center: HexCoord, radius: number): HexCoord[] {
  const hexes: HexCoord[] = [];

  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      hexes.push({
        q: center.q + q,
        r: center.r + r,
      });
    }
  }

  return hexes;
}

/**
 * Gets the ring of hexes at exactly the given radius from center.
 * Does not include hexes closer than the radius.
 *
 * @param center - The center hex coordinate
 * @param radius - The radius in hex steps (must be >= 1)
 * @returns Array of hex coordinates forming the ring
 */
export function getHexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius < 1) {
    return radius === 0 ? [center] : [];
  }

  const hexes: HexCoord[] = [];
  let hex = addHex(center, scaleHex(HEX_DIRECTIONS[4], radius)); // Start at SW corner

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      hexes.push(hex);
      hex = getHexNeighbor(hex, i);
    }
  }

  return hexes;
}

// ============================================================
// Vertex and Edge Coordinate Systems
// ============================================================

/**
 * Vertex coordinate - intersection point where buildings can be placed.
 * Each vertex is identified by a hex and a direction from that hex's center.
 */
export interface VertexCoord {
  hex: HexCoord;
  direction: 'N' | 'S' | 'NE' | 'NW' | 'SE' | 'SW';
}

/**
 * Edge coordinate - edge where roads/ships can be placed.
 * Each edge is identified by a hex and a direction from that hex's center.
 */
export interface EdgeCoord {
  hex: HexCoord;
  direction: 'NE' | 'E' | 'SE' | 'NW' | 'W' | 'SW';
}

/**
 * Get pixel position of a vertex.
 * For pointy-top hexes:
 * - N (North) vertex is at the top corner
 * - S (South) vertex is at the bottom corner
 */
export function vertexToPixel(vertex: VertexCoord, size: number): PixelCoord {
  const hexCenter = axialToPixel(vertex.hex, size);

  if (vertex.direction === 'N') {
    // North vertex - top of pointy-top hex
    return {
      x: hexCenter.x,
      y: hexCenter.y - size,
    };
  } else {
    // South vertex - bottom of pointy-top hex
    return {
      x: hexCenter.x,
      y: hexCenter.y + size,
    };
  }
}

/**
 * Get pixel position of an edge center.
 * For pointy-top hexes, edges are positioned at the midpoint between two vertices.
 * All 6 directions are supported for flexibility.
 */
export function edgeToPixel(edge: EdgeCoord, size: number): PixelCoord {
  const hexCenter = axialToPixel(edge.hex, size);
  const halfWidth = size * Math.sqrt(3) / 2;

  switch (edge.direction) {
    case 'NE':
      return {
        x: hexCenter.x + halfWidth / 2,
        y: hexCenter.y - size * 0.75,
      };
    case 'E':
      return {
        x: hexCenter.x + halfWidth,
        y: hexCenter.y,
      };
    case 'SE':
      return {
        x: hexCenter.x + halfWidth / 2,
        y: hexCenter.y + size * 0.75,
      };
    case 'SW':
      return {
        x: hexCenter.x - halfWidth / 2,
        y: hexCenter.y + size * 0.75,
      };
    case 'W':
      return {
        x: hexCenter.x - halfWidth,
        y: hexCenter.y,
      };
    case 'NW':
      return {
        x: hexCenter.x - halfWidth / 2,
        y: hexCenter.y - size * 0.75,
      };
    default:
      return hexCenter;
  }
}

/**
 * Get the rotation angle for an edge in degrees.
 * Used for rotating road/ship SVGs to align with the edge.
 */
export function getEdgeRotation(direction: 'NE' | 'E' | 'SE' | 'NW' | 'W' | 'SW'): number {
  switch (direction) {
    case 'NE':
    case 'SW':
      return -60;
    case 'E':
    case 'W':
      return 0;
    case 'SE':
    case 'NW':
      return 60;
    default:
      return 0;
  }
}

/**
 * Create a unique key string from vertex coordinates.
 */
export function vertexKey(vertex: VertexCoord): string {
  return `${vertex.hex.q},${vertex.hex.r},${vertex.direction}`;
}

/**
 * Create a unique key string from edge coordinates.
 */
export function edgeKey(edge: EdgeCoord): string {
  return `${edge.hex.q},${edge.hex.r},${edge.direction}`;
}

/**
 * Get all 6 vertex coordinates adjacent to a hex.
 * Returns vertices in clockwise order starting from N (top).
 *
 * For a pointy-top hex, the 6 corners are:
 * 1. TOP (12 o'clock) - N vertex of this hex
 * 2. TOP-RIGHT (2 o'clock) - S vertex of NE neighbor
 * 3. BOTTOM-RIGHT (4 o'clock) - N vertex of SE neighbor
 * 4. BOTTOM (6 o'clock) - S vertex of this hex
 * 5. BOTTOM-LEFT (8 o'clock) - N vertex of SW neighbor
 * 6. TOP-LEFT (10 o'clock) - S vertex of NW neighbor
 */
export function getHexVertices(hex: HexCoord): VertexCoord[] {
  return [
    { hex, direction: 'N' },                                 // TOP
    { hex: { q: hex.q + 1, r: hex.r - 1 }, direction: 'S' }, // TOP-RIGHT (S of NE neighbor)
    { hex: { q: hex.q, r: hex.r + 1 }, direction: 'N' },     // BOTTOM-RIGHT (N of SE neighbor)
    { hex, direction: 'S' },                                 // BOTTOM
    { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: 'N' }, // BOTTOM-LEFT (N of SW neighbor)
    { hex: { q: hex.q, r: hex.r - 1 }, direction: 'S' },     // TOP-LEFT (S of NW neighbor)
  ];
}

/**
 * Get all 6 edge coordinates adjacent to a hex.
 * Returns edges in clockwise order starting from NE.
 */
export function getHexEdges(hex: HexCoord): EdgeCoord[] {
  return [
    { hex, direction: 'NE' },
    { hex, direction: 'E' },
    { hex, direction: 'SE' },
    { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: 'NE' },
    { hex: { q: hex.q - 1, r: hex.r }, direction: 'E' },
    { hex: { q: hex.q, r: hex.r - 1 }, direction: 'SE' },
  ];
}

/**
 * Get the 6 corner points of a hex for rendering.
 * Returns points for pointy-top hexagon starting from top, going clockwise.
 */
export function getHexCorners(center: PixelCoord, size: number): PixelCoord[] {
  const corners: PixelCoord[] = [];
  for (let i = 0; i < 6; i++) {
    // For pointy-top, start at -90 degrees (top)
    const angleDeg = 60 * i - 90;
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad),
    });
  }
  return corners;
}

/**
 * Get hex corners as SVG polygon points string.
 */
export function getHexPolygonPoints(center: PixelCoord, size: number): string {
  const corners = getHexCorners(center, size);
  return corners.map(p => `${p.x},${p.y}`).join(' ');
}

/**
 * Generate hex coordinates for a standard Catan board (19 hexes).
 */
export function generateStandardBoard(): HexCoord[] {
  const hexes: HexCoord[] = [];

  // Standard Catan board is 19 hexes in a specific pattern
  // Row by row from top to bottom (pointy-top orientation)
  const rows = [
    { r: -2, qStart: 0, qEnd: 2 },
    { r: -1, qStart: -1, qEnd: 2 },
    { r: 0, qStart: -2, qEnd: 2 },
    { r: 1, qStart: -2, qEnd: 1 },
    { r: 2, qStart: -2, qEnd: 0 },
  ];

  for (const row of rows) {
    for (let q = row.qStart; q <= row.qEnd; q++) {
      hexes.push({ q, r: row.r });
    }
  }

  return hexes;
}

/**
 * Get vertices adjacent to an edge (the two endpoints).
 */
export function getEdgeVertices(edge: EdgeCoord): [VertexCoord, VertexCoord] {
  const { hex, direction } = edge;

  switch (direction) {
    case 'NE':
      return [
        { hex, direction: 'N' },
        { hex: { q: hex.q + 1, r: hex.r - 1 }, direction: 'S' },
      ];
    case 'E':
      return [
        { hex: { q: hex.q + 1, r: hex.r - 1 }, direction: 'S' },
        { hex: { q: hex.q, r: hex.r + 1 }, direction: 'N' },
      ];
    case 'SE':
      return [
        { hex: { q: hex.q, r: hex.r + 1 }, direction: 'N' },
        { hex, direction: 'S' },
      ];
    default:
      return [
        { hex, direction: 'N' },
        { hex, direction: 'S' },
      ];
  }
}

/**
 * Get edges adjacent to a vertex.
 */
export function getVertexEdges(vertex: VertexCoord): EdgeCoord[] {
  const { hex, direction } = vertex;

  if (direction === 'N') {
    return [
      { hex, direction: 'NE' },
      { hex: { q: hex.q, r: hex.r - 1 }, direction: 'E' },
      { hex: { q: hex.q, r: hex.r - 1 }, direction: 'SE' },
    ];
  } else {
    return [
      { hex, direction: 'SE' },
      { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: 'NE' },
      { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: 'E' },
    ];
  }
}

/**
 * Check if two vertices are equal.
 */
export function vertexEquals(a: VertexCoord, b: VertexCoord): boolean {
  return a.hex.q === b.hex.q && a.hex.r === b.hex.r && a.direction === b.direction;
}

/**
 * Check if two edges are equal.
 */
export function edgeEquals(a: EdgeCoord, b: EdgeCoord): boolean {
  return a.hex.q === b.hex.q && a.hex.r === b.hex.r && a.direction === b.direction;
}
