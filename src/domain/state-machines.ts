import type { AppointmentStatus, AttendanceStatus, TurnStatus } from './types';

const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
  CREATED: ['WAITING', 'ASSIGNED'],
  WAITING: ['ASSIGNED'],
  ASSIGNED: ['IN_SERVICE', 'WAITING'],
  IN_SERVICE: ['PAYMENT_PENDING', 'WAITING'],
  PAYMENT_PENDING: ['COMPLETED'],
  COMPLETED: [],
};

const turnTransitions: Record<TurnStatus, TurnStatus[]> = {
  // ACCEPT moves a turn directly into the in-service appointment state. The
  // ACCEPTED turn status remains the active turn marker after that action.
  ASSIGNED: ['ACCEPTED', 'SKIPPED'],
  ACCEPTED: ['FINISHED', 'SKIPPED'],
  SKIPPED: [],
  FINISHED: [],
};

const attendanceTransitions: Record<AttendanceStatus, AttendanceStatus[]> = {
  ABSENT: ['PRESENT'],
  PRESENT: ['CHECKED_OUT'],
  CHECKED_OUT: [],
};

export function canTransitionAppointment(from: AppointmentStatus, to: AppointmentStatus) {
  return transitions[from].includes(to);
}

export function transitionAppointment(from: AppointmentStatus, to: AppointmentStatus): AppointmentStatus {
  if (!canTransitionAppointment(from, to)) throw new Error(`Invalid appointment transition: ${from} -> ${to}`);
  return to;
}

export function transitionTurn(from: TurnStatus, to: TurnStatus): TurnStatus {
  if (!turnTransitions[from].includes(to)) throw new Error(`Invalid turn transition: ${from} -> ${to}`);
  return to;
}

export function transitionAttendance(from: AttendanceStatus, to: AttendanceStatus): AttendanceStatus {
  if (!attendanceTransitions[from].includes(to)) throw new Error(`Invalid attendance transition: ${from} -> ${to}`);
  return to;
}
