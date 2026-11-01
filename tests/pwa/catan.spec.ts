import { test, expect, chromium, type Page } from '@playwright/test';
const address = 'http://127.0.0.1:4175/OpenCatan/hello/#catan';
async function start(page: Page, count = '4') {
  await page.goto(address); await expect(page.locator('#catan-start')).toBeEnabled();
  await page.locator('#catan-count').selectOption(count); await page.locator('#catan-start').click();
  await expect(page.locator('#catan-status')).toContainText('place a settlement');
}
async function place(page: Page, revision: number) {
  await page.locator('#catan-board [data-place]').first().click();
  await expect(page.locator('#catan-board')).toHaveAttribute('data-revision', String(revision));
  await expect(page.locator('#catan-save')).toContainText('Saved on this device');
}
test('four-player setup, safe reset, backup/restore and invalid import', async ({ page }, testInfo) => {
  await start(page);
  for (let i = 1; i <= 16; i++) await place(page, i);
  await expect(page.locator('#catan-status')).toHaveText('Setup complete!');
  await expect(page.locator('#catan-board [data-settlement]')).toHaveCount(8);
  await expect(page.locator('#catan-board [data-road]')).toHaveCount(8);
  await expect(page.locator('#catan-board [data-place]')).toHaveCount(0);
  const download = page.waitForEvent('download'); await page.locator('#catan-export').click();
  const backup = testInfo.outputPath('setup.json'); await (await download).saveAs(backup);
  await page.screenshot({ path: 'test-results/catan-setup-ipad.png', fullPage: true });
  await page.locator('#catan-start').click(); await page.locator('#catan-reset-no').click();
  await expect(page.locator('#catan-board')).toHaveAttribute('data-revision', '16');
  await page.locator('#catan-start').click(); await page.locator('#catan-reset-yes').click();
  await expect(page.locator('#catan-board')).toHaveAttribute('data-revision', '0');
  await page.locator('#catan-import').setInputFiles(backup); await page.locator('#catan-reset-yes').click();
  await expect(page.locator('#catan-status')).toHaveText('Setup complete!');
  await page.locator('#catan-import').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":99}') });
  await expect(page.locator('#catan-error')).toContainText('compatible app version');
  await expect(page.locator('#catan-board')).toHaveAttribute('data-revision', '16');
});

test('three-player setup resumes offline after full browser restart', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const profile = testInfo.outputPath('profile');
  let context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 820, height: 1180 } });
  try {
    let page = context.pages()[0]; await start(page, '3');
    await expect(page.locator('#offline')).toHaveText('Ready for offline');
    await context.setOffline(true); for (let i=1; i<=5; i++) await place(page, i);
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true, offline: true, viewport: { width: 820, height: 1180 } });
    page = context.pages()[0]; await page.goto(address);
    await expect(page.locator('#catan-board')).toHaveAttribute('data-revision', '5');
    for (let i=6; i<=12; i++) await place(page, i);
    await expect(page.locator('#catan-status')).toHaveText('Setup complete!');
  } finally { await context.close(); }
});

test('failed placement save never appears completed; unknown schema is preserved', async ({ page }) => {
  await start(page, '3'); await place(page, 1);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      if (mode === 'readwrite') throw new DOMException('Storage full', 'QuotaExceededError');
      return original.call(this, stores, mode, options);
    };
  });
  await page.locator('#catan-board [data-place]').first().click();
  await expect(page.locator('#catan-error')).toContainText('placement has not been completed');
  await expect(page.locator('#catan-board')).toHaveAttribute('data-revision', '1');
  await expect(page.locator('#catan-board [data-road]')).toHaveCount(0);
  await page.reload(); await expect(page.locator('#catan-board')).toHaveAttribute('data-revision', '1');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('game-shelf-catan', 1);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put({ schemaVersion: 99 }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    });
  });
  await page.reload(); await expect(page.locator('#catan-error')).toContainText('compatible app version');
  await expect(page.locator('#catan-start')).toBeDisabled();
});
