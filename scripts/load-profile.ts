// Disposable load profile only. Refuses application Docker/production database URLs.
import { performance } from 'node:perf_hooks';
import { Availability } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { createDbCheckIn, currentDbBusinessDate, getDbAppointmentsPage, getDbBoardState, getDbReport } from '@/src/server/services/prisma-operations';

const clients = Math.max(1, Number(process.env.LOAD_PROFILE_CLIENTS ?? 3));
const cycles = Math.max(1, Number(process.env.LOAD_PROFILE_CYCLES ?? 10));
const runId = `load-profile-${Date.now()}`;
const measurements = new Map<string, number[]>();
const createdPhones: string[] = [];
let errorCount = 0;

function assertDisposableDatabase() {
  const configuredUrl = process.env.DATABASE_URL;
  if (!configuredUrl) throw new Error('DATABASE_URL is required');
  const databaseUrl = new URL(configuredUrl);
  const isLocalDisposable = ['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) && ['55432', '55433'].includes(databaseUrl.port);
  if (process.env.LOAD_PROFILE_ALLOW_DISPOSABLE !== 'true' || !isLocalDisposable) {
    throw new Error('Refusing to run load profile. Set LOAD_PROFILE_ALLOW_DISPOSABLE=true with a disposable PostgreSQL URL on port 55432 or 55433.');
  }
}

function percentile(values: number[], point: number) {
  const index = Math.min(values.length - 1, Math.floor(values.length * point));
  return Number(values[index].toFixed(2));
}

async function measure(label: string, operation: () => Promise<unknown>) {
  const startedAt = performance.now();
  try {
    await operation();
    const durationMs = performance.now() - startedAt;
    const values = measurements.get(label) ?? [];
    values.push(durationMs);
    measurements.set(label, values);
  } catch (error) {
    errorCount += 1;
    console.error(JSON.stringify({ event: 'load.profile.operation_failed', label, error: error instanceof Error ? error.message : 'Unknown error' }));
  }
}

async function main() {
  assertDisposableDatabase();
  const businessDate = await currentDbBusinessDate();
  const nextDate = new Date(businessDate.getTime() + 24 * 60 * 60 * 1000);
  const service = await prisma.service.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true } });
  const startedAt = performance.now();

  console.log(JSON.stringify({ loadProfile: true, mode: 'service-layer', clients, cycles, businessDate: businessDate.toISOString().slice(0, 10), runId }));
  await Promise.all(Array.from({ length: clients }, async (_, clientIndex) => {
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      await Promise.all([
        measure('board.read', () => getDbBoardState({ publicView: false })),
        measure('history.read', () => getDbAppointmentsPage({ start: businessDate, end: nextDate }, 1, 25)),
        measure('report.read', () => getDbReport(businessDate)),
      ]);
      const phone = `+1 415 777 ${String(Date.now()).slice(-5)}${clientIndex}${cycle}`;
      createdPhones.push(phone);
      await measure('check-in.write', () => createDbCheckIn({ serviceId: service.id, phone, name: `Load Profile ${clientIndex}-${cycle}`, idempotencyKey: `${runId}-${clientIndex}-${cycle}` }));
    }
  }));

  const operations = Object.fromEntries([...measurements.entries()].map(([label, values]) => {
    const sorted = [...values].sort((left, right) => left - right);
    return [label, { count: sorted.length, minMs: Number(sorted[0].toFixed(2)), p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), p99Ms: percentile(sorted, 0.99), maxMs: Number(sorted[sorted.length - 1].toFixed(2)) }];
  }));
  console.log(JSON.stringify({ event: 'load.profile.completed', elapsedMs: Number((performance.now() - startedAt).toFixed(2)), errors: errorCount, operations }));
  if (errorCount > 0) process.exitCode = 1;
}

async function cleanup() {
  if (!createdPhones.length) return;
  const customers = await prisma.customer.findMany({ where: { phone: { in: createdPhones } }, select: { id: true } });
  if (customers.length) {
    await prisma.appointment.deleteMany({ where: { customerId: { in: customers.map((customer) => customer.id) } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });
  }
  await prisma.commandReceipt.deleteMany({ where: { key: { startsWith: runId } } });
  await prisma.staffServiceState.updateMany({ data: { availability: Availability.AVAILABLE } });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try { await cleanup(); } finally { await prisma.$disconnect(); }
});
