import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SCHEDULE,
  PRODUCTION_TIMEZONE,
  isValidIanaTimezone,
  scheduledClosingBusinessDate,
  scheduledJobsForTick,
  scheduledJobForTick,
  staticUtcCronForFixedTimezone,
} from '@/src/domain/scheduler';

describe('Cloudflare scheduler mapping', () => {
  it('keeps the confirmed salon schedule aligned to UTC', () => {
    expect(PRODUCTION_SCHEDULE).toMatchObject({
      timezone: 'Asia/Ho_Chi_Minh',
      closingLocalTime: '21:15',
      retentionLocalTime: '03:15',
      closingCron: '*/15 * * * *',
      retentionCron: '*/15 * * * *',
    });
    expect(staticUtcCronForFixedTimezone('21:05', PRODUCTION_TIMEZONE)).toBe('5 14 * * *');
    expect(staticUtcCronForFixedTimezone('03:15', PRODUCTION_TIMEZONE)).toBe('15 20 * * *');
  });

  it('chooses jobs from the live D1 timezone and closing configuration', () => {
    expect(scheduledJobForTick(new Date('2026-10-12T14:15:00.000Z'), PRODUCTION_TIMEZONE, '21:00')).toBe('closing');
    expect(scheduledJobForTick(new Date('2026-10-12T20:15:00.000Z'), PRODUCTION_TIMEZONE, '21:00')).toBe('retention');
    expect(scheduledJobForTick(new Date('2026-10-12T13:15:00.000Z'), PRODUCTION_TIMEZONE, '20:00')).toBe('closing');
    expect(scheduledJobForTick(new Date('2026-10-12T14:15:00.000Z'), PRODUCTION_TIMEZONE, '21:30')).toBeNull();
  });

  it('keeps a near-midnight closing job on the previous business date', () => {
    expect(scheduledClosingBusinessDate(new Date('2026-10-12T17:00:00.000Z'), PRODUCTION_TIMEZONE, '23:41')).toBe('2026-10-12');
    expect(scheduledClosingBusinessDate(new Date('2026-10-12T17:15:00.000Z'), PRODUCTION_TIMEZONE, '23:59')).toBe('2026-10-12');
  });

  it('returns both jobs when a configurable closing tick collides with retention', () => {
    expect(scheduledJobsForTick(new Date('2026-10-12T20:15:00.000Z'), PRODUCTION_TIMEZONE, '03:10')).toEqual(['closing', 'retention']);
  });

  it('accepts valid IANA zones and rejects invalid values', () => {
    expect(isValidIanaTimezone('Asia/Ho_Chi_Minh')).toBe(true);
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('Not/A_Timezone')).toBe(false);
  });

  it('refuses one static schedule for a DST-observing timezone', () => {
    expect(() => staticUtcCronForFixedTimezone('21:05', 'America/New_York')).toThrow(/seasonal UTC offsets/);
  });

  it('rejects malformed local schedule times', () => {
    expect(() => staticUtcCronForFixedTimezone('9:05', PRODUCTION_TIMEZONE)).toThrow(/Invalid local schedule time/);
    expect(() => staticUtcCronForFixedTimezone('24:00', PRODUCTION_TIMEZONE)).toThrow(/Invalid local schedule time/);
  });
});
