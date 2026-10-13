import { describe, expect, it } from 'vitest';
import { configuredTimeToMinutes, isWithinOperatingHours, minutesInTimezone } from '@/src/domain/operating-hours';

describe('operating hours', () => {
  it('parses only valid 24-hour times', () => {
    expect(configuredTimeToMinutes('09:30')).toBe(570);
    expect(configuredTimeToMinutes('24:00')).toBeNull();
    expect(configuredTimeToMinutes('9:30')).toBeNull();
  });

  it('uses the configured timezone when evaluating the open interval', () => {
    const now = new Date('2026-10-12T03:30:00.000Z');
    expect(minutesInTimezone(now, 'Asia/Ho_Chi_Minh')).toBe(10 * 60 + 30);
    expect(isWithinOperatingHours(now, { timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00' })).toBe(true);
    expect(isWithinOperatingHours(new Date('2026-10-12T14:00:00.000Z'), { timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00' })).toBe(false);
  });

  it('keeps the confirmed Vietnam timezone at UTC+7 across seasonal dates', () => {
    expect(minutesInTimezone(new Date('2026-01-15T03:30:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(10 * 60 + 30);
    expect(minutesInTimezone(new Date('2026-07-15T03:30:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe(10 * 60 + 30);
  });

  it('treats the closing time as exclusive', () => {
    expect(isWithinOperatingHours(new Date('2026-10-12T14:00:00.000Z'), { timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00' })).toBe(false);
  });
});
