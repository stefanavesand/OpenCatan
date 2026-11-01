import type { VertexCoord, EdgeCoord } from '@/types';
import type { SessionView } from '@/session/protocol';
import { getHexVertices, getHexEdges, getVertexEdges, getEdgeVertices, vertexKey, edgeKey } from '@/utils/hex';

type SetupBoard = Pick<SessionView, 'board' | 'game'>;
const unique = <T>(values: T[], key: (value: T) => string) => [...new Map(values.map(v => [key(v), v])).values()];
export function validSetupSettlements(state: SetupBoard): VertexCoord[] {
  const blocked = new Set<string>();
  for (const building of state.board.buildings) {
    blocked.add(vertexKey(building.vertex));
    for (const edge of getVertexEdges(building.vertex)) {
      for (const vertex of getEdgeVertices(edge)) blocked.add(vertexKey(vertex));
    }
  }
  return unique(state.board.tiles.filter(t => t.terrain !== 'water')
    .flatMap(tile => getHexVertices(tile.coord)), vertexKey).filter(vertex => !blocked.has(vertexKey(vertex)));
}
export function validSetupRoads(state: SetupBoard): EdgeCoord[] {
  const vertex = state.game.setupState?.lastPlacedSettlement;
  if (!vertex) return [];
  const landEdges = new Set(state.board.tiles.filter(t => t.terrain !== 'water')
    .flatMap(tile => getHexEdges(tile.coord)).map(edgeKey));
  const occupied = new Set(state.board.roads.map(road => edgeKey(road.edge)));
  return getVertexEdges(vertex).filter(edge => landEdges.has(edgeKey(edge)) && !occupied.has(edgeKey(edge)));
}
export function validCoordinate(value: unknown, directions: string[]): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as { hex?: { q: number; r: number }; direction?: string };
  return !!v.hex && Number.isSafeInteger(v.hex.q) && Number.isSafeInteger(v.hex.r) && directions.includes(v.direction ?? '');
}
