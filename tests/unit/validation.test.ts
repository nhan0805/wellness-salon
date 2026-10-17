import { describe, expect, it } from 'vitest';
import { adminServiceCreateSchema, adminShopConfigSchema, checkInSchema, kioskCustomerLookupSchema } from '@/src/server/validation';
import { normalizePhoneNumber } from '@/src/domain/phone';

describe('phone validation', () => {
  it('rejects numbers with fewer than seven digits', () => {
    expect(kioskCustomerLookupSchema.safeParse({ phone: '12345' }).success).toBe(false);
  });

  it('accepts a formatted international phone number', () => {
    expect(kioskCustomerLookupSchema.safeParse({ phone: '+1 415 555 0100' }).success).toBe(true);
  });

  it('uses the same phone rules for check-in submissions', () => {
    expect(checkInSchema.safeParse({ serviceIds: ['service-1'], phone: '12345', name: 'Taylor Morgan' }).success).toBe(false);
  });

  it('requires an idempotency key for every check-in', () => {
    expect(checkInSchema.safeParse({ serviceIds: ['service-1'], phone: '+1 415 555 0100', name: 'Taylor Morgan' }).success).toBe(false);
    expect(checkInSchema.safeParse({ serviceIds: ['service-1'], phone: '+1 415 555 0100', name: 'Taylor Morgan', idempotencyKey: 'kiosk-test-1' }).success).toBe(true);
  });

  it('normalizes equivalent phone formats to one matching key', () => {
    expect(normalizePhoneNumber('+1 (415) 555-0100')).toBe('14155550100');
  });

  it('rejects invalid shop time and timezone configuration', () => {
    const base = { timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00', currency: 'USD', verifiedSessionTtlMin: 3, roundRobinEnabled: true };
    expect(adminShopConfigSchema.safeParse({ ...base, closingTime: '25:00' }).success).toBe(false);
    expect(adminShopConfigSchema.safeParse({ ...base, timezone: 'Not/A_Timezone' }).success).toBe(false);
    expect(adminShopConfigSchema.safeParse({ ...base, openingTime: '22:00', closingTime: '08:00' }).success).toBe(false);
  });

  it('supports a short optional service description', () => {
    const base = { name: 'Gel Manicure', categoryId: 'category-manicure', durationMin: 45, price: 40, skillIds: ['skill-1'] };
    const parsed = adminServiceCreateSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.description).toBe('');
    expect(adminServiceCreateSchema.safeParse({ ...base, description: 'x'.repeat(141) }).success).toBe(false);
  });
});
