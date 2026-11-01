// Pure, replayable setup session. IDs, player order and timestamps are supplied by callers.
import { generateBeginnerBoard, getTerrainResource } from '@/utils/boardGenerator';
import { axialToPixel, getHexCorners, getHexVertices, getEdgeVertices, vertexToPixel, vertexKey, edgeKey } from '@/utils/hex';
import type { EdgeCoord, VertexCoord } from '@/types';
import { validCoordinate, validSetupSettlements, validSetupRoads } from './setupValidation';
export { axialToPixel, getHexCorners, getEdgeVertices, vertexToPixel, vertexKey, edgeKey };
export const SETUP_RULE_VERSION = 1;
export const PLAYER_COLORS = ['#b73a32', '#2466c0', '#b8670b', '#24714e'];
export interface SetupCommand {
  commandId: string; playerId: string; expectedRevision: number;
  type: 'settlement' | 'road'; position: VertexCoord | EdgeCoord;
}
export interface SetupRecord {
  schemaVersion: 1; ruleVersion: 1; game: 'catan-setup'; id: string;
  revision: number; playerCount: 3 | 4; order: number[]; savedAt: number; moves: SetupCommand[];
}
const resources = () => ({ brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 });
function initial(record: SetupRecord) {
  return {
    board: { tiles: generateBeginnerBoard(), buildings: [] as { vertex: VertexCoord; playerId: string }[], roads: [] as { edge: EdgeCoord; playerId: string }[] },
    game: { setupState: { lastPlacedSettlement: null as VertexCoord | null } },
    players: Array.from({ length: record.playerCount }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, color: PLAYER_COLORS[i], resources: resources() })),
  };
}
function active(record: SetupRecord, revision: number) {
  const placement = Math.floor(revision / 2);
  const index = placement < record.playerCount ? placement : record.playerCount * 2 - 1 - placement;
  return `p${record.order[index] + 1}`;
}
function apply(state: ReturnType<typeof initial>, record: SetupRecord, move: SetupCommand, revision: number) {
  if (revision >= record.playerCount * 4) throw new Error('Setup is already complete.');
  if (!move || typeof move.commandId !== 'string' || !move.commandId.length || move.commandId.length > 100) throw new Error('Invalid command ID.');
  if (move.expectedRevision !== revision) throw new Error('The setup has changed. Reload the latest save before choosing a placement.');
  if (move.playerId !== active(record, revision)) throw new Error('It is another player’s turn.');
  const settlement = revision % 2 === 0;
  if (move.type !== (settlement ? 'settlement' : 'road')) throw new Error(settlement ? 'Place a settlement first.' : 'Place a road next to your new settlement.');
  if (!validCoordinate(move.position, settlement ? ['N', 'S'] : ['NE', 'E', 'SE'])) throw new Error('Invalid board coordinate.');
  const legal = settlement ? validSetupSettlements(state).some(v => vertexKey(v) === vertexKey(move.position as VertexCoord)) : validSetupRoads(state).some(e => edgeKey(e) === edgeKey(move.position as EdgeCoord));
  if (!legal) throw new Error(settlement ? 'Choose an empty intersection at least two edges from another settlement.' : 'Choose an empty road next to the settlement just placed.');
  if (settlement) {
    const vertex = move.position as VertexCoord;
    state.board.buildings.push({ vertex, playerId: move.playerId });
    state.game.setupState.lastPlacedSettlement = vertex;
    if (revision >= record.playerCount * 2) {
      const player = state.players.find(p => p.id === move.playerId)!;
      for (const tile of state.board.tiles) if (getHexVertices(tile.coord).some(v => vertexKey(v) === vertexKey(vertex))) {
        const resource = getTerrainResource(tile.terrain) as keyof typeof player.resources | null;
        if (resource) player.resources[resource]++;
      }
    }
  } else { state.board.roads.push({ edge: move.position as EdgeCoord, playerId: move.playerId }); state.game.setupState.lastPlacedSettlement = null; }
}
export function validateSetup(value: unknown): SetupRecord {
  const record = value as SetupRecord;
  if (!record || record.schemaVersion !== 1 || record.ruleVersion !== 1 || record.game !== 'catan-setup') throw new Error('This Catan setup save requires a compatible app version. No saved data has been changed.');
  if (typeof record.id !== 'string' || !record.id.length || record.id.length > 100 || ![3, 4].includes(record.playerCount) || !Array.isArray(record.order) || record.order.length !== record.playerCount || new Set(record.order).size !== record.playerCount || record.order.some(i => !Number.isInteger(i) || i < 0 || i >= record.playerCount) || !Number.isSafeInteger(record.savedAt) || record.savedAt < 0 || !Array.isArray(record.moves) || record.moves.length > record.playerCount * 4 || record.revision !== record.moves.length) throw new Error('The Catan setup save is invalid. No saved data has been changed.');
  const state = initial(record), ids = new Set<string>();
  const moves = record.moves.map((move, index) => {
    apply(state, record, move, index);
    if (ids.has(move.commandId)) throw new Error('The save contains duplicate command IDs.');
    ids.add(move.commandId);
    return { commandId: move.commandId, playerId: move.playerId, expectedRevision: index, type: move.type,
      position: { hex: { q: move.position.hex.q, r: move.position.hex.r }, direction: move.position.direction } } as SetupCommand;
  });
  return { schemaVersion: 1, ruleVersion: 1, game: 'catan-setup', id: record.id, revision: moves.length, playerCount: record.playerCount, order: [...record.order], savedAt: record.savedAt, moves };
}
export function createSetup(id: string, playerCount: 3 | 4, order: number[], now: number): SetupRecord {
  return validateSetup({ schemaVersion: 1, ruleVersion: 1, game: 'catan-setup', id, revision: 0, playerCount, order, savedAt: now, moves: [] });
}
export function setupPosition(input: SetupRecord) {
  const record = validateSetup(input), state = initial(record);
  record.moves.forEach((move, i) => apply(state, record, move, i));
  const complete = record.revision === record.playerCount * 4;
  return { ...state, phase: complete ? 'complete' : record.revision % 2 === 0 ? 'settlement' : 'road',
    playerId: complete ? null : active(record, record.revision), round: record.revision < record.playerCount * 2 ? 1 : 2,
    settlements: complete || record.revision % 2 ? [] : validSetupSettlements(state), roads: !complete && record.revision % 2 ? validSetupRoads(state) : [] };
}
export function submitSetup(input: SetupRecord, command: SetupCommand, now: number) {
  const record = validateSetup(input);
  const index = record.moves.findIndex(m => m.commandId === command.commandId);
  if (index >= 0) {
    const old = record.moves[index];
    if (old.playerId !== command.playerId || old.expectedRevision !== command.expectedRevision || old.type !== command.type || !validCoordinate(command.position, old.type === 'settlement' ? ['N', 'S'] : ['NE', 'E', 'SE']) || JSON.stringify(old.position) !== JSON.stringify({ hex: { q: command.position.hex.q, r: command.position.hex.r }, direction: command.position.direction })) throw new Error('This command ID was already used for a different placement.');
    return { record, receipt: { commandId: command.commandId, revision: index + 1, duplicate: true } };
  }
  const next = validateSetup({ ...record, moves: [...record.moves, command], revision: record.revision + 1, savedAt: now });
  return { record: next, receipt: { commandId: command.commandId, revision: next.revision, duplicate: false } };
}
