import { describe, expect, it } from 'vitest';
import { isAppointmentPaymentReady } from '@/src/domain/payment-readiness';

const completed = {
  status: 'COMPLETED',
  primaryStaffId: 'staff-anna',
  completedAt: '2026-10-15T10:00:00.000Z',
};

describe('appointment payment readiness', () => {
  it('requires a completed, assigned service before payment', () => {
    expect(
      isAppointmentPaymentReady({ status: 'PAYMENT_PENDING', services: [completed] }),
    ).toBe(true);
    expect(
      isAppointmentPaymentReady({
        status: 'PAYMENT_PENDING',
        services: [{ status: 'PAYMENT_PENDING', primaryStaffId: null, completedAt: null }],
      }),
    ).toBe(false);
    expect(
      isAppointmentPaymentReady({
        status: 'PAYMENT_PENDING',
        services: [{ ...completed, primaryStaffId: null }],
      }),
    ).toBe(false);
  });

  it('allows cancelled add-ons but never unfinished services', () => {
    expect(
      isAppointmentPaymentReady({
        status: 'PAYMENT_PENDING',
        services: [completed, { status: 'CANCELLED' }],
      }),
    ).toBe(true);
    expect(
      isAppointmentPaymentReady({
        status: 'PAYMENT_PENDING',
        services: [completed, { status: 'ASSIGNED', primaryStaffId: 'staff-linda' }],
      }),
    ).toBe(false);
    expect(isAppointmentPaymentReady({ status: 'IN_SERVICE', services: [completed] })).toBe(false);
  });
});
