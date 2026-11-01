import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure', screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 1000 } },
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174', reuseExistingServer: false,
      env: { VITE_PARTYKIT_HOST: '127.0.0.1:1998' } },
    { command: 'npm run party:dev -- --port 1998', url: 'http://127.0.0.1:1998/parties/game/health',
      reuseExistingServer: false, timeout: 120000 },
  ],
});
