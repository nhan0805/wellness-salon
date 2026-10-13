import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
const playwright = path.join(root, 'node_modules', '.bin', 'playwright');
const persistTo = process.env.D1_TEST_PERSIST_TO?.trim() || mkdtempSync(path.join(os.tmpdir(), 'wellness-salon-d1-'));
const bootstrapPath = path.join(persistTo, 'bootstrap.sql');

mkdirSync(persistTo, { recursive: true });

const testCredentials = {
  ADMIN_EMAIL: process.env.D1_TEST_ADMIN_EMAIL ?? 'd1-admin@ci.invalid',
  ADMIN_PASSWORD: process.env.D1_TEST_ADMIN_PASSWORD ?? 'd1-ci-admin-password',
  STATION_EMAIL: process.env.D1_TEST_STATION_EMAIL ?? 'd1-station@ci.invalid',
  STATION_PASSWORD: process.env.D1_TEST_STATION_PASSWORD ?? 'd1-ci-station-password',
  STAFF_DEFAULT_PIN: process.env.D1_TEST_STAFF_PIN ?? '1234',
  SHOP_TIMEZONE: process.env.D1_TEST_TIMEZONE ?? 'Asia/Ho_Chi_Minh',
};

const env = {
  ...process.env,
  ...testCredentials,
  D1_BOOTSTRAP_CONFIRM: 'YES',
  D1_TEST_PERSIST_TO: persistTo,
  E2E_ADMIN_EMAIL: testCredentials.ADMIN_EMAIL,
  E2E_ADMIN_PASSWORD: testCredentials.ADMIN_PASSWORD,
  E2E_STATION_EMAIL: testCredentials.STATION_EMAIL,
  E2E_STATION_PASSWORD: testCredentials.STATION_PASSWORD,
  PLAYWRIGHT_PORT: process.env.PLAYWRIGHT_PORT ?? '3001',
  PLAYWRIGHT_WORKERS: '1',
};

function run(command, args, options = {}) {
  const { input, ...spawnOptions } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input,
    ...spawnOptions,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 1}`);
  }
}

try {
  run(wrangler, [
    'd1',
    'migrations',
    'apply',
    'wellness-salon',
    '--local',
    `--persist-to=${persistTo}`,
    '--config=wrangler.local.jsonc',
  ], { input: 'y\n' });

  const seed = spawnSync(tsx, ['scripts/seed-d1-bootstrap.ts'], {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (seed.error) throw seed.error;
  if (seed.status !== 0) {
    throw new Error(`${tsx} scripts/seed-d1-bootstrap.ts exited with status ${seed.status ?? 1}`);
  }
  writeFileSync(bootstrapPath, seed.stdout);

  run(wrangler, [
    'd1',
    'execute',
    'wellness-salon',
    '--local',
    `--persist-to=${persistTo}`,
    '--config=wrangler.local.jsonc',
    `--file=${bootstrapPath}`,
  ]);

  run(playwright, ['test', '--config=playwright.d1.config.ts']);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (!process.env.KEEP_D1_TEST_STATE && !process.env.D1_TEST_PERSIST_TO) {
    rmSync(persistTo, { recursive: true, force: true });
  }
}
