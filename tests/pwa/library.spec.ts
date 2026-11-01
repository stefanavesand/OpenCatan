import { test, expect, chromium, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const address = 'http://127.0.0.1:4175/OpenCatan/hello/';
const version = JSON.parse(await readFile('pwa/version.json', 'utf8')).version as string;
const nextVersion = version.replace(/\d+$/, patch => String(Number(patch) + 1));
const board = (page: Page) => page.getByRole('group', { name: 'Game board, three by three' });
async function click(page: Page, cell: number, revision: number) {
  await page.getByRole('button', { name: `Cell ${cell + 1}, empty`, exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-revision', String(revision));
  await expect(page.locator('#save-status')).toContainText('Saved on this device');
}

test('library, saved moves, explicit reset and validated copy restore', async ({ page }, testInfo) => {
  await page.goto(address);
  await expect(page.getByRole('heading', { name: 'Your game shelf.' })).toBeVisible();
  await page.getByRole('link', { name: 'Play tic-tac-toe', exact: true }).click();
  await expect(page.locator('#game-status')).toHaveText('X to move');
  await click(page, 0, 1); await click(page, 4, 2);
  await page.reload();
  await expect(board(page)).toHaveAttribute('data-revision', '2');
  await expect(page.getByRole('button', { name: 'Cell 1, X', exact: true })).toBeDisabled();
  await expect(page.locator('#game-status')).toHaveText('X to move');
  await page.getByText('Saves and backups', { exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save a backup', exact: true }).click();
  const copy = testInfo.outputPath('tic-tac-toe.json'); await (await downloaded).saveAs(copy);
  expect(JSON.parse(await readFile(copy, 'utf8')).moves).toEqual([0, 4]);
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Keep this game', exact: true }).first().click();
  await expect(board(page)).toHaveAttribute('data-revision', '2');
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, start a new game', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-revision', '0');
  await page.locator('#restore-game').setInputFiles(copy);
  await page.getByRole('button', { name: 'Yes, restore the backup', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-revision', '2');
  await page.locator('#restore-game').setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":2}') });
  await expect(page.locator('#save-error')).toContainText('The backup could not be restored');
  await expect(board(page)).toHaveAttribute('data-revision', '2');
  await page.getByRole('link', { name: 'Back to the game shelf', exact: false }).click();
  await expect(page.getByRole('link', { name: 'Continue game', exact: true })).toBeVisible();
});

test('offline game resumes after full browser restarts, including a finished game', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const profile = testInfo.outputPath('profile');
  let context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 820, height: 1180 } });
  try {
    let page = context.pages()[0]; await page.goto(`${address}#tic-tac-toe`);
    await expect(page.locator('#offline')).toHaveText('Ready for offline');
    await context.setOffline(true);
    for (const [i, cell] of [0, 3, 1, 4].entries()) await click(page, cell, i + 1);
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true, offline: true, viewport: { width: 820, height: 1180 } });
    page = context.pages()[0]; await page.goto(`${address}#tic-tac-toe`);
    await expect(board(page)).toHaveAttribute('data-revision', '4');
    await click(page, 2, 5);
    await expect(page.locator('#game-status')).toHaveText('X wins!');
    await page.screenshot({ path: 'test-results/pwa-local-game.png', fullPage: true });
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true, offline: true });
    page = context.pages()[0]; await page.goto(`${address}#tic-tac-toe`);
    await expect(page.locator('#game-status')).toHaveText('X wins!');
    await expect(board(page)).toHaveAttribute('data-revision', '5');
  } finally { await context.close(); }
});

test('a storage write failure never displays an unsaved move as completed', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      if (mode === 'readwrite') throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      return original.call(this, stores, mode, options);
    };
  });
  await page.goto(`${address}#tic-tac-toe`);
  await expect(page.locator('#game-status')).toHaveText('X to move');
  await page.getByRole('button', { name: 'Cell 1, empty', exact: true }).click();
  await expect(page.locator('#save-error')).toContainText('The move has not been made');
  await expect(board(page)).toHaveAttribute('data-revision', '0');
  await page.reload();
  await expect(page.locator('#game-status')).toHaveText('X to move');
  await expect(page.getByRole('button', { name: 'Cell 1, empty', exact: true })).toBeEnabled();
});

test('denied persistent storage is explained while normal local saving still works', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false });
    Object.defineProperty(navigator.storage, 'persist', { value: async () => false });
  });
  await page.goto(`${address}#tic-tac-toe`);
  await page.getByText('Saves and backups', { exact: true }).click();
  await page.getByRole('button', { name: 'Protect this save', exact: true }).click();
  await expect(page.locator('#persistence')).toContainText('the browser may clear storage');
  await click(page, 0, 1); await page.reload();
  await expect(board(page)).toHaveAttribute('data-revision', '1');
});

test('two concurrent writers cannot overwrite each other and a future schema is preserved', async ({ page }) => {
  await page.goto(`${address}#tic-tac-toe`);
  await click(page, 0, 1);
  const result = await page.evaluate(async () => {
    const { loadGame, saveGame } = await import('/OpenCatan/hello/storage.js');
    const { move } = await import('/OpenCatan/hello/game.js');
    const original = await loadGame();
    const results = await Promise.allSettled([saveGame(move(original, 3, Date.now()), original), saveGame(move(original, 4, Date.now()), original)]);
    return { completed: results.filter(r => r.status === 'fulfilled').length, game: await loadGame() };
  });
  expect(result.completed).toBe(1); expect(result.game.revision).toBe(2);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('spelhyllan', 1);
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction('sessions', 'readwrite');
        tx.objectStore('sessions').put({ schemaVersion: 99, moves: [] }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.locator('#save-error')).toContainText('format is not supported');
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeDisabled();
});

test('a verified app update preserves the saved game and it remains playable offline', async ({ page }) => {
  try {
    await page.goto(`${address}#tic-tac-toe`);
    await expect(page.locator('#offline')).toHaveText('Ready for offline');
    await click(page, 0, 1); await click(page, 4, 2);
    execFileSync(process.execPath, ['scripts/build-pwa.mjs'], { env: { ...process.env, PWA_VERSION: nextVersion } });
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.getRegistration(); await registration.update(); });
    await page.getByRole('button', { name: 'Install update', exact: true }).click();
    await expect(page.locator('.version')).toHaveText(`v${nextVersion}`);
    await expect(board(page)).toHaveAttribute('data-revision', '2');
    await expect(page.locator('#offline')).toHaveText('Ready for offline');
    await page.context().setOffline(true); await page.reload();
    await expect(board(page)).toHaveAttribute('data-revision', '2');
    await click(page, 1, 3);
  } finally { execFileSync(process.execPath, ['scripts/build-pwa.mjs']); }
});
