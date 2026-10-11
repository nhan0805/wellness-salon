// Disposable authenticated HTTP load profile only. Refuses production/application databases.
import 'dotenv/config';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';
import { Prisma } from '@prisma/client';
import { prisma } from '@/src/server/db';

const baseUrl = process.env.HTTP_LOAD_PROFILE_BASE_URL ?? 'http://127.0.0.1:3102';
const clients = Math.max(1, Number(process.env.HTTP_LOAD_PROFILE_CLIENTS ?? 3));
const cycles = Math.max(1, Number(process.env.HTTP_LOAD_PROFILE_CYCLES ?? 10));
const runId = `http-load-profile-${Date.now()}`;
const measurements = new Map<string, number[]>();
const statusCounts = new Map<string, number>();
const createdPhones: string[] = [];
let errorCount = 0;
let maxDbConnections = 0;
let maxActiveDbConnections = 0;

function assertSafeTarget() {
  if (process.env.HTTP_LOAD_PROFILE_ALLOW_DISPOSABLE !== 'true') {
    throw new Error('Refusing to run HTTP load profile. Set HTTP_LOAD_PROFILE_ALLOW_DISPOSABLE=true explicitly.');
  }

  const target = new URL(baseUrl);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const database = new URL(databaseUrl);
  const localHost = ['127.0.0.1', 'localhost'].includes(target.hostname);
  const localDatabase = ['127.0.0.1', 'localhost'].includes(database.hostname);
  const disposableDatabase = ['55432', '55433'].includes(database.port);
  const allowedAppPort = ['3100', '3101', '3102'].includes(target.port);
  if (!localHost || !allowedAppPort || !localDatabase || !disposableDatabase) {
    throw new Error('Refusing to run HTTP load profile. Use a local app on port 3100–3102 and disposable PostgreSQL on port 55432 or 55433.');
  }
}

function percentile(values: number[], point: number) {
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * point) - 1));
  return Number(values[index].toFixed(2));
}

function recordStatus(label: string, status: number) {
  const key = `${label}:${status}`;
  statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
}

async function measure(label: string, operation: () => Promise<void>) {
  const startedAt = performance.now();
  try {
    await operation();
    const values = measurements.get(label) ?? [];
    values.push(performance.now() - startedAt);
    measurements.set(label, values);
  } catch (error) {
    errorCount += 1;
    console.error(JSON.stringify({ event: 'http.load.profile.operation_failed', label, error: error instanceof Error ? error.message : 'Unknown error' }));
  }
}

async function expectStatus(label: string, response: { status: () => number; json: () => Promise<unknown> }, accepted: number[]) {
  const status = response.status();
  recordStatus(label, status);
  if (!accepted.includes(status)) throw new Error(`${label} returned HTTP ${status}`);
  await response.json().catch(() => null);
}

async function sampleDatabaseActivity() {
  const rows = await prisma.$queryRaw<Array<{ total: number; active: number }>>(Prisma.sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE state = 'active')::int AS active
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  const sample = rows[0];
  if (!sample) return;
  maxDbConnections = Math.max(maxDbConnections, Number(sample.total));
  maxActiveDbConnections = Math.max(maxActiveDbConnections, Number(sample.active));
}

function operationSummary() {
  return Object.fromEntries([...measurements.entries()].map(([label, values]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return [label, {
      count: sorted.length,
      minMs: Number(sorted[0].toFixed(2)),
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      p99Ms: percentile(sorted, 0.99),
      maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    }];
  }));
}

