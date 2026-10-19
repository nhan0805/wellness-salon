import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const wrangler = path.join(root, 'node_modules', '.bin', 'wrangler');
const tsx = path.join(root, 'node_modules', '.bin', 'tsx');
const migrationsDir = path.join(root, 'prisma', 'd1', 'migrations');
const work = mkdtempSync(path.join(os.tmpdir(), 'wellness-salon-d1-recovery-'));
const sourceState = path.join(work, 'source', '.wrangler', 'state');
const restoredState = path.join(work, 'restored', '.wrangler', 'state');
const configPath = path.join(work, 'source', 'wrangler.recovery.jsonc');
const bootstrapPath = path.join(work, 'bootstrap.sql');
const exportPath = path.join(work, 'wellness-salon-export.sql');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.trim().split(/\r?\n/).slice(-8).join('\n');
    throw new Error(`${path.basename(command)} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout ?? '';
}

function countRows(statePath, table) {
  const output = run(wrangler, [
    'd1', 'execute', 'wellness-salon', '--local', `--persist-to=${statePath}`,
    `--config=${configPath}`, '--command', `SELECT COUNT(*) AS count FROM ${table};`, '--json',
  ]);
  const parsed = JSON.parse(output);
  return Number(parsed?.[0]?.results?.[0]?.count ?? 0);
}

try {
  mkdirSync(sourceState, { recursive: true });
  mkdirSync(restoredState, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    $schema: './node_modules/wrangler/config-schema.json',
    name: 'wellness-salon-recovery-rehearsal',
    d1_databases: [{
      binding: 'DB',
      database_name: 'wellness-salon',
      database_id: '03e062f4-935f-4297-aa6a-68628ea66e8a',
      migrations_dir: migrationsDir,
    }],
  }, null, 2));

  run(wrangler, [
    'd1', 'migrations', 'apply', 'wellness-salon', '--local', `--persist-to=${sourceState}`,
    `--config=${configPath}`,
  ], { input: 'y\n' });

  const bootstrap = spawnSync(tsx, ['scripts/seed-d1-bootstrap.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      D1_BOOTSTRAP_CONFIRM: 'YES',
      ADMIN_EMAIL: 'recovery-admin@example.invalid',
      ADMIN_PASSWORD: 'recovery-admin-password',
      STATION_EMAIL: 'recovery-station@example.invalid',
      STATION_PASSWORD: 'recovery-station-password',
      STAFF_DEFAULT_PIN: '1234',
      SHOP_TIMEZONE: 'Asia/Ho_Chi_Minh',
      D1_TEST_OPENING_TIME: '00:00',
      D1_TEST_CLOSING_TIME: '23:59',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (bootstrap.error) throw bootstrap.error;
  if (bootstrap.status !== 0) throw new Error('D1 bootstrap generation failed');
  writeFileSync(bootstrapPath, bootstrap.stdout);

  run(wrangler, [
    'd1', 'execute', 'wellness-salon', '--local', `--persist-to=${sourceState}`,
    `--config=${configPath}`, `--file=${bootstrapPath}`, '--yes', '--json',
  ]);

  run(wrangler, [
    'd1', 'export', 'wellness-salon', '--local', `--config=${configPath}`,
    `--output=${exportPath}`,
  ]);

  run(wrangler, [
    'd1', 'execute', 'wellness-salon', '--local', `--persist-to=${restoredState}`,
    `--config=${configPath}`, `--file=${exportPath}`, '--yes', '--json',
  ]);

  const tables = ['services', 'staff', 'auth_users', 'shop_config'];
  const sourceCounts = Object.fromEntries(tables.map((table) => [table, countRows(sourceState, table)]));
  const restoredCounts = Object.fromEntries(tables.map((table) => [table, countRows(restoredState, table)]));
  if (JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts)) {
    throw new Error(`D1 restore count mismatch: ${JSON.stringify({ sourceCounts, restoredCounts })}`);
  }
  console.log(`D1 recovery rehearsal passed: exported and restored ${tables.length} representative tables (${JSON.stringify(sourceCounts)}).`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
