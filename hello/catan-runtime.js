/* Third-party settlement heuristic: 8910work-cell/catan-ai, MIT.
MIT License

Copyright (c) 2026 8910work-cell

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

Note: "Catan" / "Settlers of Catan" is a trademark of CATAN GmbH. This
license covers the original code in this repository only and does not grant
any rights to that trademark or the underlying game design.


*/
function createPlayer(id, name, color, isHost = false) {
  return {
    id,
    name,
    color,
    isConnected: true,
    isHost,
    isReady: false,
    sessionToken: "",
    resources: {
      brick: 0,
      lumber: 0,
      ore: 0,
      grain: 0,
      wool: 0
    },
    developmentCards: [],
    hasPlayedDevCard: false,
    devCardsBoughtThisTurn: [],
    roadsRemaining: 15,
    settlementsRemaining: 5,
    citiesRemaining: 4,
    longestRoadLength: 0,
    armySize: 0,
    totalResourcesCollected: 0,
    totalTradesMade: 0,
    timesRobbed: 0,
    timesWasRobbed: 0
  };
}
const HEX_SIZE = 60;
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
function axialToPixel(hex, size) {
  const x = size * Math.sqrt(3) * (hex.q + hex.r / 2);
  const y = size * (3 / 2) * hex.r;
  return { x, y };
}
function edgeToPixel(edge, size) {
  const hexCenter = axialToPixel(edge.hex, size);
  const halfWidth = size * Math.sqrt(3) / 2;
  switch (edge.direction) {
    case "NE":
      return {
        x: hexCenter.x + halfWidth / 2,
        y: hexCenter.y - size * 0.75
      };
    case "E":
      return {
        x: hexCenter.x + halfWidth,
        y: hexCenter.y
      };
    case "SE":
      return {
        x: hexCenter.x + halfWidth / 2,
        y: hexCenter.y + size * 0.75
      };
    case "SW":
      return {
        x: hexCenter.x - halfWidth / 2,
        y: hexCenter.y + size * 0.75
      };
    case "W":
      return {
        x: hexCenter.x - halfWidth,
        y: hexCenter.y
      };
    case "NW":
      return {
        x: hexCenter.x - halfWidth / 2,
        y: hexCenter.y - size * 0.75
      };
    default:
      return hexCenter;
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
  const landEdges2 = new Set(state.board.tiles.filter((t) => t.terrain !== "water").flatMap((tile) => getHexEdges(tile.coord)).map(edgeKey));
  const occupied = new Set(state.board.roads.map((road) => edgeKey(road.edge)));
  return getVertexEdges(vertex).filter((edge) => landEdges2.has(edgeKey(edge)) && !occupied.has(edgeKey(edge)));
}
function validCoordinate(value, directions) {
  if (!value || typeof value !== "object") return false;
  const v = value;
  return !!v.hex && Number.isSafeInteger(v.hex.q) && Number.isSafeInteger(v.hex.r) && directions.includes(v.direction ?? "");
}
const DEVELOPMENT_CARD_COUNTS = {
  knight: 14,
  victoryPoint: 5,
  roadBuilding: 2,
  yearOfPlenty: 2,
  monopoly: 2
};
Object.values(DEVELOPMENT_CARD_COUNTS).reduce(
  (sum, count) => sum + count,
  0
);
function landEdges(state) {
  return [...new Map(state.board.tiles.filter((t) => t.terrain !== "water").flatMap((t) => getHexEdges(t.coord)).map((e) => [edgeKey(e), e])).values()];
}
function validRoads(state, playerId) {
  const occupied = new Set(state.board.roads.map((r) => edgeKey(r.edge)));
  const ownEdges = new Set(state.board.roads.filter((r) => r.playerId === playerId).map((r) => edgeKey(r.edge)));
  return landEdges(state).filter((edge) => !occupied.has(edgeKey(edge)) && getEdgeVertices(edge).some((vertex) => {
    const building = state.board.buildings.find((b) => vertexKey(b.vertex) === vertexKey(vertex));
    if (building) return building.playerId === playerId;
    return getVertexEdges(vertex).some((e) => ownEdges.has(edgeKey(e)));
  }));
}
function validSettlements(state, playerId) {
  const connected = new Set(state.board.roads.filter((r) => r.playerId === playerId).flatMap((r) => getEdgeVertices(r.edge)).map(vertexKey));
  return validSetupSettlements(state).filter((v) => connected.has(vertexKey(v)));
}
function bankRate(state, playerId, resource) {
  const owned = new Set(state.board.buildings.filter((b) => b.playerId === playerId).map((b) => vertexKey(b.vertex)));
  let rate = 4;
  for (const port of state.board.ports) {
    if (port.vertices?.some((v) => owned.has(vertexKey(v)))) {
      if (port.type === resource) rate = 2;
      else if (port.type === "generic") rate = Math.min(rate, 3);
    }
  }
  return rate;
}
function createBasePorts(state) {
  const counts = /* @__PURE__ */ new Map();
  for (const tile of state.board.tiles) for (const edge of getHexEdges(tile.coord)) {
    const key = edgeKey(edge);
    counts.set(key, { edge, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  const coast = [...counts.values()].filter((e) => e.count === 1).map((e) => e.edge).sort((a, b) => {
    const p = edgeToPixel(a, 1), q = edgeToPixel(b, 1);
    return Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x);
  });
  const types = ["generic", "grain", "ore", "generic", "wool", "generic", "generic", "brick", "lumber"];
  return [0, 3, 6, 10, 13, 16, 20, 23, 26].map((index, n) => {
    const edge = coast[index];
    const point = edgeToPixel(edge, HEX_SIZE);
    const distance = Math.hypot(point.x, point.y);
    const factor = 1 + HEX_SIZE * 0.7 / distance;
    return {
      id: `port-${n}`,
      edge,
      type: types[n],
      ratio: types[n] === "generic" ? 3 : 2,
      vertices: getEdgeVertices(edge),
      position: {
        x: point.x * factor,
        y: point.y * factor,
        rotation: Math.atan2(point.y, point.x) * 180 / Math.PI + 90
      }
    };
  });
}
function roadLength(state, playerId) {
  const roads = state.board.roads.filter((r) => r.playerId === playerId).map((r) => getEdgeVertices(r.edge).map(vertexKey));
  const blocked = new Set(state.board.buildings.filter((b) => b.playerId !== playerId).map((b) => vertexKey(b.vertex)));
  const graph = /* @__PURE__ */ new Map();
  roads.forEach((ends, i) => ends.forEach((v) => graph.set(v, [...graph.get(v) ?? [], i])));
  function walk(vertex, visited) {
    if (visited.size && blocked.has(vertex)) return 0;
    let best = 0;
    for (const edge of graph.get(vertex) ?? []) {
      if (visited.has(edge)) continue;
      const next = roads[edge].find((v) => v !== vertex);
      best = Math.max(best, 1 + walk(next, /* @__PURE__ */ new Set([...visited, edge])));
    }
    return best;
  }
  return Math.max(0, ...[...graph.keys()].map((vertex) => walk(vertex, /* @__PURE__ */ new Set())));
}
function score(state, playerId, includeHidden = false) {
  const player = state.players.players.find((p) => p.id === playerId);
  return state.board.buildings.filter((b) => b.playerId === playerId).reduce((sum, b) => sum + (b.type === "city" ? 2 : 1), 0) + (state.game.longestRoad?.playerId === playerId ? 2 : 0) + (state.game.largestArmy?.playerId === playerId ? 2 : 0) + (includeHidden ? player?.developmentCards.filter((c) => c.type === "victoryPoint" && !c.isPlayed).length ?? 0 : 0);
}
function updateScores(state) {
  const players = state.players.players;
  for (const player of players) player.longestRoadLength = roadLength(state, player.id);
  const longest = Math.max(0, ...players.map((p) => p.longestRoadLength));
  const tied = players.filter((p) => p.longestRoadLength === longest);
  const holder = tied.find((p) => p.id === state.game.longestRoad?.playerId) ?? (tied.length === 1 ? tied[0] : void 0);
  state.game.longestRoad = longest >= 5 && holder ? { playerId: holder.id, value: longest } : null;
  const active = state.game.currentPlayerId;
  if (active && score(state, active, true) >= state.game.settings.victoryPoints) {
    state.game.phase = "ended";
    state.game.winnerId = active;
    state.game.finalScores = Object.fromEntries(players.map((p) => [p.id, score(state, p.id, true)]));
  }
}
const RESOURCES = ["brick", "lumber", "ore", "grain", "wool"];
const COSTS = {
  road: { brick: 1, lumber: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { ore: 3, grain: 2 },
  development: { ore: 1, grain: 1, wool: 1 }
};
function createDeck(randomInt) {
  const deck = Object.entries(DEVELOPMENT_CARD_COUNTS).flatMap(([type, count]) => Array(count).fill(type));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    if (!Number.isSafeInteger(j) || j < 0 || j > i) throw new Error("Invalid random index");
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function applyEconomy(input, deck, action, playerId, context) {
  const reject2 = (error) => ({ success: false, error });
  const player = input.players.players.find((p) => p.id === playerId);
  if (!player) return reject2("Unknown player");
  if (input.game.mode !== "base") return reject2("Only base-game rules are supported");
  if (input.game.currentPlayerId !== playerId) return reject2("Not your turn");
  const freeRoad = action.type === "BUILD_ROAD" && input.game.phase === "road-building";
  const cardType = { PLAY_KNIGHT: "knight", PLAY_ROAD_BUILDING: "roadBuilding", PLAY_YEAR_OF_PLENTY: "yearOfPlenty", PLAY_MONOPOLY: "monopoly" }[action.type];
  const card = cardType ? player.developmentCards.find((c) => c.type === cardType && !c.isPlayed && c.turnBought !== input.game.turn) : void 0;
  if (cardType && (!card || player.hasPlayedDevCard || input.game.devCardPlayedThisTurn)) return reject2("No playable card, card bought this turn, or a card already played");
  if (input.game.phase !== "main" && !freeRoad && !(cardType && input.game.phase === "roll")) return reject2("Action is not allowed in this phase");
  let cost = {};
  switch (action.type) {
    case "BUILD_ROAD":
      if (!validCoordinate(action.edge, ["NE", "E", "SE"])) return reject2("Invalid edge");
      if (player.roadsRemaining <= 0) return reject2("No roads remaining");
      if (freeRoad && input.game.roadBuildingRemaining <= 0) return reject2("No free roads remaining");
      if (!validRoads(input, playerId).some((e) => edgeKey(e) === edgeKey(action.edge))) return reject2("Road must be empty, on land and connected to your network");
      cost = freeRoad ? {} : COSTS.road;
      break;
    case "BUILD_SETTLEMENT":
      if (!validCoordinate(action.vertex, ["N", "S"])) return reject2("Invalid vertex");
      if (player.settlementsRemaining <= 0) return reject2("No settlements remaining");
      if (!validSettlements(input, playerId).some((v) => vertexKey(v) === vertexKey(action.vertex))) return reject2("Settlement must be empty, separated and connected to your road");
      cost = COSTS.settlement;
      break;
    case "BUILD_CITY":
      if (!validCoordinate(action.vertex, ["N", "S"])) return reject2("Invalid vertex");
      if (player.citiesRemaining <= 0) return reject2("No cities remaining");
      if (!input.board.buildings.some((b) => b.type === "settlement" && b.playerId === playerId && vertexKey(b.vertex) === vertexKey(action.vertex))) return reject2("City must upgrade your own settlement");
      cost = COSTS.city;
      break;
    case "BUY_DEVELOPMENT_CARD":
      if (!deck.length) return reject2("No development cards remaining");
      cost = COSTS.development;
      break;
    case "BANK_TRADE": {
      const { give, receive } = action;
      if (!give || !receive || !RESOURCES.includes(give.resource) || !RESOURCES.includes(receive.resource)) return reject2("Invalid trade resources");
      if (![give.amount, receive.amount].every((n) => Number.isSafeInteger(n) && n > 0)) return reject2("Trade amounts must be positive integers");
      if (give.resource === receive.resource) return reject2("Cannot trade a resource for itself");
      if (give.amount !== receive.amount * bankRate(input, playerId, give.resource)) return reject2("Invalid bank trade ratio");
      if (player.resources[give.resource] < give.amount) return reject2("Not enough resources to trade");
      if (input.game.bank[receive.resource] < receive.amount) return reject2("Bank does not have enough resources");
      break;
    }
    case "PLAY_KNIGHT":
      break;
    case "PLAY_ROAD_BUILDING":
      if (!player.roadsRemaining || !validRoads(input, playerId).length) return reject2("No legal roads to place");
      break;
    case "PLAY_YEAR_OF_PLENTY": {
      if (!Array.isArray(action.resources) || action.resources.length !== 2 || action.resources.some((r) => !RESOURCES.includes(r))) return reject2("Choose two valid resources");
      const [a, b] = action.resources;
      if (input.game.bank[a] < (a === b ? 2 : 1) || input.game.bank[b] < 1) return reject2("Bank does not have enough resources");
      break;
    }
    case "PLAY_MONOPOLY":
      if (!RESOURCES.includes(action.resource)) return reject2("Choose a valid resource");
      break;
    case "END_TURN":
      break;
    default:
      return reject2("Unsupported economy action");
  }
  if (RESOURCES.some((r) => player.resources[r] < (cost[r] ?? 0))) return reject2("Not enough resources");
  const state = structuredClone(input);
  const remaining = [...deck];
  const actor = state.players.players.find((p) => p.id === playerId);
  for (const resource of RESOURCES) {
    const amount = cost[resource] ?? 0;
    actor.resources[resource] -= amount;
    state.game.bank[resource] += amount;
  }
  if (card) {
    actor.developmentCards.find((c) => c.id === card.id).isPlayed = true;
    actor.hasPlayedDevCard = true;
    state.game.devCardPlayedThisTurn = true;
  }
  switch (action.type) {
    case "BUILD_ROAD":
      state.board.roads.push({ id: context.id(), type: "road", playerId, playerColor: actor.color, edge: action.edge });
      actor.roadsRemaining--;
      if (freeRoad) {
        state.game.roadBuildingRemaining--;
        if (!state.game.roadBuildingRemaining || !actor.roadsRemaining || !validRoads(state, playerId).length) {
          state.game.phase = state.game.lastRoll ? "main" : "roll";
          state.game.roadBuildingRemaining = 0;
        }
      }
      break;
    case "BUILD_SETTLEMENT":
      state.board.buildings.push({ id: context.id(), type: "settlement", playerId, playerColor: actor.color, vertex: action.vertex });
      actor.settlementsRemaining--;
      break;
    case "BUILD_CITY":
      state.board.buildings.find((b) => vertexKey(b.vertex) === vertexKey(action.vertex)).type = "city";
      actor.citiesRemaining--;
      actor.settlementsRemaining++;
      break;
    case "BUY_DEVELOPMENT_CARD": {
      const id = context.id();
      actor.developmentCards.push({ id, type: remaining.shift(), turnBought: state.game.turn, isPlayed: false });
      actor.devCardsBoughtThisTurn.push(id);
      state.game.developmentDeckCount = remaining.length;
      break;
    }
    case "BANK_TRADE":
      actor.resources[action.give.resource] -= action.give.amount;
      state.game.bank[action.give.resource] += action.give.amount;
      actor.resources[action.receive.resource] += action.receive.amount;
      state.game.bank[action.receive.resource] -= action.receive.amount;
      actor.totalTradesMade++;
      break;
    case "PLAY_KNIGHT":
      actor.armySize++;
      if (actor.armySize >= 3 && actor.armySize > (state.game.largestArmy?.value ?? 2)) {
        state.game.largestArmy = { playerId, value: actor.armySize };
      }
      state.game.phase = "robber-move";
      break;
    case "PLAY_ROAD_BUILDING":
      state.game.phase = "road-building";
      state.game.roadBuildingRemaining = Math.min(2, actor.roadsRemaining);
      break;
    case "PLAY_YEAR_OF_PLENTY":
      for (const resource of action.resources) {
        actor.resources[resource]++;
        state.game.bank[resource]--;
      }
      break;
    case "PLAY_MONOPOLY":
      for (const other of state.players.players) if (other.id !== playerId) {
        actor.resources[action.resource] += other.resources[action.resource];
        other.resources[action.resource] = 0;
      }
      break;
    case "END_TURN": {
      updateScores(state);
      if (state.game.phase === "ended") break;
      const order = state.players.turnOrder;
      const next = order[(order.indexOf(playerId) + 1) % order.length];
      state.game.currentPlayerId = next;
      state.game.turn++;
      state.game.lastRoll = null;
      state.game.phase = "roll";
      state.game.turnStartedAt = context.now();
      state.game.turnTimeRemaining = state.game.settings.turnTimer;
      state.game.devCardPlayedThisTurn = false;
      const nextPlayer = state.players.players.find((p) => p.id === next);
      nextPlayer.hasPlayedDevCard = false;
      nextPlayer.devCardsBoughtThisTurn = [];
      break;
    }
  }
  if (action.type.startsWith("BUILD_")) state.log.log.push({
    id: context.id(),
    timestamp: context.now(),
    turn: state.game.turn,
    type: "build",
    playerId,
    playerName: actor.name,
    playerColor: actor.color,
    message: `${actor.name} ${action.type === "BUILD_CITY" ? "upgraded a settlement to a city" : action.type === "BUILD_ROAD" ? "built a road" : "built a settlement"}.`,
    visibility: "all"
  });
  updateScores(state);
  return { success: true, state, deck: remaining };
}
const TERRAIN = { hills: "brick", forest: "lumber", mountains: "ore", fields: "grain", pasture: "wool" };
function victims(state, hex, playerId) {
  const corners = new Set(getHexVertices(hex).map(vertexKey));
  return [...new Set(state.board.buildings.filter((b) => b.playerId !== playerId && corners.has(vertexKey(b.vertex))).map((b) => b.playerId))].filter((id) => {
    const player = state.players.players.find((p) => p.id === id);
    return (player.resourceCount ?? RESOURCES.reduce((n, r) => n + player.resources[r], 0)) > 0;
  });
}
function robberPlacements(state, playerId) {
  return state.board.tiles.filter((tile) => {
    if (tile.terrain === "water" || tile.coord.q === state.board.robberLocation.q && tile.coord.r === state.board.robberLocation.r) return false;
    if (!state.game.settings.friendlyRobber) return true;
    const corners = new Set(getHexVertices(tile.coord).map(vertexKey));
    return !state.board.buildings.some((b) => b.playerId !== playerId && corners.has(vertexKey(b.vertex)) && score(state, b.playerId) <= 2);
  }).map((tile) => tile.coord);
}
function isTurnAction(action) {
  return ["ROLL_DICE", "DISCARD_RESOURCES", "MOVE_ROBBER", "STEAL_RESOURCE", "SKIP_STEAL"].includes(action.type);
}
function applyTurn(input, action, playerId, randomInt) {
  const fail = (error) => ({ success: false, error });
  const player = input.players.players.find((p) => p.id === playerId);
  if (!player) return fail("Unknown player");
  if (action.type !== "DISCARD_RESOURCES" && playerId !== input.game.currentPlayerId) return fail("Not your turn");
  const state = structuredClone(input);
  const actor = state.players.players.find((p) => p.id === playerId);
  const afterRobber = () => state.game.lastRoll ? "main" : "roll";
  switch (action.type) {
    case "ROLL_DICE": {
      if (input.game.phase !== "roll" || input.game.lastRoll) return fail("Cannot roll dice in this phase");
      const die1 = randomInt(6) + 1, die2 = randomInt(6) + 1;
      state.game.lastRoll = { die1, die2, total: die1 + die2 };
      if (die1 + die2 === 7) {
        state.game.pendingDiscard = state.players.players.filter((p) => RESOURCES.reduce((sum, r) => sum + p.resources[r], 0) > state.game.settings.discardLimit).map((p) => p.id);
        state.game.discardAmounts = Object.fromEntries(state.game.pendingDiscard.map((id) => {
          const hand = state.players.players.find((p) => p.id === id).resources;
          return [id, Math.floor(RESOURCES.reduce((sum, r) => sum + hand[r], 0) / 2)];
        }));
        state.game.phase = state.game.pendingDiscard.length ? "discard" : "robber-move";
      } else {
        for (const resource of RESOURCES) {
          const payouts = /* @__PURE__ */ new Map();
          for (const tile of state.board.tiles) {
            if (tile.number !== die1 + die2 || TERRAIN[tile.terrain] !== resource || tile.coord.q === state.board.robberLocation.q && tile.coord.r === state.board.robberLocation.r) continue;
            const corners = new Set(getHexVertices(tile.coord).map(vertexKey));
            for (const building of state.board.buildings) if (corners.has(vertexKey(building.vertex))) {
              payouts.set(building.playerId, (payouts.get(building.playerId) ?? 0) + (building.type === "city" ? 2 : 1));
            }
          }
          const needed = [...payouts.values()].reduce((sum, count) => sum + count, 0);
          if (needed > state.game.bank[resource] && payouts.size > 1) continue;
          for (const [id, amount] of payouts) {
            const granted = Math.min(amount, state.game.bank[resource]);
            const recipient = state.players.players.find((p) => p.id === id);
            recipient.resources[resource] += granted;
            recipient.totalResourcesCollected += granted;
            state.game.bank[resource] -= granted;
          }
        }
        state.game.phase = "main";
      }
      break;
    }
    case "DISCARD_RESOURCES": {
      if (input.game.phase !== "discard" || !input.game.pendingDiscard.includes(playerId)) return fail("You do not need to discard");
      const resources = action.resources;
      if (!resources || typeof resources !== "object" || Object.entries(resources).some(([r, n]) => !RESOURCES.includes(r) || !Number.isSafeInteger(n) || n < 0)) return fail("Invalid discard resources");
      const count = RESOURCES.reduce((sum, r) => sum + (resources[r] ?? 0), 0);
      const expected = input.game.discardAmounts?.[playerId] ?? Math.floor(RESOURCES.reduce((sum, r) => sum + actor.resources[r], 0) / 2);
      if (count !== expected || RESOURCES.some((r) => (resources[r] ?? 0) > actor.resources[r])) return fail(`Must discard exactly ${expected} owned cards`);
      for (const resource of RESOURCES) {
        actor.resources[resource] -= resources[resource] ?? 0;
        state.game.bank[resource] += resources[resource] ?? 0;
      }
      state.game.pendingDiscard = state.game.pendingDiscard.filter((id) => id !== playerId);
      delete state.game.discardAmounts?.[playerId];
      if (!state.game.pendingDiscard.length) state.game.phase = "robber-move";
      break;
    }
    case "MOVE_ROBBER": {
      if (input.game.phase !== "robber-move") return fail("Cannot move robber in this phase");
      const hex = action.hex;
      const tile = hex && state.board.tiles.find((t) => t.coord.q === hex.q && t.coord.r === hex.r && t.terrain !== "water");
      if (!tile || hex.q === state.board.robberLocation.q && hex.r === state.board.robberLocation.r) return fail("Invalid robber location");
      if (!robberPlacements(state, playerId).some((v) => v.q === hex.q && v.r === hex.r)) return fail("Friendly robber protects this player");
      state.board.robberLocation = hex;
      state.board.tiles.forEach((t) => {
        t.hasRobber = t.id === tile.id;
      });
      state.game.phase = victims(state, hex, playerId).length ? "robber-steal" : afterRobber();
      break;
    }
    case "STEAL_RESOURCE": {
      if (input.game.phase !== "robber-steal" || !victims(input, input.board.robberLocation, playerId).includes(action.victimId)) return fail("Invalid steal target");
      const victim = state.players.players.find((p) => p.id === action.victimId);
      const cards = RESOURCES.flatMap((r) => Array(victim.resources[r]).fill(r));
      const stolen = cards[randomInt(cards.length)];
      victim.resources[stolen]--;
      actor.resources[stolen]++;
      actor.timesRobbed++;
      victim.timesWasRobbed++;
      state.game.phase = afterRobber();
      break;
    }
    case "SKIP_STEAL":
      if (input.game.phase !== "robber-steal" || victims(input, input.board.robberLocation, playerId).length) return fail("Choose an eligible victim");
      state.game.phase = afterRobber();
      break;
    default:
      return fail("Unsupported turn action");
  }
  updateScores(state);
  return { success: true, state };
}
function projectView(state, recipientId) {
  const game = { ...state.game };
  delete game.players;
  game.discardAmounts = recipientId in (game.discardAmounts ?? {}) ? { [recipientId]: game.discardAmounts[recipientId] } : {};
  return {
    game,
    board: state.board,
    players: {
      turnOrder: state.players.turnOrder,
      players: state.players.players.map((p) => {
        const own = p.id === recipientId;
        const publicPoints = state.board.buildings.filter((b) => b.playerId === p.id).reduce((total, b) => total + (b.type === "city" ? 2 : 1), 0) + (game.longestRoad?.playerId === p.id ? 2 : 0) + (game.largestArmy?.playerId === p.id ? 2 : 0);
        return {
          id: p.id,
          name: p.name,
          color: p.color,
          isConnected: p.isConnected,
          isHost: p.isHost,
          isReady: p.isReady,
          sessionToken: "",
          resources: own ? p.resources : { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 },
          resourceCount: Object.values(p.resources).reduce((sum, count) => sum + count, 0),
          developmentCards: own ? p.developmentCards : [],
          devCardCount: p.developmentCards.filter((c) => !c.isPlayed).length,
          hasPlayedDevCard: p.hasPlayedDevCard,
          devCardsBoughtThisTurn: own ? p.devCardsBoughtThisTurn : [],
          roadsRemaining: p.roadsRemaining,
          settlementsRemaining: p.settlementsRemaining,
          citiesRemaining: p.citiesRemaining,
          armySize: p.armySize,
          longestRoadLength: p.longestRoadLength,
          victoryPoints: publicPoints + (own ? p.developmentCards.filter((c) => c.type === "victoryPoint" && !c.isPlayed).length : 0),
          totalResourcesCollected: p.totalResourcesCollected,
          totalTradesMade: p.totalTradesMade,
          timesRobbed: p.timesRobbed,
          timesWasRobbed: p.timesWasRobbed
        };
      })
    },
    // Only public building messages are audited in this first slice. Other log types
    // stay on the host until their private/public projections are implemented.
    log: { ...state.log, log: state.log.log.filter((entry) => entry.type === "build" && entry.visibility === "all").map((entry) => ({ ...entry, data: void 0 })), chat: [] }
  };
}
const CATAN_ENGINE_VERSION = "1.0.0";
class CatanRuleError extends Error {
}
const reject = (message) => {
  throw new CatanRuleError(message);
};
const empty = () => ({ brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 });
const resourceFor = { hills: "brick", forest: "lumber", mountains: "ore", fields: "grain", pasture: "wool" };
const colors = ["red", "blue", "orange", "green"];
function newCatan(id, seats, context) {
  if (typeof id !== "string" || !id.length || ![3, 4].includes(seats.length) || new Set(seats.map((s) => s.id)).size !== seats.length) reject("Choose three or four distinct seats.");
  const players = seats.map((s, i) => {
    if (!s.id || typeof s.name !== "string" || s.name.length > 30 || !["human", "bot"].includes(s.kind) || !["easy", "standard"].includes(s.level)) reject("Invalid player configuration.");
    return createPlayer(s.id, s.name || `Player ${i + 1}`, colors[i], i === 0);
  });
  const order = seats.map((s) => s.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = context.randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const tiles = generateBeginnerBoard().map((t) => ({ ...t, hasPirate: false, isFog: false }));
  const state = {
    game: {
      phase: "setup-settlement-1",
      turn: 0,
      currentPlayerId: order[0],
      turnTimeRemaining: 0,
      turnStartedAt: context.now(),
      mode: "base",
      settings: { mode: "base", playerCount: seats.length, victoryPoints: 10, turnTimer: 0, discardLimit: 7, map: "beginner", friendlyRobber: false, hideBankCards: false },
      lastRoll: null,
      longestRoad: null,
      largestArmy: null,
      developmentDeckCount: 25,
      bank: { brick: 19, lumber: 19, ore: 19, grain: 19, wool: 19 },
      pendingDiscard: [],
      discardAmounts: {},
      devCardPlayedThisTurn: false,
      progressDecks: null,
      barbarianPosition: 0,
      barbarianStrength: 0,
      totalKnightStrength: 0,
      winnerId: null,
      finalScores: null,
      setupPlayerIndex: 0,
      setupDirection: "forward",
      roadBuildingRemaining: 0,
      yearOfPlentyRemaining: 0,
      setupState: { currentPlacementIndex: 0, lastPlacedSettlement: null, placementsComplete: false, playerPlacements: {} }
    },
    board: { tiles, buildings: [], roads: [], ports: [], knights: [], robberLocation: tiles.find((t) => t.terrain === "desert").coord, pirateLocation: null, merchantLocation: null },
    players: { players, turnOrder: order },
    log: { log: [], chat: [], maxLogEntries: 100, maxChatMessages: 0 }
  };
  state.board.ports = createBasePorts(state);
  return { schemaVersion: 1, engineVersion: CATAN_ENGINE_VERSION, id, revision: 0, state, deck: createDeck(context.randomInt), seats: structuredClone(seats), setupIndex: 0, offer: null, history: [] };
}
function resourceBundle(value) {
  if (!value || typeof value !== "object" || Object.keys(value).some((k) => !RESOURCES.includes(k))) reject("Invalid trade resources.");
  const input = value, result = empty();
  for (const r of RESOURCES) {
    const n = input[r] ?? 0;
    if (!Number.isSafeInteger(n) || n < 0 || n > 19) reject("Invalid trade quantity.");
    result[r] = n;
  }
  if (!Object.values(result).some((n) => n > 0)) reject("Both sides must offer resources.");
  return result;
}
function setup(session, actor, action, context) {
  const state = session.state, index = session.setupIndex, count = session.seats.length, player = state.players.players.find((p) => p.id === actor);
  if (state.game.currentPlayerId !== actor) reject("Not your turn.");
  const settlement = index % 2 === 0;
  if (settlement) {
    if (action.type !== "PLACE_SETTLEMENT" || !validCoordinate(action.vertex, ["N", "S"]) || !validSetupSettlements(state).some((v) => vertexKey(v) === vertexKey(action.vertex))) reject("Choose a legal starting settlement.");
    if (action.type !== "PLACE_SETTLEMENT") return;
    state.board.buildings.push({ id: context.id(), type: "settlement", playerId: actor, playerColor: player.color, vertex: action.vertex });
    player.settlementsRemaining--;
    state.game.setupState.lastPlacedSettlement = action.vertex;
    if (index >= count * 2) for (const tile of state.board.tiles) {
      const resource = resourceFor[tile.terrain];
      if (resource && getHexVertices(tile.coord).some((v) => vertexKey(v) === vertexKey(action.vertex))) {
        player.resources[resource]++;
        state.game.bank[resource]--;
      }
    }
  } else {
    if (action.type !== "PLACE_ROAD" || !validCoordinate(action.edge, ["NE", "E", "SE"]) || !validSetupRoads(state).some((e) => edgeKey(e) === edgeKey(action.edge))) reject("Choose a road next to the new settlement.");
    if (action.type !== "PLACE_ROAD") return;
    state.board.roads.push({ id: context.id(), type: "road", playerId: actor, playerColor: player.color, edge: action.edge });
    player.roadsRemaining--;
    state.game.setupState.lastPlacedSettlement = null;
  }
  session.setupIndex++;
  if (session.setupIndex === count * 4) {
    state.game.setupState = null;
    state.game.phase = "roll";
    state.game.turn = 1;
    state.game.currentPlayerId = state.players.turnOrder[0];
  } else {
    const placement = Math.floor(session.setupIndex / 2), orderIndex = placement < count ? placement : count * 2 - 1 - placement;
    state.game.currentPlayerId = state.players.turnOrder[orderIndex];
    state.game.phase = `${session.setupIndex % 2 ? "setup-road" : "setup-settlement"}-${session.setupIndex < count * 2 ? 1 : 2}`;
    state.game.setupState.currentPlacementIndex = placement;
  }
  updateScores(state);
}
function applyCatan(input, actor, action, context) {
  if (!input || input.schemaVersion !== 1 || input.engineVersion !== CATAN_ENGINE_VERSION) reject("Unsupported game version.");
  if (!input.seats.some((s) => s.id === actor)) reject("You are not a participant.");
  if (!action || typeof action !== "object" || typeof action.type !== "string") reject("Invalid action.");
  if (input.state.game.phase === "ended") reject("The game has ended.");
  const result = structuredClone(input), state = result.state;
  if (state.game.phase.startsWith("setup-")) setup(result, actor, action, context);
  else if (action.type === "TRADE_OFFER") {
    if (state.game.phase !== "main" || state.game.currentPlayerId !== actor || result.offer || !input.seats.some((s) => s.id === action.to && s.id !== actor)) reject("Cannot offer this trade now.");
    const give = resourceBundle(action.give), receive = resourceBundle(action.receive), from = state.players.players.find((p) => p.id === actor);
    if (RESOURCES.some((r) => give[r] > from.resources[r] || give[r] > 0 && receive[r] > 0)) reject("You must own the offered resources; a resource cannot be on both sides.");
    result.offer = { id: context.id(), from: actor, to: action.to, give, receive };
  } else if (["TRADE_ACCEPT", "TRADE_DECLINE", "TRADE_CANCEL"].includes(action.type)) {
    const response = action, offer = result.offer;
    if (!offer || response.offerId !== offer.id || state.game.phase !== "main" || state.game.currentPlayerId !== offer.from) reject("The trade is no longer available.");
    if (response.type === "TRADE_CANCEL" ? actor !== offer.from : actor !== offer.to) reject("You cannot respond to this trade.");
    if (response.type === "TRADE_ACCEPT") {
      const from = state.players.players.find((p) => p.id === offer.from), to = state.players.players.find((p) => p.id === offer.to);
      if (RESOURCES.some((r) => from.resources[r] < offer.give[r] || to.resources[r] < offer.receive[r])) reject("A player no longer owns the required resources.");
      for (const r of RESOURCES) {
        from.resources[r] += offer.receive[r] - offer.give[r];
        to.resources[r] += offer.give[r] - offer.receive[r];
      }
      from.totalTradesMade++;
      to.totalTradesMade++;
    }
    result.offer = null;
  } else {
    if (result.offer) reject("Respond to or cancel the pending trade first.");
    if (isTurnAction(action)) {
      const outcome = applyTurn(state, action, actor, context.randomInt);
      if (!outcome.success) reject("error" in outcome ? outcome.error : "Invalid turn action.");
      if (outcome.success) result.state = outcome.state;
    } else {
      const allowed = ["BUILD_ROAD", "BUILD_SETTLEMENT", "BUILD_CITY", "BUY_DEVELOPMENT_CARD", "BANK_TRADE", "END_TURN", "PLAY_KNIGHT", "PLAY_ROAD_BUILDING", "PLAY_YEAR_OF_PLENTY", "PLAY_MONOPOLY"];
      if (!allowed.includes(action.type)) reject("Unsupported action.");
      const outcome = applyEconomy(state, result.deck, action, actor, context);
      if (!outcome.success) reject("error" in outcome ? outcome.error : "Invalid game action.");
      if (outcome.success) {
        result.state = outcome.state;
        result.deck = outcome.deck;
      }
    }
  }
  result.revision++;
  result.state.log.log = result.state.log.log.slice(-50);
  result.history = [...result.history, { revision: result.revision, playerId: actor, message: action.type.toLowerCase().replaceAll("_", " ") }].slice(-30);
  return result;
}
function canAfford(resources, cost) {
  return RESOURCES.every((r) => resources[r] >= (cost[r] || 0));
}
function eligibleActors(session) {
  if (session.state.game.phase === "ended") return [];
  if (session.offer) return [session.offer.to, session.offer.from];
  return session.state.game.phase === "discard" ? session.state.game.pendingDiscard : [session.state.game.currentPlayerId];
}
function discardChoice(resources, count) {
  const result = empty(), remaining = { ...resources };
  while (count-- > 0) {
    const resource = RESOURCES.reduce((best, r) => remaining[r] > remaining[best] ? r : best, RESOURCES[0]);
    result[resource]++;
    remaining[resource]--;
  }
  return result;
}
function catanChoices(state, actor, offer) {
  const player = state.players.players.find((p) => p.id === actor);
  if (!player || state.game.phase === "ended") return [];
  if (offer) {
    if (offer.from === actor) return [{ type: "TRADE_CANCEL", offerId: offer.id }];
    if (offer.to !== actor) return [];
    return [{ type: "TRADE_DECLINE", offerId: offer.id }, ...canAfford(player.resources, offer.receive) ? [{ type: "TRADE_ACCEPT", offerId: offer.id }] : []];
  }
  if (state.game.phase === "discard") return state.game.pendingDiscard.includes(actor) ? [{ type: "DISCARD_RESOURCES", resources: discardChoice(player.resources, state.game.discardAmounts?.[actor] ?? 0) }] : [];
  if (state.game.currentPlayerId !== actor) return [];
  if (state.game.phase.startsWith("setup-settlement")) return validSetupSettlements(state).map((vertex) => ({ type: "PLACE_SETTLEMENT", vertex }));
  if (state.game.phase.startsWith("setup-road")) return validSetupRoads(state).map((edge) => ({ type: "PLACE_ROAD", edge }));
  if (state.game.phase === "robber-move") return robberPlacements(state, actor).map((hex) => ({ type: "MOVE_ROBBER", hex }));
  if (state.game.phase === "robber-steal") return victims(state, state.board.robberLocation, actor).map((victimId) => ({ type: "STEAL_RESOURCE", victimId }));
  if (state.game.phase === "road-building") return validRoads(state, actor).map((edge) => ({ type: "BUILD_ROAD", edge }));
  const choices = [];
  if (state.game.phase === "roll") choices.push({ type: "ROLL_DICE" });
  else if (state.game.phase === "main") {
    choices.push({ type: "END_TURN" });
    if (player.roadsRemaining > 0 && canAfford(player.resources, COSTS.road)) choices.push(...validRoads(state, actor).map((edge) => ({ type: "BUILD_ROAD", edge })));
    if (player.settlementsRemaining > 0 && canAfford(player.resources, COSTS.settlement)) choices.push(...validSettlements(state, actor).map((vertex) => ({ type: "BUILD_SETTLEMENT", vertex })));
    if (player.citiesRemaining > 0 && canAfford(player.resources, COSTS.city)) choices.push(...state.board.buildings.filter((b) => b.playerId === actor && b.type === "settlement").map((b) => ({ type: "BUILD_CITY", vertex: b.vertex })));
    if (state.game.developmentDeckCount > 0 && canAfford(player.resources, COSTS.development)) choices.push({ type: "BUY_DEVELOPMENT_CARD" });
    for (const give of RESOURCES) if (player.resources[give] >= bankRate(state, actor, give)) {
      for (const receive of RESOURCES) if (give !== receive && state.game.bank[receive] > 0) choices.push({ type: "BANK_TRADE", give: { resource: give, amount: bankRate(state, actor, give) }, receive: { resource: receive, amount: 1 } });
    }
  } else return [];
  if (!state.game.devCardPlayedThisTurn && !player.hasPlayedDevCard) {
    const cards = new Set(player.developmentCards.filter((c) => !c.isPlayed && c.turnBought !== state.game.turn).map((c) => c.type));
    if (cards.has("knight")) choices.push({ type: "PLAY_KNIGHT", hex: state.board.robberLocation });
    if (cards.has("roadBuilding") && player.roadsRemaining > 0 && validRoads(state, actor).length) choices.push({ type: "PLAY_ROAD_BUILDING" });
    if (cards.has("monopoly")) choices.push(...RESOURCES.map((resource) => ({ type: "PLAY_MONOPOLY", resource })));
    if (cards.has("yearOfPlenty")) {
      for (let i = 0; i < 5; i++) for (let j = i; j < 5; j++) if (state.game.bank[RESOURCES[i]] > (i === j ? 1 : 0) && state.game.bank[RESOURCES[j]] > 0) choices.push({ type: "PLAY_YEAR_OF_PLENTY", resources: [RESOURCES[i], RESOURCES[j]] });
    }
  }
  return choices;
}
function catanView(session, actor) {
  if (!session.seats.some((s) => s.id === actor)) reject("You are not a participant.");
  const state = structuredClone(projectView(session.state, actor));
  return { apiVersion: 1, engineVersion: session.engineVersion, id: session.id, revision: session.revision, you: actor, state, seats: structuredClone(session.seats), offer: structuredClone(session.offer), history: structuredClone(session.history), choices: catanChoices(state, actor, session.offer) };
}
const BOT_VERSION = "heuristic-1.0.0";
const terrain = { hills: "brick", forest: "lumber", mountains: "ore", fields: "grain", pasture: "wool" };
const pips = (n) => n && n !== 7 ? 6 - Math.abs(7 - n) : 0;
function production(view, vertex) {
  const result = { brick: 0, lumber: 0, ore: 0, grain: 0, wool: 0 };
  for (const tile of view.state.board.tiles) if (getHexVertices(tile.coord).some((v) => vertexKey(v) === vertexKey(vertex))) {
    const r = terrain[tile.terrain];
    if (r) result[r] += pips(tile.number);
  }
  return result;
}
function settlementValue(view, vertex) {
  const amounts = production(view, vertex), owned = view.state.board.buildings.filter((b) => b.playerId === view.you);
  const existing = owned.map((b) => production(view, b.vertex));
  let value = Object.values(amounts).reduce((a, b) => a + b, 0) * 2 + Object.values(amounts).filter((n) => n > 0).length * 4;
  const newBonus = { lumber: 5, brick: 5, grain: 4, ore: 4, wool: 3 };
  for (const r of RESOURCES) if (amounts[r] > 0 && !existing.some((e) => e[r] > 0)) value += newBonus[r];
  for (const tile of view.state.board.tiles) if ([6, 8].includes(tile.number) && getHexVertices(tile.coord).some((v) => vertexKey(v) === vertexKey(vertex))) value += 2;
  for (const port of view.state.board.ports) if (port.vertices.some((v) => vertexKey(v) === vertexKey(vertex))) value += port.type === "generic" ? 2 : amounts[port.type] > 0 ? 3 : 1;
  return value;
}
function goals(view) {
  const player = view.state.players.players.find((p) => p.id === view.you);
  const result = [];
  if (player.settlementsRemaining > 0 && validSettlements(view.state, view.you).length) result.push(COSTS.settlement);
  if (player.citiesRemaining > 0 && view.state.board.buildings.some((b) => b.playerId === view.you && b.type === "settlement")) result.push(COSTS.city);
  if (player.roadsRemaining > 0 && player.settlementsRemaining > 0) result.push({ brick: 2, lumber: 2, wool: 1, grain: 1 });
  if (view.state.game.developmentDeckCount > 0) result.push(COSTS.development);
  return result.length ? result : [COSTS.city];
}
function deficit(resources, goal) {
  return RESOURCES.reduce((total, r) => total + Math.max(0, (goal[r] || 0) - resources[r]), 0);
}
function target(view) {
  const resources = view.state.players.players.find((p) => p.id === view.you).resources;
  return goals(view).reduce((best, goal) => deficit(resources, goal) < deficit(resources, best) ? goal : best);
}
function roadValue(view, edge) {
  const state = structuredClone(view.state);
  state.board.roads.push({ id: "candidate", type: "road", playerId: view.you, edge });
  const reachable = validSettlements(state, view.you);
  if (reachable.length) return 40 + Math.max(...reachable.map((v) => settlementValue(view, v))) / 4;
  const targets = new Map(validSetupSettlements(state).map((v) => [vertexKey(v), v]));
  const start = getEdgeVertices(edge);
  let best = 0;
  for (const v of start) for (const candidate of targets.values()) {
    const distance = Math.abs(v.hex.q - candidate.hex.q) + Math.abs(v.hex.r - candidate.hex.r) + Number(v.direction !== candidate.direction);
    if (distance <= 3) best = Math.max(best, settlementValue(view, candidate) / (distance + 1));
  }
  return best;
}
function chooseBot(view, level = "standard", sample = () => 0.5) {
  if (!view.choices.length) throw new Error("No legal decision for this bot.");
  if (view.choices.length > 256 || JSON.stringify(view).length > 131072) throw new Error("Bot observation exceeds the work budget.");
  const own = view.state.players.players.find((p) => p.id === view.you);
  const goal = target(view), need = (r) => Math.max(0, (goal[r] || 0) - own.resources[r]);
  function value(action) {
    switch (action.type) {
      case "PLACE_SETTLEMENT":
        return settlementValue(view, action.vertex);
      case "PLACE_ROAD":
        return roadValue(view, action.edge);
      case "BUILD_SETTLEMENT":
        return 140 + settlementValue(view, action.vertex);
      case "BUILD_CITY":
        return 135 + Object.values(production(view, action.vertex)).reduce((a, b) => a + b, 0);
      case "BUILD_ROAD":
        return (view.state.game.phase === "road-building" ? 100 : own.settlementsRemaining > 0 ? 35 : 5) + roadValue(view, action.edge);
      case "BUY_DEVELOPMENT_CARD":
        return 80;
      case "ROLL_DICE":
        return 10;
      case "END_TURN":
        return 0;
      case "PLAY_KNIGHT":
        return 95;
      case "PLAY_ROAD_BUILDING":
        return 90;
      case "PLAY_YEAR_OF_PLENTY":
        return 100 + action.resources.reduce((n, r) => n + need(r), 0);
      case "PLAY_MONOPOLY":
        return 100 + need(action.resource) * 2;
      case "BANK_TRADE": {
        const after = { ...own.resources };
        after[action.give.resource] -= action.give.amount;
        after[action.receive.resource] += action.receive.amount;
        const improve = deficit(own.resources, goal) - deficit(after, goal);
        return improve > 0 ? 45 + improve : -100;
      }
      case "DISCARD_RESOURCES":
        return 100;
      case "MOVE_ROBBER": {
        const tile = view.state.board.tiles.find((t) => t.coord.q === action.hex.q && t.coord.r === action.hex.r);
        const corners = new Set(getHexVertices(tile.coord).map(vertexKey));
        return view.state.board.buildings.filter((b) => corners.has(vertexKey(b.vertex))).reduce((sum, b) => sum + (b.playerId === view.you ? -30 : 10) * pips(tile.number), 0);
      }
      case "STEAL_RESOURCE":
        return view.state.players.players.find((p) => p.id === action.victimId)?.resourceCount || 0;
      case "TRADE_CANCEL":
      case "TRADE_DECLINE":
        return 0;
      case "TRADE_ACCEPT": {
        const offer = view.offer;
        const after = { ...own.resources };
        for (const r of RESOURCES) after[r] += offer.give[r] - offer.receive[r];
        return deficit(after, goal) < deficit(own.resources, goal) && Object.values(offer.give).reduce((a, b) => a + b, 0) >= Object.values(offer.receive).reduce((a, b) => a + b, 0) ? 20 : -10;
      }
      default:
        return -100;
    }
  }
  return view.choices.map((action, index) => ({ action, index, score: value(action) + (level === "easy" ? sample() * 35 : sample() * 0.01) })).reduce((best, candidate) => candidate.score > best.score ? candidate : best).action;
}
function botDecision(view, level) {
  let seed = 2166136261;
  for (const ch of `${view.id}:${view.revision}:${view.you}:${BOT_VERSION}`) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  return chooseBot(view, level, () => {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    return seed / 4294967296;
  });
}
export {
  BOT_VERSION,
  CATAN_ENGINE_VERSION,
  COSTS,
  CatanRuleError,
  RESOURCES,
  applyCatan,
  botDecision,
  catanChoices,
  catanView,
  chooseBot,
  edgeKey,
  eligibleActors,
  getEdgeVertices,
  getHexVertices,
  newCatan,
  score,
  settlementValue,
  validRoads,
  validSettlements,
  validSetupSettlements,
  vertexKey
};
