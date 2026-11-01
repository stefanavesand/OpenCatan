import { test, expect, type BrowserContext } from '@playwright/test';
const address = 'http://127.0.0.1:4175/OpenCatan/hello/';
const backend = 'https://ppaixjqaixwnebhxfjeb.supabase.co';
const roomId = '11111111-1111-4111-8111-111111111111';
const stateKey = 'spelhyllan-online-state-v1';
type Room = { roomId: string; board: string; revision: number; status: string; nextTurn: string; playerX: string; playerO: string | null };
function fakeBackend() {
  let room: Room | null = null, count = 0, loseReply = false;
  const receipts = new Map<string, unknown>();
  const commands: string[] = [];
  const requests: string[] = [];
  let failure: { path: string; status: number; headers: Record<string, string>; body: unknown } | null = null;
  async function attach(context: BrowserContext, player: string) {
    await context.route(`${backend}/**`, async route => {
      const request = route.request();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
      const path = new URL(request.url()).pathname;
      const args = request.postDataJSON();
      requests.push(path);
      if (failure && path.endsWith(failure.path)) {
        const next = failure; failure = null;
        await route.fulfill({ status: next.status, json: next.body, headers: { ...headers, ...next.headers } }); return;
      }
      let body: unknown;
      const fail = (code: string) => ({ ok: false, error: { code } });
      const view = () => ({ ...room, you: room?.playerX === player ? 'X' : 'O' });
      if (path.startsWith('/auth/')) body = { access_token: player, refresh_token: `refresh-${player}`, user: { id: player }, expires_at: 9999999999 };
      else if (path.endsWith('v1_get_room')) body = room && [room.playerX, room.playerO].includes(player) ? { ok: true, apiVersion: 1, room: view() } : fail('room_not_found');
      else {
        const key = `${player}:${args.p_command_id}`; commands.push(key);
        if (receipts.has(key)) body = { ...(receipts.get(key) as object), duplicate: true };
        else {
          let error = '';
          if (path.endsWith('v1_create_room')) room = { roomId, board: '.........', revision: 0, status: 'waiting', nextTurn: 'X', playerX: player, playerO: null };
          else if (path.endsWith('v1_join_room')) {
            if (!room || args.p_room_id !== roomId) error = 'room_not_found';
            else if (room.playerO && ![room.playerX, room.playerO].includes(player)) error = 'room_full';
            else if (room.playerX !== player) { room.playerO = player; room.status = 'playing'; room.revision++; }
          } else if (room && path.endsWith('v1_submit_move')) {
            if (room.revision !== args.p_expected_revision) error = 'revision_conflict';
            else if ((room.nextTurn === 'X' ? room.playerX : room.playerO) !== player) error = 'not_your_turn';
            else { const b = room.board.split(''); b[args.p_cell] = room.nextTurn; room.board = b.join(''); room.nextTurn = room.nextTurn === 'X' ? 'O' : 'X'; room.revision++; count++; }
          }
          body = error ? fail(error) : { ok: true, apiVersion: 1, room: view() };
          if (!error) receipts.set(key, body);
        }
      }
      if (loseReply && path.endsWith('v1_submit_move')) { loseReply = false; await route.abort('failed'); return; }
      await route.fulfill({ json: body, headers });
    });
  }
  return { attach, lose: () => { loseReply = true; }, moves: () => count, commands, requests, failOnce: (path: string, status: number, headers: Record<string, string> = {}, body: unknown = {}) => { failure = { path, status, headers, body }; } };
}

