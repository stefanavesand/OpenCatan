import { test, expect, chromium } from '@playwright/test';
const address = 'http://127.0.0.1:4175/OpenCatan/hello/';
test('LIVE: two real players, polling, persisted identity, recovery and finished game', async ({ browserName }, testInfo) => {
  test.skip(process.env.PWA_LIVE !== '1', 'Opt in: creates two anonymous users and a room in the real service.');
  test.setTimeout(180000);
  expect(browserName).toBe('chromium');
  const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined });
  try {
    const x = await browser.newContext(), o = await browser.newContext();
    const a = await x.newPage(), b = await o.newPage();
    for (const page of [a, b]) {
      page.on('requestfailed', request => console.log('Network failure', new URL(request.url()).pathname, request.failure()?.errorText));
      page.on('response', response => { if (response.url().includes('supabase.co')) console.log('Backend HTTP', new URL(response.url()).pathname, response.status()); });
      page.on('pageerror', error => console.log('Page error', error.message));
    }
    await a.goto(`${address}#online`);
    await expect(a.locator('#offline')).toHaveText('Klart för offline');
    await a.locator('#online-create').click();
    await expect(a.locator('#online-status')).toContainText('väntar på en vän', { timeout: 30000 }).catch(async error => { console.log('UI error', await a.locator('#online-error').textContent()); throw error; });
    const link = await a.locator('#online-link').inputValue();
    await b.goto(link); await b.locator('#online-join-button').click();
    await expect(b.locator('#online-status')).toContainText('Du är O', { timeout: 30000 });
    await expect(a.locator('#online-status')).toContainText('din tur', { timeout: 20000 });
    for (const [page, cell, revision] of [[a, 0, 2], [b, 3, 3], [a, 1, 4], [b, 4, 5]] as const) {
      const button = page.getByRole('button', { name: `Onlineruta ${cell + 1}, ledig`, exact: true });
      await expect(button).toBeEnabled({ timeout: 20000 }); await button.click();
      await expect(page.locator('#online-board')).toHaveAttribute('data-revision', String(revision));
    }
    const identity = await a.evaluate(() => JSON.parse(localStorage.getItem('spelhyllan-online-auth-v1')!).user.id);
    await x.setOffline(true); await expect(a.locator('#online-connection')).toContainText('pausat');
    await a.reload(); await expect(a.locator('#online-connection')).toContainText('pausat');
    await x.setOffline(false);
    await expect(a.locator('#online-board')).toHaveAttribute('data-revision', '5', { timeout: 30000 });
    expect(await a.evaluate(() => JSON.parse(localStorage.getItem('spelhyllan-online-auth-v1')!).user.id)).toBe(identity);
    await a.getByRole('button', { name: 'Onlineruta 3, ledig', exact: true }).click();
    await expect(a.locator('#online-status')).toHaveText('X vann!');
    await expect(b.locator('#online-status')).toHaveText('X vann!', { timeout: 20000 });
    await a.screenshot({ path: testInfo.outputPath('online-live.png'), fullPage: true });
  } finally { await browser.close(); }
});
