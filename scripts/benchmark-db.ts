import { performance } from 'node:perf_hooks';
import { prisma } from '@/src/server/db';
import { currentDbBusinessDate, getDbAppointmentsFiltered, getDbBoardState, getDbMonthlyReport, getDbReport } from '@/src/server/services/prisma-operations';

const iterations = Math.max(3, Number(process.env.BENCHMARK_ITERATIONS ?? 20));
const warmup = Math.max(0, Number(process.env.BENCHMARK_WARMUP ?? 2));

function percentile(values: number[], point: number) {
  const index = Math.min(values.length - 1, Math.floor(values.length * point));
  return Number(values[index].toFixed(2));
}

async function sample(label: string, operation: () => Promise<unknown>) {
  for (let index = 0; index < warmup; index += 1) await operation();
  const durations: number[] = [];
  let lastResult: unknown;
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    lastResult = await operation();
    durations.push(performance.now() - startedAt);
  }
  durations.sort((left, right) => left - right);
  const payloadBytes = Buffer.byteLength(JSON.stringify(lastResult) ?? '', 'utf8');
  console.log(JSON.stringify({
    label,
    iterations,
    payloadBytes,
    minMs: Number(durations[0].toFixed(2)),
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    maxMs: Number(durations[durations.length - 1].toFixed(2)),
  }));
}

async function main() {
  const businessDate = await currentDbBusinessDate();
  const nextDate = new Date(businessDate.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth(), 1));

  console.log(JSON.stringify({ databaseBenchmark: true, businessDate: businessDate.toISOString().slice(0, 10), iterations, warmup }));
  await sample('board.private', () => getDbBoardState({ publicView: false }));
  await sample('appointments.filtered', () => getDbAppointmentsFiltered({ start: businessDate, end: nextDate }));
  await sample('report.day', () => getDbReport(businessDate));
  await sample('report.month', () => getDbMonthlyReport(monthStart));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
