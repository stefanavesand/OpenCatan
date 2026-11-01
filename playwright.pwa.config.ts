import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/pwa', workers: 1, fullyParallel: false, timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-pwa-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4175', viewport: { width: 820, height: 1180 },
    trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'allow' },
  webServer: { command: 'npm run pwa:build && node scripts/serve-pwa.mjs', url: 'http://127.0.0.1:4175/OpenCatan/hello/', reuseExistingServer: false },
});
