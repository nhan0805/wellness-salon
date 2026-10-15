import { describe, expect, it } from 'vitest';
import {
  businessDaysOverdue,
  classifyPastAppointment,
  isPastUnresolvedStatus,
} from '@/src/domain/past-appointments';
import { adminPastAppointmentResolutionSchema } from '@/src/server/validation';

describe('past appointment reconciliation', () => {
  it('classifies historical open states into manager review buckets', () => {
    expect(classifyPastAppointment('CREATED')).toBe('UNSERVED');
    expect(classifyPastAppointment('WAITING')).toBe('UNSERVED');
    expect(classifyPastAppointment('ASSIGNED')).toBe('ASSIGNMENT_GAP');
    expect(classifyPastAppointment('IN_SERVICE')).toBe('SERVICE_INTERRUPTED');
    expect(classifyPastAppointment('PAYMENT_PENDING')).toBe('PAYMENT_REVIEW');
    expect(isPastUnresolvedStatus('COMPLETED')).toBe(false);
  });

  it('counts at least one overdue day for every previous business date', () => {
    const current = new Date('2026-10-14T00:00:00.000Z');
    expect(businessDaysOverdue(new Date('2026-10-13T00:00:00.000Z'), current)).toBe(1);
    expect(businessDaysOverdue(new Date('2026-10-10T00:00:00.000Z'), current)).toBe(4);
  });

  it('requires a specialist only when a manager marks service completed', () => {
    const common = {
      appointmentId: 'appointment-1',
      reason: 'Guest confirmed the visit was not served',
      idempotencyKey: 'past-resolution-1',
    };
    expect(
      adminPastAppointmentResolutionSchema.safeParse({
        ...common,
        action: 'CANCEL_UNSERVED',
      }).success,
    ).toBe(true);
    expect(
      adminPastAppointmentResolutionSchema.safeParse({
        ...common,
        action: 'MARK_COMPLETED',
      }).success,
    ).toBe(false);
    expect(
      adminPastAppointmentResolutionSchema.safeParse({
        ...common,
        action: 'MARK_COMPLETED',
        staffId: 'staff-1',
      }).success,
    ).toBe(true);
  });
});
