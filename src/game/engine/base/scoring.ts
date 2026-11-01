import type { SessionView } from '@/session/protocol';
import { getEdgeVertices, vertexKey } from '@/utils/hex';

/** Maximum trail, with each road counted once. An opponent's building can end
 * a trail but cannot be traversed. Forks are not added together as a single road. */
export function roadLength(state: SessionView, playerId: string): number {
  const roads = state.board.roads.filter(r => r.playerId === playerId).map(r => getEdgeVertices(r.edge).map(vertexKey));
  const blocked = new Set(state.board.buildings.filter(b => b.playerId !== playerId).map(b => vertexKey(b.vertex)));
  const graph = new Map<string, number[]>();
  roads.forEach((ends, i) => ends.forEach(v => graph.set(v, [...(graph.get(v) ?? []), i])));
  function walk(vertex: string, visited: Set<number>): number {
    if (visited.size && blocked.has(vertex)) return 0;
    let best = 0;
    for (const edge of graph.get(vertex) ?? []) {
      if (visited.has(edge)) continue;
      const next = roads[edge].find(v => v !== vertex)!;
      best = Math.max(best, 1 + walk(next, new Set([...visited, edge])));
    }
    return best;
  }
  return Math.max(0, ...[...graph.keys()].map(vertex => walk(vertex, new Set())));
}
export function score(state: Pick<SessionView, 'game' | 'board' | 'players'>, playerId: string, includeHidden = false): number {
  const player = state.players.players.find(p => p.id === playerId);
  return state.board.buildings.filter(b => b.playerId === playerId).reduce((sum, b) => sum + (b.type === 'city' ? 2 : 1), 0)
    + (state.game.longestRoad?.playerId === playerId ? 2 : 0)
    + (state.game.largestArmy?.playerId === playerId ? 2 : 0)
    + (includeHidden ? player?.developmentCards.filter(c => c.type === 'victoryPoint' && !c.isPlayed).length ?? 0 : 0);
}
/** Caller owns the new candidate state. Never call on an input snapshot. */
export function updateScores(state: SessionView): void {
  const players = state.players.players;
  for (const player of players) player.longestRoadLength = roadLength(state, player.id);
  const longest = Math.max(0, ...players.map(p => p.longestRoadLength));
  const tied = players.filter(p => p.longestRoadLength === longest);
  const holder = tied.find(p => p.id === state.game.longestRoad?.playerId) ?? (tied.length === 1 ? tied[0] : undefined);
  state.game.longestRoad = longest >= 5 && holder ? { playerId: holder.id, value: longest } : null;
  // Only the active player may win, including immediately after a VP card purchase.
  const active = state.game.currentPlayerId;
  if (active && score(state, active, true) >= state.game.settings.victoryPoints) {
    state.game.phase = 'ended';
    state.game.winnerId = active;
    state.game.finalScores = Object.fromEntries(players.map(p => [p.id, score(state, p.id, true)]));
  }
}
