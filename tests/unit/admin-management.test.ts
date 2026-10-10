import { describe, expect, it } from 'vitest';
import { deriveStaffInitials } from '@/src/domain/staff';
import { adminAccountCreateSchema, adminAccountUpdateSchema, adminAttendanceSchema, adminCustomerCreateSchema, adminServiceCreateSchema, adminSkillCreateSchema, adminStaffCreateSchema } from '@/src/server/validation';

describe('admin management contracts', () => {
  it('rejects invalid customer and staff records', () => {
    expect(adminCustomerCreateSchema.safeParse({ name: 'A', phone: '123' }).success).toBe(false);
    expect(adminStaffCreateSchema.safeParse({ name: 'Test User', pin: '12', skillIds: ['skill-id'] }).success).toBe(false);
  });

  it('derives staff initials from the name', () => {
    expect(adminStaffCreateSchema.safeParse({ name: 'Test User', pin: '1234', skillIds: ['skill-id'] }).success).toBe(true);
    expect(deriveStaffInitials('Anna')).toBe('AN');
    expect(deriveStaffInitials('Test User')).toBe('TU');
  });

  it('accepts valid service and attendance commands', () => {
    const parsedService = adminServiceCreateSchema.safeParse({ name: 'Express set', durationMin: 30, price: 25, skillIds: ['skill-id', 'second-skill-id'] });
    expect(parsedService.success).toBe(true);
    if (parsedService.success) expect(parsedService.data.iconKey).toBe('sparkles');
    expect(adminServiceCreateSchema.safeParse({ name: 'Express set', iconKey: 'not-an-icon', durationMin: 30, price: 25, skillIds: ['skill-id'] }).success).toBe(false);
    expect(adminServiceCreateSchema.safeParse({ name: 'Express set', durationMin: 30, price: 25, skillIds: [] }).success).toBe(false);
    expect(adminAttendanceSchema.safeParse({ staffId: 'staff-id', action: 'CHECK_IN', idempotencyKey: 'attendance-test-key' }).success).toBe(true);
  });

  it('validates skill and account management records', () => {
    expect(adminSkillCreateSchema.safeParse({ name: 'Gel technique' }).success).toBe(true);
    expect(adminSkillCreateSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(adminAccountCreateSchema.safeParse({ email: 'Station@shop.test', password: 'strong-pass-123', role: 'STATION' }).success).toBe(true);
    expect(adminAccountCreateSchema.safeParse({ email: 'invalid', password: 'short', role: 'STATION' }).success).toBe(false);
    expect(adminAccountUpdateSchema.safeParse({ id: 'account-id', email: 'admin@shop.test', password: '', role: 'ADMIN', isActive: true }).success).toBe(true);
  });
});
