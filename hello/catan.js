import { createSetup, validateSetup, setupPosition, submitSetup, axialToPixel, getHexCorners, getEdgeVertices, vertexToPixel, vertexKey, edgeKey } from './catan-engine.js';
import { createRecordStore, ConflictError } from './record-store.js';
const store = createRecordStore('game-shelf-catan', validateSetup);
const el = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const terrain = { hills: ['#c7815a', 'Brick'], forest: ['#315e4a', 'Lumber'], mountains: ['#808a9a', 'Ore'], fields: ['#d8b75b', 'Grain'], pasture: ['#9cc38c', 'Wool'], desert: ['#e2cfaa', 'Desert'] };
let record = null, ready = false, pending = null, replacement = null;
function svg(tag, attributes, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function points(edge) { return getEdgeVertices(edge).map(v => vertexToPixel(v, 54)); }
function control(node, label, coordinate, type) {
  node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', label);
  node.setAttribute('data-place', type); node.setAttribute('data-coordinate', JSON.stringify(coordinate));
  const act = () => { if (!ready || pending) return; place(type, coordinate); };
  node.addEventListener('click', act);
  node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); act(); } });
  return node;
}
function render() {
  const board = el('catan-board'); board.replaceChildren(); board.dataset.revision = String(record?.revision ?? 0);
  el('catan-reload').disabled = !!pending; el('catan-start').disabled = !ready || !!pending; el('catan-export').disabled = !ready || !record || !!pending; el('catan-import').disabled = !ready || !!pending;
  el('catan-start').textContent = record ? 'New setup' : 'Start setup';
  el('catan-save').textContent = pending ? 'Saving placement…' : record ? `Saved on this device · ${record.revision} placements` : 'Your setup will be saved on this device.';
  el('catan-players').replaceChildren();
  if (!record) { el('catan-status').textContent = ready ? 'Ready to start' : 'Loading saved setup…'; return; }
  const state = setupPosition(record), player = state.players.find(p => p.id === state.playerId);
  el('catan-status').textContent = state.phase === 'complete' ? 'Setup complete!' : `${player.name} · place a ${state.phase}`;
  el('catan-status').style.color = player?.color || '#176b42';
  el('catan-help').textContent = state.phase === 'complete' ? 'All starting pieces are placed. This preview ends here.' : `Round ${state.round} of 2 · tap a highlighted ${state.phase === 'settlement' ? 'intersection' : 'road'}${pending ? ' · saving…' : ''}`;
  for (const tile of state.board.tiles) {
    const center = axialToPixel(tile.coord, 54), [fill, name] = terrain[tile.terrain];
    const group = svg('g', {}); group.append(svg('title', {}, `${name}${tile.number ? `, ${tile.number}` : ''}`));
    group.append(svg('polygon', { points: getHexCorners(center, 54).map(p => `${p.x},${p.y}`).join(' '), fill, stroke: '#f5ede0', 'stroke-width': 2 }));
    if (tile.number) {
      group.append(svg('circle', { cx: center.x, cy: center.y - 5, r: 15, fill: '#fff9ec' }));
      group.append(svg('text', { x: center.x, y: center.y, 'text-anchor': 'middle', fill: [6, 8].includes(tile.number) ? '#a4372a' : '#243749', 'font-size': 17, 'font-weight': 750 }, tile.number));
    }
    group.append(svg('text', { x: center.x, y: center.y + 25, 'text-anchor': 'middle', fill: tile.terrain === 'forest' ? '#fff' : '#14243b', 'font-size': 10, 'font-weight': 650 }, name));
    board.append(group);
  }
  for (const road of state.board.roads) {
    const [a, b] = points(road.edge), owner = state.players.find(p => p.id === road.playerId);
    board.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#fff', 'stroke-width': 10, 'stroke-linecap': 'round' }));
    board.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: owner.color, 'stroke-width': 6, 'stroke-linecap': 'round', 'data-road': edgeKey(road.edge) }));
  }
  for (const settlement of state.board.buildings) {
    const p = vertexToPixel(settlement.vertex, 54), owner = state.players.find(p => p.id === settlement.playerId);
    board.append(svg('path', { d: `M${p.x-9},${p.y+8}v-13l9,-7 9,7v13z`, fill: owner.color, stroke: '#fff', 'stroke-width': 2, 'data-settlement': vertexKey(settlement.vertex) }));
  }
  if (!pending && ready) {
    for (const vertex of state.settlements) {
      const p = vertexToPixel(vertex, 54), group = svg('g', { class: 'catan-target' });
      group.append(svg('circle', { cx: p.x, cy: p.y, r: 20, fill: 'transparent' }));
      group.append(svg('circle', { cx: p.x, cy: p.y, r: 6, fill: '#fff', stroke: player.color, 'stroke-width': 3 }));
      board.append(control(group, `Place settlement at ${vertexKey(vertex)}`, vertex, 'settlement'));
    }
    for (const edge of state.roads) {
      const [a,b] = points(edge), group = svg('g', { class: 'catan-target' });
      group.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: 'transparent', 'stroke-width': 28 }));
      group.append(svg('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#fff', 'stroke-width': 9, 'stroke-dasharray': '5 4' }));
      board.append(control(group, `Place road at ${edgeKey(edge)}`, edge, 'road'));
    }
  }
  const order = [...record.order, ...record.order.slice().reverse()].map(i => `P${i+1}`).join(' → ');
  const note = document.createElement('p'); note.className = 'catan-order'; note.textContent = `Placement order: ${order}`; el('catan-players').append(note);
  for (const participant of state.players) {
    const card = document.createElement('article'); card.className = 'catan-player'; card.style.borderLeftColor = participant.color;
    const heading = document.createElement('h3'); heading.textContent = participant.name; card.append(heading);
    const pieces = document.createElement('p'); pieces.textContent = `${state.board.buildings.filter(b => b.playerId === participant.id).length}/2 settlements · ${state.board.roads.filter(r => r.playerId === participant.id).length}/2 roads`; card.append(pieces);
    const supplies = document.createElement('p'); supplies.textContent = Object.entries(participant.resources).map(([name,count]) => `${name}: ${count}`).join(' · '); card.append(supplies);
    el('catan-players').append(card);
  }
}
async function load() { record = await store.load(); ready = true; render(); }
async function save(candidate) {
  if (!ready || pending) return;
  el('catan-error').textContent = ''; pending = store.save(candidate, record); render();
  try { record = await pending; }
  catch (error) {
    if (error instanceof ConflictError) { try { record = await store.load(); } catch { ready = false; } }
    el('catan-error').textContent = `${error.message} The placement has not been completed.`;
  } finally { pending = null; render(); }
}
function place(type, position) {
  try {
    const state = setupPosition(record);
    const result = submitSetup(record, { commandId: crypto.randomUUID(), playerId: state.playerId, expectedRevision: record.revision, type, position }, Date.now());
    save(result.record);
  } catch (error) { el('catan-error').textContent = error.message; }
}
function start() {
  const count = Number(el('catan-count').value), order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const upper = i + 1, max = Math.floor(4294967296 / upper) * upper; let value;
    do { value = crypto.getRandomValues(new Uint32Array(1))[0]; } while (value >= max);
    const j = value % upper; [order[i], order[j]] = [order[j], order[i]];
  }
  save(createSetup(crypto.randomUUID(), count, order, Date.now()));
}
async function persistence(request = false) {
  try {
    const granted = request && navigator.storage?.persist ? await navigator.storage.persist() : await navigator.storage?.persisted?.();
    el('catan-persistence').textContent = granted ? 'Persistent storage is granted. A backup still provides extra protection.' : 'The browser may clear local storage. Save a backup for extra protection.';
    el('catan-persist').disabled = !!granted || !navigator.storage?.persist;
  } catch { el('catan-persistence').textContent = 'Persistent storage could not be granted. Normal local saving is still available.'; }
}
export async function prepareCatanUpdate() { if (pending) { try { await pending; } catch { /* Uncommitted placements were not shown as complete. */ } } }
export function mountCatan() {
  el('catan-start').onclick = () => { if (record) { replacement = start; el('catan-reset').hidden = false; } else start(); };
  el('catan-reset-yes').onclick = () => { el('catan-reset').hidden = true; replacement?.(); replacement = null; };
  el('catan-reset-no').onclick = () => { el('catan-reset').hidden = true; replacement = null; };
  el('catan-import').onchange = async event => {
    try {
      const file = event.target.files?.[0]; if (!file || !ready || pending) return;
      if (file.size > 20000) throw new Error('The setup backup is too large.');
      const imported = validateSetup(JSON.parse(await file.text()));
      replacement = () => save({ ...imported, id: crypto.randomUUID(), savedAt: Date.now() });
      el('catan-reset').hidden = false;
    } catch (error) { el('catan-error').textContent = error.message; }
    finally { event.target.value = ''; }
  };
  el('catan-persist').onclick = () => persistence(true);
  el('catan-reload').onclick = () => load().then(() => { el('catan-error').textContent = ''; }).catch(error => { ready = false; render(); el('catan-error').textContent = error.message; });
  el('catan-export').onclick = () => {
    if (!record || pending) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'catan-setup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  const refresh = () => { if (location.hash === '#catan' && !document.hidden && !pending) load().catch(error => { ready = false; render(); el('catan-error').textContent = error.message; }); };
  window.addEventListener('pageshow', refresh); window.addEventListener('hashchange', refresh); document.addEventListener('visibilitychange', refresh);
  render(); persistence(); load().catch(error => { ready = false; render(); el('catan-error').textContent = error.message; });
}
