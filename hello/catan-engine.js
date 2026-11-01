function hexKey(coord) {
  return `${coord.q},${coord.r}`;
}
function generateStandardBoardHexes() {
  const rows = [
    { r: -2, qStart: 0, qEnd: 2 },
    // 3 hexes
    { r: -1, qStart: -1, qEnd: 2 },
    // 4 hexes
    { r: 0, qStart: -2, qEnd: 2 },
    // 5 hexes
    { r: 1, qStart: -2, qEnd: 1 },
    // 4 hexes
    { r: 2, qStart: -2, qEnd: 0 }
    // 3 hexes
  ];
  const hexes = [];
  for (const row of rows) {
    for (let q = row.qStart; q <= row.qEnd; q++) {
      hexes.push({ q, r: row.r });
    }
  }
  return hexes;
}
function generateBeginnerBoard() {
  const hexes = generateStandardBoardHexes();
  const beginnerLayout = [
    // Row 1 (r = -2): 3 hexes
    { terrain: "mountains", number: 10 },
    { terrain: "pasture", number: 2 },
    { terrain: "forest", number: 9 },
    // Row 2 (r = -1): 4 hexes
    { terrain: "fields", number: 12 },
    { terrain: "hills", number: 6 },
    { terrain: "pasture", number: 4 },
    { terrain: "hills", number: 10 },
    // Row 3 (r = 0): 5 hexes
    { terrain: "fields", number: 9 },
    { terrain: "forest", number: 11 },
    { terrain: "desert" },
    { terrain: "forest", number: 3 },
    { terrain: "mountains", number: 8 },
    // Row 4 (r = 1): 4 hexes
    { terrain: "forest", number: 8 },
    { terrain: "mountains", number: 3 },
    { terrain: "fields", number: 4 },
    { terrain: "pasture", number: 5 },
    // Row 5 (r = 2): 3 hexes
    { terrain: "hills", number: 5 },
    { terrain: "fields", number: 6 },
    { terrain: "pasture", number: 11 }
  ];
  const tiles = hexes.map((coord, i) => ({
    id: hexKey(coord),
    coord,
    terrain: beginnerLayout[i].terrain,
    number: beginnerLayout[i].number,
    hasRobber: beginnerLayout[i].terrain === "desert"
  }));
  return tiles;
}
function getTerrainResource(terrain) {
  const resources2 = {
    hills: "brick",
    forest: "lumber",
    mountains: "ore",
    fields: "grain",
    pasture: "wool",
    desert: null,
    water: null,
    gold: "gold",
    // Player chooses
    fog: null
  };
  return resources2[terrain];
}
function axialToPixel(hex, size) {
  const x = size * Math.sqrt(3) * (hex.q + hex.r / 2);
  const y = size * (3 / 2) * hex.r;
  return { x, y };
}
function vertexToPixel(vertex, size) {
  const hexCenter = axialToPixel(vertex.hex, size);
  if (vertex.direction === "N") {
    return {
      x: hexCenter.x,
      y: hexCenter.y - size
    };
  } else {
    return {
      x: hexCenter.x,
      y: hexCenter.y + size
    };
  }
}
function vertexKey(vertex) {
  return `${vertex.hex.q},${vertex.hex.r},${vertex.direction}`;
}
function edgeKey(edge) {
  return `${edge.hex.q},${edge.hex.r},${edge.direction}`;
}
function getHexVertices(hex) {
  return [
    { hex, direction: "N" },
    // TOP
    { hex: { q: hex.q + 1, r: hex.r - 1 }, direction: "S" },
    // TOP-RIGHT (S of NE neighbor)
    { hex: { q: hex.q, r: hex.r + 1 }, direction: "N" },
    // BOTTOM-RIGHT (N of SE neighbor)
    { hex, direction: "S" },
    // BOTTOM
    { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: "N" },
    // BOTTOM-LEFT (N of SW neighbor)
    { hex: { q: hex.q, r: hex.r - 1 }, direction: "S" }
    // TOP-LEFT (S of NW neighbor)
  ];
}
function getHexEdges(hex) {
  return [
    { hex, direction: "NE" },
    { hex, direction: "E" },
    { hex, direction: "SE" },
    { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: "NE" },
    { hex: { q: hex.q - 1, r: hex.r }, direction: "E" },
    { hex: { q: hex.q, r: hex.r - 1 }, direction: "SE" }
  ];
}
function getHexCorners(center, size) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 90;
    const angleRad = Math.PI / 180 * angleDeg;
    corners.push({
      x: center.x + size * Math.cos(angleRad),
      y: center.y + size * Math.sin(angleRad)
    });
  }
  return corners;
}
function getEdgeVertices(edge) {
  const { hex, direction } = edge;
  switch (direction) {
    case "NE":
      return [
        { hex, direction: "N" },
        { hex: { q: hex.q + 1, r: hex.r - 1 }, direction: "S" }
      ];
    case "E":
      return [
        { hex: { q: hex.q + 1, r: hex.r - 1 }, direction: "S" },
        { hex: { q: hex.q, r: hex.r + 1 }, direction: "N" }
      ];
    case "SE":
      return [
        { hex: { q: hex.q, r: hex.r + 1 }, direction: "N" },
        { hex, direction: "S" }
      ];
    default:
      return [
        { hex, direction: "N" },
        { hex, direction: "S" }
      ];
  }
}
function getVertexEdges(vertex) {
  const { hex, direction } = vertex;
  if (direction === "N") {
    return [
      { hex, direction: "NE" },
      { hex: { q: hex.q, r: hex.r - 1 }, direction: "E" },
      { hex: { q: hex.q, r: hex.r - 1 }, direction: "SE" }
    ];
  } else {
    return [
      { hex, direction: "SE" },
      { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: "NE" },
      { hex: { q: hex.q - 1, r: hex.r + 1 }, direction: "E" }
    ];
  }
}
const unique = (values, key) => [...new Map(values.map((v) => [key(v), v])).values()];
function validSetupSettlements(state) {
  const blocked = /* @__PURE__ */ new Set();
  for (const building of state.board.buildings) {
    blocked.add(vertexKey(building.vertex));
    for (const edge of getVertexEdges(building.vertex)) {
      for (const vertex of getEdgeVertices(edge)) blocked.add(vertexKey(vertex));
    }
  }
  return unique(state.board.tiles.filter((t) => t.terrain !== "water").flatMap((tile) => getHexVertices(tile.coord)), vertexKey).filter((vertex) => !blocked.has(vertexKey(vertex)));
}
function validSetupRoads(state) {
  const vertex = state.game.setupState?.lastPlacedSettlement;
  if (!vertex) return [];
  const landEdges = new Set(state.board.tiles.filter((t) => t.terrain !== "water").flatMap((tile) => getHexEdges(tile.coord)).map(edgeKey));
  const occupied = new Set(state.board.roads.map((road) => edgeKey(road.edge)));
  return getVertexEdges(vertex).filter((edge) => landEdges.has(edgeKey(edge)) && !occupied.has(edgeKey(edge)));
}
function validCoordinate(value, directions) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return !!v.hex && Number.isSafeInteger(v.hex.q) && Number.isSafeInteger(v.hex.r) && directions.includes(v.direction ?? "");
}
const SETUP_RULE_VERSION = 1;
const PLAYER_COLORS = ["#b73a32", "#2466c0", "#b8670b", "#24714e"];
const resources = () => ({ brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 });
function initial(record) {
  return {
    board: { tiles: generateBeginnerBoard(), buildings: [], roads: [] },
    game: { setupState: { lastPlacedSettlement: null } },
    players: Array.from({ length: record.playerCount }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, color: PLAYER_COLORS[i], resources: resources() }))
  };
}
function active(record, revision) {
  const placement = Math.floor(revision / 2);
  const index = placement < record.playerCount ? placement : record.playerCount * 2 - 1 - placement;
  return `p${record.order[index] + 1}`;
}
function apply(state, record, move, revision) {
  if (revision >= record.playerCount * 4) throw new Error("Setup is already complete.");
  if (!move || typeof move.commandId !== "string" || !move.commandId.length || move.commandId.length > 100) throw new Error("Invalid command ID.");
  if (move.expectedRevision !== revision) throw new Error("The setup has changed. Reload the latest save before choosing a placement.");
  if (move.playerId !== active(record, revision)) throw new Error("It is another player’s turn.");
  const settlement = revision % 2 === 0;
  if (move.type !== (settlement ? "settlement" : "road")) throw new Error(settlement ? "Place a settlement first." : "Place a road next to your new settlement.");
  if (!validCoordinate(move.position, settlement ? ["N", "S"] : ["NE", "E", "SE"])) throw new Error("Invalid board coordinate.");
  const legal = settlement ? validSetupSettlements(state).some((v) => vertexKey(v) === vertexKey(move.position)) : validSetupRoads(state).some((e) => edgeKey(e) === edgeKey(move.position));
  if (!legal) throw new Error(settlement ? "Choose an empty intersection at least two edges from another settlement." : "Choose an empty road next to the settlement just placed.");
  if (settlement) {
    const vertex = move.position;
    state.board.buildings.push({ vertex, playerId: move.playerId });
    state.game.setupState.lastPlacedSettlement = vertex;
    if (revision >= record.playerCount * 2) {
      const player = state.players.find((p) => p.id === move.playerId);
      for (const tile of state.board.tiles) if (getHexVertices(tile.coord).some((v) => vertexKey(v) === vertexKey(vertex))) {
        const resource = getTerrainResource(tile.terrain);
        if (resource) player.resources[resource]++;
      }
    }
  } else {
    state.board.roads.push({ edge: move.position, playerId: move.playerId });
    state.game.setupState.lastPlacedSettlement = null;
  }
}
function validateSetup(value) {
  const record = value;
  if (!record || record.schemaVersion !== 1 || record.ruleVersion !== 1 || record.game !== "catan-setup") throw new Error("This Catan setup save requires a compatible app version. No saved data has been changed.");
  if (typeof record.id !== "string" || !record.id.length || record.id.length > 100 || ![3, 4].includes(record.playerCount) || !Array.isArray(record.order) || record.order.length !== record.playerCount || new Set(record.order).size !== record.playerCount || record.order.some((i) => !Number.isInteger(i) || i < 0 || i >= record.playerCount) || !Number.isSafeInteger(record.savedAt) || record.savedAt < 0 || !Array.isArray(record.moves) || record.moves.length > record.playerCount * 4 || record.revision !== record.moves.length) throw new Error("The Catan setup save is invalid. No saved data has been changed.");
  const state = initial(record), ids = /* @__PURE__ */ new Set();
  const moves = record.moves.map((move, index) => {
    apply(state, record, move, index);
    if (ids.has(move.commandId)) throw new Error("The save contains duplicate command IDs.");
    ids.add(move.commandId);
    return {
      commandId: move.commandId,
      playerId: move.playerId,
      expectedRevision: index,
      type: move.type,
      position: { hex: { q: move.position.hex.q, r: move.position.hex.r }, direction: move.position.direction }
    };
  });
  return { schemaVersion: 1, ruleVersion: 1, game: "catan-setup", id: record.id, revision: moves.length, playerCount: record.playerCount, order: [...record.order], savedAt: record.savedAt, moves };
}
function createSetup(id, playerCount, order, now) {
  return validateSetup({ schemaVersion: 1, ruleVersion: 1, game: "catan-setup", id, revision: 0, playerCount, order, savedAt: now, moves: [] });
}
function setupPosition(input) {
  const record = validateSetup(input), state = initial(record);
  record.moves.forEach((move, i) => apply(state, record, move, i));
  const complete = record.revision === record.playerCount * 4;
  return {
    ...state,
    phase: complete ? "complete" : record.revision % 2 === 0 ? "settlement" : "road",
    playerId: complete ? null : active(record, record.revision),
    round: record.revision < record.playerCount * 2 ? 1 : 2,
    settlements: complete || record.revision % 2 ? [] : validSetupSettlements(state),
    roads: !complete && record.revision % 2 ? validSetupRoads(state) : []
  };
}
function submitSetup(input, command, now) {
  const record = validateSetup(input);
  const index = record.moves.findIndex((m) => m.commandId === command.commandId);
  if (index >= 0) {
    const old = record.moves[index];
    if (old.playerId !== command.playerId || old.expectedRevision !== command.expectedRevision || old.type !== command.type || !validCoordinate(command.position, old.type === "settlement" ? ["N", "S"] : ["NE", "E", "SE"]) || JSON.stringify(old.position) !== JSON.stringify({ hex: { q: command.position.hex.q, r: command.position.hex.r }, direction: command.position.direction })) throw new Error("This command ID was already used for a different placement.");
    return { record, receipt: { commandId: command.commandId, revision: index + 1, duplicate: true } };
  }
  const next = validateSetup({ ...record, moves: [...record.moves, command], revision: record.revision + 1, savedAt: now });
  return { record: next, receipt: { commandId: command.commandId, revision: next.revision, duplicate: false } };
}
export {
  PLAYER_COLORS,
  SETUP_RULE_VERSION,
  axialToPixel,
  createSetup,
  edgeKey,
  getEdgeVertices,
  getHexCorners,
  setupPosition,
  submitSetup,
  validateSetup,
  vertexKey,
  vertexToPixel
};
