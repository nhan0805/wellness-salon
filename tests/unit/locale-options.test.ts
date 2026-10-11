import { describe, expect, it } from 'vitest';
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from '@/src/domain/locale-options';

describe('locale option data', () => {
  it('includes the app timezone and the full timezone set', () => {
    expect(TIMEZONE_OPTIONS.map((option) => option.value)).toContain('Asia/Ho_Chi_Minh');
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(400);
    expect(new Set(TIMEZONE_OPTIONS.map((option) => option.value)).size).toBe(TIMEZONE_OPTIONS.length);
  });

  it('includes the full runtime currency set with readable labels', () => {
    expect(CURRENCY_OPTIONS.map((option) => option.value)).toContain('USD');
    expect(CURRENCY_OPTIONS.map((option) => option.value)).toContain('VND');
    expect(CURRENCY_OPTIONS.length).toBeGreaterThan(150);
    expect(CURRENCY_OPTIONS.every((option) => option.label.includes(option.value))).toBe(true);
  });
});
