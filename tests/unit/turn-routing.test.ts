import { describe, expect, it } from 'vitest';
import { getEligibleStaff, routeAfterSkip, routeNextTurn, selectFairStaff } from '@/src/domain/turn-routing';
import type { StaffCandidate } from '@/src/domain/types';

const staff = (overrides: Partial<StaffCandidate> = {}): StaffCandidate => ({
  id: 'anna', name: 'Anna', initials: 'AN', skills: ['gel'], isActive: true, isPresent: true, availability: 'AVAILABLE', lastServiceFinishedAt: new Date('2026-10-07T08:00:00Z'), lastAssignedAt: new Date('2026-10-07T08:30:00Z'), ...overrides,
});

describe('turn routing', () => {
  it('requires present, skill, and available', () => {
    const eligible = getEligibleStaff([staff(), staff({ id: 'away', isPresent: false }), staff({ id: 'busy', availability: 'BUSY' }), staff({ id: 'wrong', skills: ['pedicure'] })], 'gel');
    expect(eligible.map((member) => member.id)).toEqual(['anna']);
  });

  it('requires every skill configured on a multi-skill service', () => {
    const eligible = getEligibleStaff([
      staff({ id: 'all-skills', skills: ['gel', 'nail-art'] }),
      staff({ id: 'partial-match', skills: ['gel'] }),
      staff({ id: 'not-present', skills: ['gel', 'nail-art'], isPresent: false }),
    ], ['gel', 'nail-art']);
    expect(eligible.map((member) => member.id)).toEqual(['all-skills']);
  });

  it('prefers staff who have never finished a service, then the longest wait', () => {
    const selected = selectFairStaff([staff({ id: 'recent', lastServiceFinishedAt: new Date('2026-10-07T10:00:00Z') }), staff({ id: 'long-wait', lastServiceFinishedAt: new Date('2026-10-07T07:00:00Z') }), staff({ id: 'new', lastServiceFinishedAt: null })]);
    expect(selected?.id).toBe('new');
    expect(selectFairStaff([staff({ id: 'long-wait', lastServiceFinishedAt: new Date('2026-10-07T07:00:00Z') }), staff({ id: 'recent', lastServiceFinishedAt: new Date('2026-10-07T10:00:00Z') })])?.id).toBe('long-wait');
  });

  it('returns waiting when no eligible staff exists', () => {
    expect(routeNextTurn([staff({ isPresent: false })], 'gel')).toEqual({ status: 'WAITING', staff: null });
  });

  it('skips only the current staff and reroutes to another eligible staff member', () => {
    const result = routeAfterSkip([staff({ id: 'anna' }), staff({ id: 'linda', lastServiceFinishedAt: new Date('2026-10-07T06:00:00Z') })], 'gel', 'anna');
    expect(result.status).toBe('ASSIGNED');
    expect(result.staff?.id).toBe('linda');
  });
});
