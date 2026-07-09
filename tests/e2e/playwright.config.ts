import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8765',
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/report' }],
  ],
  // Bring up the docs server before tests run
  webServer: {
    command: 'python3 -m http.server 8765 --directory docs',
    url: 'http://localhost:8765',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
