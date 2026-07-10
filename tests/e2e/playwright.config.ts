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
  // Serve docs/ using a pure-Node static server (no Python dependency)
  webServer: {
    command: 'node server.js',
    url: 'http://localhost:8765',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
