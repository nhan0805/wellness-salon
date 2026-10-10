import { describe, expect, it } from 'vitest';
import { AppointmentStatus } from '@prisma/client';
import { getAppointmentClosingBlocker } from '@/src/server/services/prisma-operations';

const base = {
  appointmentId: 'appointment-1',
  code: 'A001',
  customerName: 'Test guest',
  amount: 20,
};

describe('shift closing rule', () => {
  it('allows only paid completed appointments and cancelled visits', () => {
    expect(getAppointmentClosingBlocker({ ...base, status: AppointmentStatus.COMPLETED, hasPayment: true, unfinishedServiceCount: 0 })).toBeNull();
    expect(getAppointmentClosingBlocker({ ...base, status: AppointmentStatus.CANCELLED, hasPayment: false, unfinishedServiceCount: 0 })).toBeNull();
  });

  it('blocks payment-pending and unpaid completed appointments', () => {
    expect(getAppointmentClosingBlocker({ ...base, status: AppointmentStatus.PAYMENT_PENDING, hasPayment: false, unfinishedServiceCount: 0 })).toMatchObject({ reason: 'PAYMENT_REQUIRED' });
    expect(getAppointmentClosingBlocker({ ...base, status: AppointmentStatus.COMPLETED, hasPayment: false, unfinishedServiceCount: 0 })).toMatchObject({ reason: 'PAYMENT_REQUIRED' });
  });

  it('blocks unserved appointments until they are completed or cancelled', () => {
    expect(getAppointmentClosingBlocker({ ...base, status: AppointmentStatus.WAITING, hasPayment: false, unfinishedServiceCount: 1 })).toMatchObject({ reason: 'APPOINTMENT_NOT_RESOLVED' });
    expect(getAppointmentClosingBlocker({ ...base, status: AppointmentStatus.IN_SERVICE, hasPayment: false, unfinishedServiceCount: 1 })).toMatchObject({ reason: 'APPOINTMENT_NOT_RESOLVED' });
  });
});
