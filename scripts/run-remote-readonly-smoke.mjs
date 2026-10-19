import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';

const DEFAULT_BASE_URL = 'https://wellness.n8l.workers.dev';
const DEFAULT_TIMEOUT_MS = 15_000;

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadDotEnv();

const baseUrl = new URL(process.env.REMOTE_SMOKE_BASE_URL ?? DEFAULT_BASE_URL);
const timeoutMs = Number(process.env.REMOTE_SMOKE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
const checks = [];

function endpoint(path) {
  return new URL(path, baseUrl).toString();
}

function record(name, status, durationMs, detail = '') {
  checks.push({ name, status, durationMs, detail });
}

async function fetchText(name, path, init = {}, expectedStatuses = [200]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint(path), {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...init.headers,
      },
    });
    const body = await response.text();
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const passed = expectedStatuses.includes(response.status);
    record(name, passed ? 'PASS' : 'FAIL', durationMs, `${response.status}`);
    return { response, body, durationMs };
  } catch (error) {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    record(name, 'FAIL', durationMs, error instanceof Error ? error.message : 'request failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSseSnapshot() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint('/api/sse/board'), {
      signal: controller.signal,
      headers: { accept: 'text/event-stream' },
    });
    const reader = response.body?.getReader();
    const firstChunk = reader ? await reader.read() : { done: true, value: undefined };
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const contentType = response.headers.get('content-type') ?? '';
    const passed = response.status === 200 && contentType.includes('text/event-stream') && Boolean(firstChunk.value?.length);
    record('public board SSE initial snapshot', passed ? 'PASS' : 'FAIL', durationMs, `${response.status}`);
    await reader?.cancel();
  } catch (error) {
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    record('public board SSE initial snapshot', 'FAIL', durationMs, error instanceof Error ? error.message : 'request failed');
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

async function runAuthenticatedReadSmoke() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    record('authenticated admin read smoke', 'SKIP', 0, 'ADMIN_EMAIL/ADMIN_PASSWORD not provided');
    return;
  }

  const login = await fetchText(
    'admin login (session smoke only)',
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl.origin },
      body: JSON.stringify({ email, password }),
    },
    [200],
  );
  if (!login || login.response.status !== 200) return;
  const cookie = cookieHeader(login.response);
  if (!cookie) {
    record('admin session cookie', 'FAIL', 0, 'missing session cookie');
    return;
  }

  const session = await fetchText('admin session revalidation', '/api/auth/session', { headers: { cookie } }, [200]);
  if (!session || session.response.status !== 200) return;

  const readOnlyChecks = [
    ['admin dashboard live/config', '/api/admin/dashboard?include=live,config'],
    ['admin config', '/api/admin/config'],
    ['admin services', '/api/admin/services'],
    ['admin service categories', '/api/admin/service-categories'],
    ['admin skills', '/api/admin/skills'],
    ['admin accounts', '/api/admin/accounts'],
    ['admin staff', '/api/admin/staff'],
    ['admin attendance', '/api/admin/attendance'],
    ['admin customers', '/api/admin/customers'],
    ['admin appointments first page', '/api/admin/appointments?page=1&pageSize=1'],
    ['admin reports current day', '/api/admin/reports'],
  ];
  for (const [name, path] of readOnlyChecks) {
    await fetchText(name, path, { headers: { cookie } }, [200]);
  }

  await fetchText(
    'admin logout',
    '/api/auth/logout',
    { method: 'POST', headers: { cookie, origin: baseUrl.origin, 'content-type': 'application/json' }, body: '{}' },
    [200],
  );
}

await fetchText('health', '/api/health');
await fetchText('public service catalog', '/api/services');
await fetchText('public board snapshot', '/api/board');
await fetchText('public kiosk page', '/kiosk', {}, [200]);
await fetchSseSnapshot();
await runAuthenticatedReadSmoke();

for (const check of checks) {
  console.log(`${check.status.padEnd(5)} ${check.name} (${check.detail || 'no detail'}, ${check.durationMs}ms)`);
}

const failures = checks.filter((check) => check.status === 'FAIL');
const passes = checks.filter((check) => check.status === 'PASS');
const skipped = checks.filter((check) => check.status === 'SKIP');
console.log(`Remote read-only smoke: ${passes.length} passed, ${failures.length} failed, ${skipped.length} skipped.`);
if (failures.length) process.exitCode = 1;
