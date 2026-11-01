// Settlement heuristic adapted from 8910work-cell/catan-ai strong_ai.js
// commit 3e75df8c48e44a3f474a0bb366f654844cec3d37 (MIT).
// Copyright (c) 2026 8910work-cell. Full notice: licenses/catan-ai-MIT.txt.
// Adapted to immutable player observations; no global state, runtime/model or hidden hands.
import type { ResourceCounts, ResourceType, VertexCoord, EdgeCoord } from '@/types';
import { getHexVertices, getEdgeVertices, vertexKey } from '@/utils/hex';
import { COSTS, RESOURCES } from '@/game/engine/base/economy';
import { validSettlements } from '@/game/engine/base/board';
import { validSetupSettlements } from '@/game/engine/setupValidation';
import type { CatanView, CatanAction, BotLevel } from './catan';
export const BOT_VERSION = 'heuristic-1.0.0';
const terrain: Partial<Record<string, ResourceType>> = { hills: 'brick', forest: 'lumber', mountains: 'ore', fields: 'grain', pasture: 'wool' };
const pips = (n?: number) => n && n !== 7 ? 6 - Math.abs(7 - n) : 0;
function production(view: CatanView, vertex: VertexCoord): ResourceCounts {
  const result = { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 };
  for (const tile of view.state.board.tiles) if (getHexVertices(tile.coord).some(v => vertexKey(v) === vertexKey(vertex))) { const r = terrain[tile.terrain]; if (r) result[r] += pips(tile.number); }
  return result;
}
export function settlementValue(view: CatanView, vertex: VertexCoord): number {
  const amounts = production(view, vertex), owned = view.state.board.buildings.filter(b => b.playerId === view.you);
  const existing = owned.map(b => production(view, b.vertex));
  let value = Object.values(amounts).reduce((a,b) => a+b, 0) * 2 + Object.values(amounts).filter(n => n>0).length * 4;
  const newBonus = { lumber: 5, brick: 5, grain: 4, ore: 4, wool: 3 };
  for (const r of RESOURCES) if (amounts[r] > 0 && !existing.some(e => e[r] > 0)) value += newBonus[r];
  for (const tile of view.state.board.tiles) if ([6,8].includes(tile.number!) && getHexVertices(tile.coord).some(v => vertexKey(v) === vertexKey(vertex))) value += 2;
  for (const port of view.state.board.ports) if (port.vertices.some(v => vertexKey(v) === vertexKey(vertex))) value += port.type === 'generic' ? 2 : amounts[port.type] > 0 ? 3 : 1;
  return value;
}
function goals(view: CatanView): Partial<ResourceCounts>[] {
  const player = view.state.players.players.find(p => p.id === view.you)!;
  const result: Partial<ResourceCounts>[] = [];
  if (player.settlementsRemaining > 0 && validSettlements(view.state, view.you).length) result.push(COSTS.settlement);
  if (player.citiesRemaining > 0 && view.state.board.buildings.some(b => b.playerId === view.you && b.type === 'settlement')) result.push(COSTS.city);
  if (player.roadsRemaining > 0 && player.settlementsRemaining > 0) result.push({ brick: 2, lumber: 2, wool: 1, grain: 1 });
  if (view.state.game.developmentDeckCount > 0) result.push(COSTS.development);
  return result.length ? result : [COSTS.city];
}
function deficit(resources: ResourceCounts, goal: Partial<ResourceCounts>): number { return RESOURCES.reduce((total,r) => total + Math.max(0,(goal[r]||0)-resources[r]),0); }
function target(view: CatanView): Partial<ResourceCounts> {
  const resources = view.state.players.players.find(p => p.id === view.you)!.resources;
  return goals(view).reduce((best,goal) => deficit(resources,goal) < deficit(resources,best) ? goal : best);
}
function roadValue(view: CatanView, edge: EdgeCoord): number {
  // Bounded public-board estimate of expansion toward a future settlement.
  const state = structuredClone(view.state); state.board.roads.push({ id: 'candidate', type: 'road', playerId: view.you, edge });
  const reachable = validSettlements(state, view.you);
  if (reachable.length) return 40 + Math.max(...reachable.map(v => settlementValue(view,v))) / 4;
  const targets = new Map(validSetupSettlements(state).map(v => [vertexKey(v),v]));
  const start = getEdgeVertices(edge);
  let best = 0;
  // Approximate expansion potential by hex-grid pixel distance, not private simulation.
  for (const v of start) for (const candidate of targets.values()) {
    const distance = Math.abs(v.hex.q-candidate.hex.q)+Math.abs(v.hex.r-candidate.hex.r)+Number(v.direction!==candidate.direction);
    if (distance <= 3) best = Math.max(best, settlementValue(view,candidate)/(distance+1));
  }
  return best;
}
export function chooseBot(view: CatanView, level: BotLevel = 'standard', sample: () => number = () => .5): CatanAction {
  if (!view.choices.length) throw new Error('No legal decision for this bot.');
  if (view.choices.length > 256 || JSON.stringify(view).length > 131072) throw new Error('Bot observation exceeds the work budget.');
  const own = view.state.players.players.find(p => p.id === view.you)!;
  const goal = target(view), need = (r: ResourceType) => Math.max(0,(goal[r]||0)-own.resources[r]);
  function value(action: CatanAction): number {
    switch (action.type) {
      case 'PLACE_SETTLEMENT': return settlementValue(view,action.vertex);
      case 'PLACE_ROAD': return roadValue(view,action.edge);
      case 'BUILD_SETTLEMENT': return 140 + settlementValue(view,action.vertex);
      case 'BUILD_CITY': return 135 + Object.values(production(view,action.vertex)).reduce((a,b)=>a+b,0);
      case 'BUILD_ROAD': return (view.state.game.phase === 'road-building' ? 100 : own.settlementsRemaining > 0 ? 35 : 5) + roadValue(view,action.edge);
      case 'BUY_DEVELOPMENT_CARD': return 80;
      case 'ROLL_DICE': return 10;
      case 'END_TURN': return 0;
      case 'PLAY_KNIGHT': return 95;
      case 'PLAY_ROAD_BUILDING': return 90;
      case 'PLAY_YEAR_OF_PLENTY': return 100 + action.resources.reduce((n,r)=>n+need(r),0);
      case 'PLAY_MONOPOLY': return 100 + need(action.resource) * 2;
      case 'BANK_TRADE': {
        const after = { ...own.resources }; after[action.give.resource]-=action.give.amount; after[action.receive.resource]+=action.receive.amount;
        const improve = deficit(own.resources,goal)-deficit(after,goal);
        return improve > 0 ? 45 + improve : -100;
      }
      case 'DISCARD_RESOURCES': return 100;
      case 'MOVE_ROBBER': {
        const tile = view.state.board.tiles.find(t=>t.coord.q===action.hex.q&&t.coord.r===action.hex.r)!;
        const corners = new Set(getHexVertices(tile.coord).map(vertexKey));
        return view.state.board.buildings.filter(b=>corners.has(vertexKey(b.vertex))).reduce((sum,b)=>sum+(b.playerId===view.you?-30:10)*pips(tile.number),0);
      }
      case 'STEAL_RESOURCE': return view.state.players.players.find(p=>p.id===action.victimId)?.resourceCount || 0;
      case 'TRADE_CANCEL': case 'TRADE_DECLINE': return 0;
      case 'TRADE_ACCEPT': {
        const offer = view.offer!; const after = { ...own.resources };
        for(const r of RESOURCES) after[r]+=offer.give[r]-offer.receive[r];
        return deficit(after,goal) < deficit(own.resources,goal) && Object.values(offer.give).reduce((a,b)=>a+b,0)>=Object.values(offer.receive).reduce((a,b)=>a+b,0) ? 20 : -10;
      }
      default: return -100;
    }
  }
  // Easy uses noisier priorities; both levels remain legal and bounded, with no strength guarantee.
  return view.choices.map((action,index)=>({ action,index, score:value(action)+(level==='easy'?sample()*35:sample()*.01) })).reduce((best,candidate)=>candidate.score>best.score?candidate:best).action;
}
export function botDecision(view: CatanView, level: BotLevel): CatanAction {
  let seed = 2166136261;
  for (const ch of `${view.id}:${view.revision}:${view.you}:${BOT_VERSION}`) seed = Math.imul(seed ^ ch.charCodeAt(0),16777619) >>> 0;
  return chooseBot(view,level,()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; });
}