test('two identities, lost reply survives reload, same command retries once, offline pauses', async ({ browser }) => {
  const service = fakeBackend();
  const x = await browser.newContext(), o = await browser.newContext(), outsider = await browser.newContext();
  try {
    await service.attach(x, 'player-x'); await service.attach(o, 'player-o'); await service.attach(outsider, 'third');
    const a = await x.newPage(), b = await o.newPage(), c = await outsider.newPage();
    await a.goto(`${address}#online`); await expect(a.locator('#offline')).toHaveText('Klart för offline');
    await a.locator('#online-create').click(); await expect(a.locator('#online-status')).toContainText('väntar på en vän');
    const link = await a.locator('#online-link').inputValue();
    await b.goto(link); await b.locator('#online-join-button').click(); await expect(b.locator('#online-status')).toContainText('Du är O');
    await a.locator('#online-retry').click(); await expect(a.locator('#online-status')).toContainText('din tur');
    await c.goto(link); await c.locator('#online-join-button').click(); await expect(c.locator('#online-error')).toContainText('redan två');
    await expect(c.locator('#online-command')).toHaveAttribute('data-state', 'rejected');
    service.lose(); await a.getByRole('button', { name: 'Onlineruta 1, ledig', exact: true }).click();
    await expect(a.locator('#online-error')).toContainText('Ingen kontakt');
    await expect(a.locator('#online-command')).toHaveAttribute('data-state', 'unknown'); expect(service.moves()).toBe(1);
    const intent = await a.evaluate(key => JSON.parse(localStorage.getItem(key)!).pending, stateKey);
    expect(intent.args.p_cell).toBe(0);
    await a.reload(); await expect(a.locator('#online-board')).toHaveAttribute('data-revision', '2');
    expect(service.moves()).toBe(1);
    expect(service.commands.filter(key => key.endsWith(intent.args.p_command_id))).toHaveLength(2);
    await b.locator('#online-retry').click(); await b.getByRole('button', { name: 'Onlineruta 5, ledig', exact: true }).click();
    await expect(b.locator('#online-board')).toHaveAttribute('data-revision', '3');
    await a.locator('#online-retry').click(); await expect(a.locator('#online-board')).toHaveAttribute('data-revision', '3');
    await x.setOffline(true); await expect(a.locator('#online-connection')).toContainText('pausat');
    await expect(a.getByRole('button', { name: 'Onlineruta 2, ledig', exact: true })).toBeDisabled();
    await a.reload(); await expect(a.locator('#online-connection')).toContainText('pausat');
    await x.setOffline(false); await expect(a.locator('#online-board')).toHaveAttribute('data-revision', '3');
    await expect(a.getByRole('button', { name: 'Onlineruta 2, ledig', exact: true })).toBeEnabled();
    // Local pass-and-play stays separate from remote state.
    await a.goto(`${address}#tre-i-rad`); await expect(a.locator('#board')).toHaveAttribute('data-revision', '0');
  } finally { await Promise.all([x.close(), o.close(), outsider.close()]); }
});

test('expired identity is retained when refresh fails; no replacement signup', async ({ page }) => {
  let signups = 0;
  await page.addInitScript(() => localStorage.setItem('spelhyllan-online-auth-v1', JSON.stringify({ access_token: 'old', refresh_token: 'old-refresh', user: { id: 'old-player' }, expires_at: 1 })));
  await page.route(`${backend}/**`, async route => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }); return; }
    if (route.request().url().includes('signup')) signups++;
    await route.fulfill({ status: 401, json: {}, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(`${address}#online`);
  await page.locator('#online-create').click();
  await expect(page.locator('#online-error')).toContainText('inloggning kunde inte bekräftas');
  expect(signups).toBe(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('spelhyllan-online-auth-v1')!).user.id)).toBe('old-player');
});

test('429 waits for Retry-After without dropping or changing the command', async ({ page, context }) => {
  const service = fakeBackend(); await service.attach(context, 'player-x');
  await page.clock.install();
  await page.goto(`${address}#online`);
  service.failOnce('v1_create_room', 429, { 'retry-after': '20', 'access-control-expose-headers': 'Retry-After' });
  await page.locator('#online-create').click();
  await expect(page.locator('#online-connection')).toHaveAttribute('data-state', 'backoff');
  await expect(page.locator('#online-command')).toHaveAttribute('data-state', 'unknown');
  await expect(page.locator('#online-retry')).toBeDisabled();
  const intent = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).pending, stateKey);
  const before = service.requests.length;
  await page.clock.runFor(19000); expect(service.requests.length).toBe(before);
  await page.clock.runFor(2000);
  await expect(page.locator('#online-status')).toContainText('väntar på en vän');
  expect(service.commands[0]).toBe(`player-x:${intent.args.p_command_id}`);
  await expect(page.locator('#online-command')).toHaveAttribute('data-state', 'accepted');
});

for (const response of [{ ok: true, apiVersion: 99, room: {} }, { ok: false, error: { code: 'future_unknown_error' } }])
test(`incompatible API response preserves intent and stops automatic retry: ${JSON.stringify(response)}`, async ({ page, context }) => {
  const service = fakeBackend(); await service.attach(context, 'player-x');
  await page.clock.install(); await page.goto(`${address}#online`);
  service.failOnce('v1_create_room', 200, {}, response);
  await page.locator('#online-create').click();
  await expect(page.locator('#online-connection')).toHaveAttribute('data-state', 'version-blocked');
  const before = service.requests.length;
  await page.clock.runFor(120000); expect(service.requests.length).toBe(before);
  expect(await page.evaluate(key => !!JSON.parse(localStorage.getItem(key)!).pending, stateKey)).toBe(true);
});

test('missing saved room stops polling instead of reconnecting forever', async ({ page, context }) => {
  const service = fakeBackend(); await service.attach(context, 'player-x');
  await page.addInitScript(({ key, room }) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 1, roomId: room, pending: null })), { key: stateKey, room: roomId });
  await page.clock.install(); await page.goto(`${address}#online`);
  await expect(page.locator('#online-connection')).toHaveAttribute('data-state', 'closed');
  const before = service.requests.length;
  await page.clock.runFor(120000); expect(service.requests.length).toBe(before);
});
