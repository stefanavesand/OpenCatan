import { test, expect, type Page } from '@playwright/test';
import type { GameAction } from '../../src/types/game';

test('post-setup turns, bank trade, city costs and a synchronized ten-point victory', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const [host, peer] = await Promise.all(contexts.map(c => c.newPage()));
  const pages = [host, peer];
  const errors: string[] = [];
  for (const page of pages) page.on('pageerror', error => errors.push(error.message));
  const state = (page: Page) => page.getByTestId('game-state');
  const active = async () => await state(peer).getAttribute('data-current-player') === await state(peer).getAttribute('data-local-player') ? peer : host;
  const dispatch = async (page: Page, action: GameAction) => page.evaluate(async action => {
    const { store } = await import('/src/game/state/store.ts');
    const { hostManager } = await import('/src/network/hostManager.ts');
    const { peerManager } = await import('/src/network/peerManager.ts');
    if (store.getState().lobby.isHost) hostManager.handleAction(store.getState().lobby.localPlayerId, action);
    else peerManager.sendAction(action);
  }, action);
  const rollToMain = async (page: Page) => {
    await page.getByRole('button', { name: 'Roll dice', exact: true }).click();
    await expect.poll(() => state(page).getAttribute('data-phase')).toMatch(/main|robber-move/);
    if (await state(page).getAttribute('data-phase') === 'robber-move') {
      const hex = await page.evaluate(async () => {
        const { store } = await import('/src/game/state/store.ts');
        const { victims } = await import('/src/game/engine/base/turn.ts');
        const s = store.getState();
        return s.board.tiles.find(t => t.terrain !== 'water'
          && (t.coord.q !== s.board.robberLocation.q || t.coord.r !== s.board.robberLocation.r)
          && victims(s, t.coord, s.lobby.localPlayerId).length === 0).coord;
      });
      await dispatch(page, { type: 'MOVE_ROBBER', hex });
    }
    for (const p of pages) await expect(state(p)).toHaveAttribute('data-phase', 'main');
  };
  try {
    const room = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => String.fromCharCode(65 + n % 26)).join('');
    await host.goto(`/${room}`);
    await expect(host.getByRole('button', { name: 'Ready Up', exact: true })).toBeVisible();
    await peer.goto(`/${room}`);
    await host.getByRole('button', { name: 'Ready Up', exact: true }).click();
    await peer.getByRole('button', { name: 'Ready Up', exact: true }).click();
    await host.getByRole('button', { name: 'Start Game', exact: true }).click();
    for (const page of pages) await expect(state(page)).toHaveAttribute('data-buildings', '0');
    for (let i = 0; i < 4; i++) {
      const page = await active();
      await page.locator('g.vertex[data-can-place="true"] circle.placement-hit').first().click();
      for (const p of pages) await expect(state(p)).toHaveAttribute('data-buildings', String(i + 1));
      await page.locator('g.edge[data-can-place="true"] rect.valid-placement').first().click();
      for (const p of pages) await expect(state(p)).toHaveAttribute('data-roads', String(i + 1));
    }
    const first = await active();
    await rollToMain(first);
    await first.getByRole('button', { name: 'End turn', exact: true }).click();
    for (const p of pages) await expect(state(p)).toHaveAttribute('data-phase', 'roll');
    const player = await active();
    expect(player).not.toBe(first);
    await rollToMain(player);
    const playerId = await state(player).getAttribute('data-local-player');

    // Scenario fixture: supply a known affordable hand from the bank. No rule,
    // turn or revision is skipped, and each actual move below uses the UI/relay.
    const readyBank = await host.evaluate(async playerId => {
      const { store } = await import('/src/game/state/store.ts');
      const { hostManager } = await import('/src/network/hostManager.ts');
      const { bankRate } = await import('/src/game/engine/base/board.ts');
      const s = structuredClone(store.getState());
      const p = s.players.players.find(p => p.id === playerId);
      for (const [resource, target] of Object.entries({ brick: 12, lumber: 0, ore: 4, grain: 3, wool: 1 })) {
        s.game.bank[resource] -= target - p.resources[resource]; p.resources[resource] = target;
      }
      store.dispatch({ type: 'session/applyView', payload: { game: s.game, board: s.board, players: s.players, log: s.log } });
      // Publish the fixture through the actual revisioned session. Never install
      // authoritative hands in a peer browser.
      const result = hostManager.handleAction(playerId, { type: 'BANK_TRADE',
        give: { resource: 'brick', amount: bankRate(s, playerId, 'brick') }, receive: { resource: 'wool', amount: 1 } });
      if (!result.success) throw new Error(result.error);
      return store.getState().game.bank.wool;
    }, playerId);
    await expect.poll(() => player.evaluate(async () => (await import('/src/game/state/store.ts')).store.getState().game.bank.wool)).toBe(readyBank);

    await player.getByTitle('Open trade menu', { exact: true }).click();
    await expect(player.getByRole('button', { name: 'Player Trade', exact: true })).toBeDisabled();
    await player.getByTitle(/^Brick \([234]:1, have/).click();
    await player.getByTitle(/^Wool \(Bank has/).click();
    await player.getByRole('button', { name: /^\+[234]$/ }).click();
    await player.getByRole('button', { name: 'Trade with Bank', exact: true }).click();
    await player.getByRole('button', { name: 'Build city', exact: true }).click();
    await player.locator('g.vertex[data-can-upgrade="true"] circle.upgrade-hit').first().click();
    for (const p of pages) await expect(state(p)).toHaveAttribute('data-cities', '1');
    await player.getByRole('button', { name: 'Buy development card', exact: true }).click();
    await expect.poll(async () => player.evaluate(async () => {
      const { store } = await import('/src/game/state/store.ts'); return store.getState().game.developmentDeckCount;
    })).toBe(24);
    await expect.poll(() => player.evaluate(async () => {
      const { store } = await import('/src/game/state/store.ts');
      const s = store.getState(); return s.players.players.find(p => p.id === s.lobby.localPlayerId).developmentCards.length;
    })).toBe(1);

    // Late-game fixture: three cities and two settlements = 8 visible points,
    // plus one hidden VP = 9. Upgrading a settlement wins at 10.
    await host.evaluate(async playerId => {
      const { store } = await import('/src/game/state/store.ts');
      const { validSetupSettlements } = await import('/src/game/engine/setupValidation.ts');
      const s = structuredClone(store.getState());
      s.board.buildings = [];
      for (let i = 0; i < 5; i++) s.board.buildings.push({ id: `late-${i}`, playerId,
        playerColor: s.players.players.find(p => p.id === playerId).color,
        vertex: validSetupSettlements(s)[0], type: i < 3 ? 'city' : 'settlement' });
      s.board.roads = [];
      const p = s.players.players.find(p => p.id === playerId);
      p.roadsRemaining = 15; p.citiesRemaining = 1; p.settlementsRemaining = 3;
      p.developmentCards = [{ id: 'vp-1', type: 'victoryPoint' }];
      for (const [r, target] of Object.entries({ ore: 3, grain: 2 })) { s.game.bank[r] -= target - p.resources[r]; p.resources[r] = target; }
      s.game.phase = 'main';
      store.dispatch({ type: 'session/applyView', payload: { game: s.game, board: s.board, players: s.players, log: s.log } });
    }, playerId);
    // The final city command routes through the real session and broadcasts its complete view.
    const vertex = await host.evaluate(async playerId => {
      const { store } = await import('/src/game/state/store.ts');
      return store.getState().board.buildings.find(b => b.playerId === playerId && b.type === 'settlement').vertex;
    }, playerId);
    await dispatch(player, { type: 'BUILD_CITY', vertex });
    for (const p of pages) {
      await expect(state(p)).toHaveAttribute('data-phase', 'ended');
      await expect(p.getByRole('heading', { name: /WINS!/ })).toBeVisible();
      await expect(p.getByText('10 Victory Points', { exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
    await player.screenshot({ path: 'test-results/gameplay-victory.png', fullPage: true });
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
