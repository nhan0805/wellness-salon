import { describe, expect, it } from 'vitest';
import { verifiedStaffSessionExpiry } from '@/src/server/services/prisma-operations';

describe('verified staff session duration', () => {
  it('uses the configured number of minutes exactly', () => {
    const now = new Date('2026-10-10T12:00:00.000Z');
    expect(verifiedStaffSessionExpiry(now, 1)).toEqual(new Date('2026-10-10T12:01:00.000Z'));
    expect(verifiedStaffSessionExpiry(now, 15)).toEqual(new Date('2026-10-10T12:15:00.000Z'));
  });
});
