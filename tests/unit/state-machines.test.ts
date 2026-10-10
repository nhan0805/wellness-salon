import { describe, expect, it } from 'vitest';
import { canTransitionAppointment, transitionAppointment, transitionAttendance, transitionTurn } from '@/src/domain/state-machines';

describe('state machines', () => {
  it('allows the happy path and blocks cancellation-by-skip', () => {
    expect(transitionAppointment('WAITING', 'ASSIGNED')).toBe('ASSIGNED');
    expect(transitionAppointment('IN_SERVICE', 'PAYMENT_PENDING')).toBe('PAYMENT_PENDING');
    expect(canTransitionAppointment('WAITING', 'COMPLETED')).toBe(false);
    expect(() => transitionAppointment('WAITING', 'COMPLETED')).toThrow('Invalid appointment transition');
  });

  it('keeps skip on the turn record, not as appointment cancellation', () => {
    expect(transitionTurn('ASSIGNED', 'ACCEPTED')).toBe('ACCEPTED');
    expect(transitionTurn('ACCEPTED', 'FINISHED')).toBe('FINISHED');
    expect(transitionTurn('ASSIGNED', 'SKIPPED')).toBe('SKIPPED');
    expect(transitionTurn('ACCEPTED', 'SKIPPED')).toBe('SKIPPED');
  });

  it('only permits attendance from absent to present to checked out', () => {
    expect(transitionAttendance('ABSENT', 'PRESENT')).toBe('PRESENT');
    expect(transitionAttendance('PRESENT', 'CHECKED_OUT')).toBe('CHECKED_OUT');
    expect(() => transitionAttendance('CHECKED_OUT', 'PRESENT')).toThrow('Invalid attendance transition');
  });
});
