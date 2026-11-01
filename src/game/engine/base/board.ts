import type { EdgeCoord, Port, PortType, VertexCoord } from '@/types';
import type { SessionView } from '@/session/protocol';
import { getHexEdges, getEdgeVertices, getVertexEdges, edgeKey, vertexKey, edgeToPixel } from '@/utils/hex';
import { HEX_SIZE } from '@/utils/hexMath';
import { validSetupSettlements } from '../setupValidation';

type BoardState = Pick<SessionView, 'board' | 'game'>;
export function landEdges(state: BoardState): EdgeCoord[] {
  return [...new Map(state.board.tiles.filter(t => t.terrain !== 'water')
    .flatMap(t => getHexEdges(t.coord)).map(e => [edgeKey(e), e])).values()];
}
export function validRoads(state: BoardState, playerId: string): EdgeCoord[] {
  const occupied = new Set(state.board.roads.map(r => edgeKey(r.edge)));
  const ownEdges = new Set(state.board.roads.filter(r => r.playerId === playerId).map(r => edgeKey(r.edge)));
  return landEdges(state).filter(edge => !occupied.has(edgeKey(edge)) && getEdgeVertices(edge).some(vertex => {
    const building = state.board.buildings.find(b => vertexKey(b.vertex) === vertexKey(vertex));
    if (building) return building.playerId === playerId;
    return getVertexEdges(vertex).some(e => ownEdges.has(edgeKey(e)));
  }));
}
export function validSettlements(state: BoardState, playerId: string): VertexCoord[] {
  const connected = new Set(state.board.roads.filter(r => r.playerId === playerId).flatMap(r => getEdgeVertices(r.edge)).map(vertexKey));
  return validSetupSettlements(state).filter(v => connected.has(vertexKey(v)));
}
export function bankRate(state: BoardState, playerId: string, resource: string): number {
  const owned = new Set(state.board.buildings.filter(b => b.playerId === playerId).map(b => vertexKey(b.vertex)));
  let rate = 4;
  for (const port of state.board.ports) {
    if (port.vertices?.some(v => owned.has(vertexKey(v)))) {
      if (port.type === resource) rate = 2;
      else if (port.type === 'generic') rate = Math.min(rate, 3);
    }
  }
  return rate;
}

/** Nine non-overlapping ports on actual coastal edges. Rendering and trade rules
 * use these same vertices, rather than separate decorative port definitions. */
export function createBasePorts(state: BoardState): Port[] {
  const counts = new Map<string, { edge: EdgeCoord; count: number }>();
  for (const tile of state.board.tiles) for (const edge of getHexEdges(tile.coord)) {
    const key = edgeKey(edge);
    counts.set(key, { edge, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  const coast = [...counts.values()].filter(e => e.count === 1).map(e => e.edge)
    .sort((a, b) => { const p = edgeToPixel(a, 1), q = edgeToPixel(b, 1); return Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x); });
  const types: PortType[] = ['generic', 'grain', 'ore', 'generic', 'wool', 'generic', 'generic', 'brick', 'lumber'];
  return [0, 3, 6, 10, 13, 16, 20, 23, 26].map((index, n) => {
    const edge = coast[index];
    const point = edgeToPixel(edge, HEX_SIZE);
    const distance = Math.hypot(point.x, point.y);
    const factor = 1 + HEX_SIZE * 0.7 / distance;
    return { id: `port-${n}`, edge, type: types[n], ratio: types[n] === 'generic' ? 3 : 2,
      vertices: getEdgeVertices(edge), position: { x: point.x * factor, y: point.y * factor,
        rotation: Math.atan2(point.y, point.x) * 180 / Math.PI + 90 } };
  });
}
