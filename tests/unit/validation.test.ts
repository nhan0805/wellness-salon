import { describe, expect, it } from 'vitest';
import { checkInSchema, kioskCustomerLookupSchema } from '@/src/server/validation';
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

  it('normalizes equivalent phone formats to one matching key', () => {
    expect(normalizePhoneNumber('+1 (415) 555-0100')).toBe('14155550100');
  });
});
