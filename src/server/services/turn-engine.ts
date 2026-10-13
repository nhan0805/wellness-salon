import { Prisma } from '@prisma/client';
import { getEligibleStaff, selectFairStaff } from '@/src/domain/turn-routing';
import type { StaffCandidate } from '@/src/domain/types';
import { isD1Runtime } from '@/src/server/db';
import { logEvent } from '@/src/server/logger';

export function advisoryLockKey(businessDate: string) {
  return `nail-shop:default:${businessDate}`;
}

/**
 * The database implementation calls this at the start of the same transaction that
 * reads eligibility and writes the new turn. A transaction-scoped advisory lock is
 * intentional: row locks cannot see a competing INSERT of an assignment row.
 */
export async function lockShopBusinessDate(tx: { $executeRaw: (query: Prisma.Sql) => Promise<unknown> }, businessDate: string) {
  if (await isD1Runtime()) {
    // D1 has no PostgreSQL advisory-lock function. The D1 runtime proxy
    // serializes each application transaction with the __app_locks lease
    // table, so do not send PostgreSQL-specific SQL through the adapter.
    return;
  }
  const startedAt = performance.now();
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${advisoryLockKey(businessDate)}, 0))`);
  const waitMs = Math.round((performance.now() - startedAt) * 100) / 100;
  if (waitMs >= 10) logEvent('warn', 'db.advisory_lock.wait', { businessDate, waitMs });
}

export function chooseStaffForService(staff: StaffCandidate[], requiredSkills: string | string[], excludedStaffIds: string[] = []) {
  return selectFairStaff(getEligibleStaff(staff, requiredSkills, excludedStaffIds));
}

export async function withIdempotency<T>(cache: Map<string, T>, key: string, operation: () => Promise<T>) {
  const existing = cache.get(key);
  if (existing) return existing;
  const result = await operation();
  cache.set(key, result);
  return result;
}