async function main() {
  assertSafeTarget();
  if (clients !== 3) throw new Error('This profile models exactly three shared tablet roles; set HTTP_LOAD_PROFILE_CLIENTS=3.');
  if (!Number.isInteger(cycles) || cycles < 1) throw new Error('HTTP_LOAD_PROFILE_CYCLES must be a positive integer.');
  const adminEmail = process.env.HTTP_LOAD_PROFILE_ADMIN_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
  const adminPassword = process.env.HTTP_LOAD_PROFILE_ADMIN_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error('Set HTTP_LOAD_PROFILE_ADMIN_EMAIL/HTTP_LOAD_PROFILE_ADMIN_PASSWORD or the E2E/seed admin credentials.');

  const serviceResponse = await fetch(new URL('/api/services', baseUrl), { headers: { origin: baseUrl } });
  if (!serviceResponse.ok) throw new Error(`/api/services returned HTTP ${serviceResponse.status}`);
  const servicePayload = await serviceResponse.json() as { services?: Array<{ id: string }> };
  const serviceId = servicePayload.services?.[0]?.id;
  if (!serviceId) throw new Error('No active service is available for the load profile.');

  const chromePath = process.env.PLAYWRIGHT_CHROME_PATH ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
  const browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
  const adminContext = await browser.newContext({ baseURL: baseUrl });
  const boardContext = await browser.newContext({ baseURL: baseUrl });
  const kioskContext = await browser.newContext({ baseURL: baseUrl });
  const adminPage = await adminContext.newPage();
  const adminRequest = adminPage.request;
  const boardPage = await boardContext.newPage();
  const boardRequest = boardPage.request;
  const kioskPage = await kioskContext.newPage();
  const kioskRequest = kioskPage.request;
  const originHeaders = { origin: baseUrl };

  try {
    await adminPage.goto('/admin/sign-in', { waitUntil: 'domcontentloaded' });
    await adminPage.getByLabel('Email').fill(adminEmail);
    await adminPage.getByLabel('Password').fill(adminPassword);
    await adminPage.getByRole('button', { name: 'Continue', exact: true }).click();
    await adminPage.waitForURL(/\/admin(?:$|[?#])/, { timeout: 30_000 });

    console.log(JSON.stringify({ httpLoadProfile: true, mode: 'authenticated-http', baseUrl, clients, cycles, runId }));
    const startedAt = performance.now();

    await Promise.all([
      (async () => {
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          await Promise.all([
            measure('management.appointments.read', async () => expectStatus('management.appointments.read', await adminRequest.get('/api/admin/appointments?page=1&pageSize=25', { headers: originHeaders }), [200])),
            measure('management.report.read', async () => expectStatus('management.report.read', await adminRequest.get('/api/admin/reports', { headers: originHeaders }), [200])),
            measure('management.config.read', async () => expectStatus('management.config.read', await adminRequest.get('/api/admin/config', { headers: originHeaders }), [200])),
          ]);
          await sampleDatabaseActivity();
        }
      })(),
      (async () => {
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          await measure('turn-display.board.read', async () => expectStatus('turn-display.board.read', await boardRequest.get('/api/board', { headers: originHeaders }), [200]));
          await sampleDatabaseActivity();
        }
      })(),
      (async () => {
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          const phone = `+1 415 779 ${String(Date.now()).slice(-5)}${cycle}`;
          createdPhones.push(phone);
          await measure('kiosk.services.read', async () => expectStatus('kiosk.services.read', await kioskRequest.get('/api/services', { headers: originHeaders }), [200]));
          await measure('kiosk.customer-lookup.read', async () => expectStatus('kiosk.customer-lookup.read', await kioskRequest.get(`/api/kiosk/customer-lookup?phone=${encodeURIComponent(phone)}`, { headers: originHeaders }), [200]));
          await measure('kiosk.check-in.write', async () => expectStatus('kiosk.check-in.write', await kioskRequest.post('/api/kiosk/check-in', {
            headers: { ...originHeaders, 'content-type': 'application/json', 'x-request-id': `${runId}-${cycle}` },
            data: { serviceIds: [serviceId], phone, name: `HTTP Load ${cycle}`, idempotencyKey: `${runId}-${cycle}` },
          }), [201]));
          await sampleDatabaseActivity();
        }
      })(),
    ]);

    console.log(JSON.stringify({
      event: 'http.load.profile.completed',
      elapsedMs: Number((performance.now() - startedAt).toFixed(2)),
      errors: errorCount,
      statusCounts: Object.fromEntries(statusCounts),
      databaseActivity: { maxConnections: maxDbConnections, maxActiveConnections: maxActiveDbConnections },
      operations: operationSummary(),
    }));
    if (errorCount > 0) process.exitCode = 1;
  } finally {
    await Promise.all([adminContext.close(), boardContext.close(), kioskContext.close(), browser.close()]);
  }
}

async function cleanup() {
  if (!createdPhones.length) return;
  const customers = await prisma.customer.findMany({ where: { phone: { in: createdPhones } }, select: { id: true } });
  if (customers.length) {
    await prisma.appointment.deleteMany({ where: { customerId: { in: customers.map((customer) => customer.id) } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });
  }
  await prisma.commandReceipt.deleteMany({ where: { key: { startsWith: runId } } });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await cleanup(); } finally { await prisma.$disconnect(); }
});
