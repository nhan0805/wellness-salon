import { describe, expect, it } from 'vitest';
import { DEFAULT_SERVICE_ICON_KEY, SERVICE_ICON_KEYS, SERVICE_ICON_OPTIONS } from '@/src/domain/service-icons';

describe('service icon catalog', () => {
  it('exposes 50 unique curated icons', () => {
    expect(SERVICE_ICON_KEYS).toHaveLength(50);
    expect(SERVICE_ICON_OPTIONS).toHaveLength(50);
    expect(new Set(SERVICE_ICON_KEYS).size).toBe(50);
    expect(new Set(SERVICE_ICON_OPTIONS.map((option) => option.key)).size).toBe(50);
  });

  it('uses sparkles as the safe default icon', () => {
    expect(DEFAULT_SERVICE_ICON_KEY).toBe('sparkles');
  });
});
