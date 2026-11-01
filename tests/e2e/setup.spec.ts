import type { SessionClientMessage, SessionServerMessage } from '../../src/session/protocol';
import { test, expect, type Page } from '@playwright/test';

test('two players complete snake setup; commands are authenticated, deduplicated and private', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const peerContext = await browser.newContext();
  const host = await hostContext.newPage();
  const peer = await peerContext.newPage();
  const errors: string[] = [];
  const incoming: Array<SessionServerMessage | { type: 'ERROR'; code: string }> = [];
  const outgoing: SessionClientMessage[] = [];
  for (const page of [host, peer]) page.on('pageerror', error => errors.push(error.message));
  peer.on('websocket', socket => {
    socket.on('framereceived', frame => { try { incoming.push(JSON.parse(String(frame.payload))); } catch { /* ping */ } });
    socket.on('framesent', frame => { try { outgoing.push(JSON.parse(String(frame.payload))); } catch { /* ping */ } });
  });
  try {
    const room = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => String.fromCharCode(65 + n % 26)).join('');
    await host.goto(`/${room}`);
    await expect(host.getByRole('button', { name: 'Ready Up', exact: true })).toBeVisible();
    await peer.goto(`/${room}`);
    await expect(peer.getByRole('button', { name: 'Ready Up', exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Ready Up', exact: true }).click();
    await peer.getByRole('button', { name: 'Ready Up', exact: true }).click();
    await host.getByRole('button', { name: 'Start Game', exact: true }).click();
    const state = (page: Page) => page.getByTestId('game-state');
    for (const page of [host, peer]) await expect(state(page)).toHaveAttribute('data-buildings', '0');
    const peerId = await state(peer).getAttribute('data-local-player');
    const activePage = async () => (await state(host).getAttribute('data-current-player')) === peerId ? peer : host;
    const send = async (page: Page, message: unknown) => page.evaluate(async message => {
      // Use the real adapter, with no test-only application globals.
      const { partyClient } = await import('/src/network/partyClient.ts');
      partyClient.send(message);
    }, message);
    const firstView = () => incoming.flatMap(m => m.type === 'SESSION_MESSAGE' && m.payload.kind === 'view' ? [m.payload] : []).at(-1);
    await expect.poll(() => firstView()?.revision).toBe(0);
    const gameId = firstView().gameId;
    const command = (action: unknown, revision = firstView().revision) => ({ type: 'SESSION_COMMAND', command: {
      protocolVersion: 1, gameId, playerId: 'spoofed-host', commandId: crypto.randomUUID(), expectedRevision: revision, action } });
    const receipt = (id: string) => incoming.flatMap(m => m.type === 'SESSION_MESSAGE' && m.payload.kind === 'receipt' ? [m.payload.receipt] : []).find(r => r.commandId === id);

    // Wrong game and protocol are refused by the relay, before reaching the host.
    await send(peer, { ...command({ type: 'ROLL_DICE' }), command: { ...command({ type: 'ROLL_DICE' }).command, gameId: 'wrong-game' } });
    await expect.poll(() => incoming.some(m => m.type === 'ERROR' && m.code === 'WRONG_GAME')).toBe(true);
    const invalidVersion = command({ type: 'ROLL_DICE' });
    await send(peer, { ...invalidVersion, command: { ...invalidVersion.command, protocolVersion: 99 } });
    await expect.poll(() => incoming.some(m => m.type === 'ERROR' && m.code === 'INVALID_COMMAND')).toBe(true);

    await send(peer, { type: 'SESSION_DELIVERY', gameId, recipientId: peerId, payload: firstView() });
    await expect.poll(() => incoming.some(m => m.type === 'ERROR' && m.code === 'NOT_HOST')).toBe(true);

    // Complete both rounds using only rendered placement targets.
    let buildings = 0;
    let roads = 0;
    let replayed = false;
    let checkedIdentity = false;
    for (let placement = 0; placement < 4; placement++) {
      const active = await activePage();
      const inactive = active === host ? peer : host;
      await expect(inactive.locator('g.vertex[data-can-place="true"]')).toHaveCount(0);
      await active.locator('g.vertex[data-can-place="true"] circle.placement-hit').first().click();
      buildings++;
      for (const page of [host, peer]) await expect(state(page)).toHaveAttribute('data-buildings', String(buildings));
      for (const page of [host, peer]) await expect(state(page)).toHaveAttribute('data-phase', /setup-road/);
      if (active === host && !checkedIdentity) {
        // A peer cannot pretend to be the current host.
        const forged = command({ type: 'BUILD_ROAD', edge: { hex: { q: 0, r: 0 }, direction: 'E' } });
        await send(peer, forged);
        await expect.poll(() => receipt(forged.command.commandId)?.success).toBe(false);
        expect(receipt(forged.command.commandId).error).toMatch(/turn/);
        checkedIdentity = true;
      }
      await active.locator('g.edge[data-can-place="true"] rect.valid-placement').first().click();
      roads++;
      for (const page of [host, peer]) await expect(state(page)).toHaveAttribute('data-roads', String(roads));
      if (active === peer && !replayed) {
        const lastCommand = outgoing.filter(m => m.type === 'SESSION_COMMAND' && m.command.action.type === 'BUILD_ROAD').at(-1)!;
        const id = (lastCommand as Extract<SessionClientMessage, { type: 'SESSION_COMMAND' }>).command.commandId;
        await expect.poll(() => receipt(id)?.success).toBe(true);
        const revision = receipt(id).revision;
        const before = incoming.filter(m => m.type === 'SESSION_MESSAGE' && m.payload.kind === 'receipt' && m.payload.receipt.commandId === id).length;
        await send(peer, lastCommand);
        await expect.poll(() => incoming.filter(m => m.type === 'SESSION_MESSAGE' && m.payload.kind === 'receipt' && m.payload.receipt.commandId === id).length).toBe(before + 1);
        expect(receipt(id).revision).toBe(revision);
        for (const page of [host, peer]) await expect(state(page)).toHaveAttribute('data-roads', String(roads));
        const stale = command({ type: 'ROLL_DICE' }, 0);
        await send(peer, stale);
        await expect.poll(() => receipt(stale.command.commandId)?.error).toMatch(/Stale revision/);
        replayed = true;
      }
    }
    for (const page of [host, peer]) await expect(state(page)).toHaveAttribute('data-phase', 'roll');
    expect(replayed).toBe(true);
    expect(checkedIdentity).toBe(true);
    await expect.poll(() => firstView()?.revision).toBe(8);
    const view = firstView().view;
    expect(view.board.buildings).toHaveLength(4);
    expect(view.board.roads).toHaveLength(4);
    for (const player of view.players.players) {
      await expect(peer.getByTestId(`player-${player.id}`)).toHaveAttribute('data-resource-count', String(player.resourceCount));
      await expect(peer.getByTestId(`player-${player.id}`)).toHaveAttribute('data-victory-points', '2');
    }
    const other = view.players.players.find(p => p.id !== peerId);
    expect(Object.values(other.resources)).toEqual([0, 0, 0, 0, 0]);
    expect(other.resourceCount).toBeGreaterThan(0);
    expect(other.developmentCards).toEqual([]);
    // Seed an unmistakable host-only card to verify actual wire secrecy.
    await host.evaluate(async () => {
      const { store } = await import('/src/game/state/store.ts');
      const { hostManager } = await import('/src/network/hostManager.ts');
      const id = store.getState().lobby.localPlayerId;
      store.dispatch({ type: 'players/updatePlayer', payload: { playerId: id, updates: {
        developmentCards: [{ id: 'HOST-SECRET-CARD', type: 'victoryPoint', isPlayed: false }],
      } } });
      hostManager.broadcastState();
    });
    // Explicit sync keeps the same revision; the wire view must still be private.
    const prior = incoming.length;
    await send(peer, { type: 'SESSION_REQUEST', gameId });
    await expect.poll(() => incoming.length).toBeGreaterThan(prior);
    expect(JSON.stringify(incoming)).not.toContain('HOST-SECRET-CARD');
    // An old state from the authoritative transport must not roll the board back.
    const beforeOldView = incoming.length;
    await send(host, { type: 'SESSION_DELIVERY', gameId, recipientId: peerId,
      payload: { ...firstView(), revision: 0, view: { ...view, board: { ...view.board, buildings: [], roads: [] } } } });
    await expect.poll(() => incoming.slice(beforeOldView).some(m => m.type === 'SESSION_MESSAGE' && m.payload.kind === 'view'
      && m.payload.revision === 0 && m.payload.view.board.buildings.length === 0)).toBe(true);
    await expect(state(peer)).toHaveAttribute('data-buildings', '4');
    expect(errors).toEqual([]);
    await host.screenshot({ path: 'test-results/setup-host.png', fullPage: true });
    await peer.screenshot({ path: 'test-results/setup-peer.png', fullPage: true });
    await hostContext.close();
    await send(peer, command({ type: 'ROLL_DICE' }));
    await expect.poll(() => incoming.some(m => m.type === 'ERROR' && m.code === 'HOST_DISCONNECTED')).toBe(true);
    expect(await peer.evaluate(async () => (await import('/src/network/partyClient.ts')).partyClient.isHost)).toBe(false);
  } finally { await hostContext.close(); await peerContext.close(); }
});
