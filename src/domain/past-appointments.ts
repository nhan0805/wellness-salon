import type { AppointmentStatus } from './types';

export const PAST_UNRESOLVED_STATUSES: AppointmentStatus[] = [
  'CREATED',
  'WAITING',
  'ASSIGNED',
  'IN_SERVICE',
  'PAYMENT_PENDING',
];

export type PastAppointmentResolutionKind =
  | 'UNSERVED'
  | 'ASSIGNMENT_GAP'
  | 'SERVICE_INTERRUPTED'
  | 'PAYMENT_REVIEW';

export type PastAppointmentGuidance = {
  label: string;
  description: string;
  actionLabel: string;
};

export const pastAppointmentGuidance: Record<
  PastAppointmentResolutionKind,
  PastAppointmentGuidance
> = {
  UNSERVED: {
    label: 'Unserved / waiting',
    description: 'No service was started. Verify the guest, then cancel or reconcile.',
    actionLabel: 'Review service',
  },
  ASSIGNMENT_GAP: {
    label: 'Assigned, not started',
    description: 'A specialist was assigned but the turn was never accepted.',
    actionLabel: 'Review assignment',
  },
  SERVICE_INTERRUPTED: {
    label: 'Service interrupted',
    description: 'The service started but has no recorded finish event.',
    actionLabel: 'Review service',
  },
  PAYMENT_REVIEW: {
    label: 'Payment pending',
    description: 'The service is complete; only payment confirmation remains.',
    actionLabel: 'Collect payment',
  },
};

export function isPastUnresolvedStatus(status: string): status is AppointmentStatus {
  return PAST_UNRESOLVED_STATUSES.includes(status as AppointmentStatus);
}

export function classifyPastAppointment(status: string): PastAppointmentResolutionKind {
  if (status === 'PAYMENT_PENDING') return 'PAYMENT_REVIEW';
  if (status === 'IN_SERVICE') return 'SERVICE_INTERRUPTED';
  if (status === 'ASSIGNED') return 'ASSIGNMENT_GAP';
  return 'UNSERVED';
}

export function businessDaysOverdue(pastDate: Date, currentDate: Date) {
  return Math.max(
    1,
    Math.floor((currentDate.getTime() - pastDate.getTime()) / (24 * 60 * 60 * 1000)),
  );
}
