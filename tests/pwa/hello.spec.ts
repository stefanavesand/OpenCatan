import { test, expect, chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const address = 'http://127.0.0.1:4175/OpenCatan/hello/';
const cssPath = 'pwa-dist/hello/style.css';
const initialVersion = JSON.parse(await readFile('pwa/version.json', 'utf8')).version as string;
const nextVersion = (step: number) => initialVersion.replace(/\d+$/, patch => String(Number(patch) + step));
function build(version = initialVersion) {
  execFileSync(process.execPath, ['scripts/build-pwa.mjs'], { env: { ...process.env, PWA_VERSION: version } });
}

test('verified resources survive offline reload and a full browser restart at the GitHub Pages path', async ({ browserName }, testInfo) => {
  expect(browserName).toBe('chromium');
  const profile = testInfo.outputPath('profile');
  let context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 820, height: 1180 } });
  try {
    let page = context.pages()[0];
    await page.goto(address);
    await expect(page.getByRole('heading', { name: 'Hello world.' })).toBeVisible();
    await expect(page.locator('#offline')).toHaveText('Klart för offline');
    const manifest = await (await page.request.get(new URL('manifest.webmanifest', address).href)).json();
    expect(manifest.display).toBe('standalone');
    expect(new URL(manifest.start_url, address).href).toBe(address);
    expect(new URL(manifest.scope, address).href).toBe(address);
    for (const icon of manifest.icons) {
      const response = await page.request.get(new URL(icon.src, address).href);
      expect(response.ok()).toBe(true);
      const bytes = await response.body();
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#offline')).toHaveText('Klart för offline');
    await expect(page.locator('#network')).toHaveText('Ingen nätanslutning');
    await context.close();
    context = await chromium.launchPersistentContext(profile, { headless: true, offline: true, viewport: { width: 820, height: 1180 } });
    page = context.pages()[0];
    await page.goto(address);
    await expect(page.getByRole('heading', { name: 'Hello world.' })).toBeVisible();
    await expect(page.locator('#offline')).toHaveText('Klart för offline');
    await page.screenshot({ path: 'test-results/pwa-hello-offline.png', fullPage: true });
  } finally { await context.close(); }
});

test('a corrupted first download never becomes ready for offline', async ({ browser }) => {
  const original = await readFile(cssPath);
  await writeFile(cssPath, Buffer.concat([original, Buffer.from('\n/* corrupt download */')]));
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(address);
    await expect(page.locator('#offline')).toHaveText('Inte klart för offline', { timeout: 25000 });
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { active: !!registration?.active, waiting: !!registration?.waiting, caches: await caches.keys() };
    });
    expect(state.active).toBe(false);
    expect(state.waiting).toBe(false);
    expect(state.caches.filter(k => k.startsWith('hello-pwa:'))).toEqual([]);
  } finally { await context.close(); await writeFile(cssPath, original); }
});

test('an incomplete update preserves v1; a verified update waits for the user and then works offline', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(address);
    await expect(page.locator('#offline')).toHaveText('Klart för offline');
    await expect(page.locator('.version')).toHaveText(`v${initialVersion}`);
    build(nextVersion(1));
    await writeFile(cssPath, 'broken-update');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration.update();
      const worker = registration.installing;
      if (!worker || worker.state === 'redundant') return;
      await new Promise<void>(resolve => worker.addEventListener('statechange', () => { if (worker.state === 'redundant') resolve(); }));
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.version')).toHaveText(`v${initialVersion}`);
    await expect(page.locator('#offline')).toHaveText('Klart för offline');
    await context.setOffline(false);
    build(nextVersion(2));
    await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    await expect(page.getByRole('button', { name: 'Installera uppdatering', exact: true })).toBeVisible();
    await expect(page.locator('.version')).toHaveText(`v${initialVersion}`);
    await page.getByRole('button', { name: 'Installera uppdatering', exact: true }).click();
    await expect(page.locator('.version')).toHaveText(`v${nextVersion(2)}`);
    await expect(page.locator('#offline')).toHaveText('Klart för offline');
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.version')).toHaveText(`v${nextVersion(2)}`);
    await expect(page.locator('#offline')).toHaveText('Klart för offline');
  } finally { await context.close(); build(); }
});

test('removed cached files clear readiness and can be repaired while online', async ({ page }) => {
  await page.goto(address);
  await expect(page.locator('#offline')).toHaveText('Klart för offline');
  await page.evaluate(async () => {
    const name = (await caches.keys()).find(k => k.startsWith('hello-pwa:'))!;
    await (await caches.open(name)).delete(new URL('./style.css', location.href).href);
  });
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Kontrollera offlinepaket', exact: true }).click();
  await expect(page.locator('#offline')).toHaveText('Inte klart för offline');
  await page.context().setOffline(false);
  await page.getByRole('button', { name: 'Kontrollera offlinepaket', exact: true }).click();
  await expect(page.locator('#offline')).toHaveText('Klart för offline');
});
