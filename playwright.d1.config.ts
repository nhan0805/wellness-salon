import 'dotenv/config';
import { defineConfig, devices } from '@playwright/test';

const localChrome =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : undefined);
const launchOptions = localChrome ? { executablePath: localChrome } : undefined;
const port = process.env.PLAYWRIGHT_PORT ?? '3001';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
const useExistingServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const persistTo = process.env.D1_TEST_PERSIST_TO ?? '.wrangler/d1-test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : process.env.CI ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'tablet', use: { ...devices['iPad (gen 7)'], browserName: 'chromium', launchOptions } },
  ],
  webServer: useExistingServer
    ? undefined
    : {
        // Keep the entrypoint in the Wrangler config so its bundler can resolve
        // the generated vinext module manifest consistently between runs.
        command: `./node_modules/.bin/wrangler dev --local --persist-to="${persistTo}" --config=wrangler.local.jsonc --assets .cloudflare/output/v0/workers/default/assets --ip 127.0.0.1 --port ${port}`,
        url: `http://127.0.0.1:${port}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
