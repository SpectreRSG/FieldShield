import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const executablePath = existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
  ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  // samples.spec.ts regenerates samples/ — run with: SAMPLES=1 npx playwright test samples --project=desktop
  testIgnore: process.env.SAMPLES ? [] : ['**/samples.spec.ts'],
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    acceptDownloads: true,
    launchOptions: executablePath ? { executablePath } : {}
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 860 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ]
});
