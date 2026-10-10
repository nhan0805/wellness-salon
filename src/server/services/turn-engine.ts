import { Prisma } from '@prisma/client';
import { getEligibleStaff, selectFairStaff } from '@/src/domain/turn-routing';
import type { StaffCandidate } from '@/src/domain/types';

export function advisoryLockKey(businessDate: string) {
  return `nail-shop:default:${businessDate}`;
}

/**
 * The database implementation calls this at the start of the same transaction that
 * reads eligibility and writes the new turn. A transaction-scoped advisory lock is
 * intentional: row locks cannot see a competing INSERT of an assignment row.
 */
export async function lockShopBusinessDate(tx: { $executeRaw: (query: Prisma.Sql) => Promise<unknown> }, businessDate: string) {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${advisoryLockKey(businessDate)}, 0))`);
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
