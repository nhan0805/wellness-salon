import { getEligibleStaff, selectFairStaff } from '@/src/domain/turn-routing';
import type { StaffCandidate } from '@/src/domain/types';

/**
 * D1 mutation paths acquire the shared application lease in `src/server/db`.
 * Keep this boundary for the remaining shared service code; it intentionally
 * does not issue database-specific lock SQL.
 */
export async function lockShopBusinessDate(_tx: unknown, _businessDate: string) {
  return;
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
