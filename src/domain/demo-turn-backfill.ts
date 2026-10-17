import type { AppointmentStatus, TurnStatus } from '@/src/domain/types';

export type DemoTurnEventType =
  | 'WAITING'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'SKIPPED'
  | 'FINISHED'
  | 'CANCELLED';

export type LegacyDemoTurnPlanInput = {
  appointmentStatus: AppointmentStatus;
  serviceStatus: AppointmentStatus;
  assignedStaffId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
};

export type LegacyDemoTurnPlan = {
  status: TurnStatus;
  eventType: DemoTurnEventType;
  assignedStaffId: string | null;
  reason: string;
  createdAt: Date;
  endedAt: Date | null;
};

const BACKFILL_REASON = 'Legacy demo turn backfill';

function endedAtAfterCreatedAt(createdAt: Date, endedAt: Date) {
  return endedAt.getTime() >= createdAt.getTime() ? endedAt : createdAt;
}

/**
 * Build a deterministic turn for a legacy demo service that was created
 * without routing history. This deliberately does not invent a multi-turn
 * history: it creates the smallest state that matches the service's current
 * status and records the repair reason on the turn/event.
 */
export function planLegacyDemoTurn(input: LegacyDemoTurnPlanInput): LegacyDemoTurnPlan {
  const assignedStaffId = input.assignedStaffId;
  const isCompletedService =
    input.serviceStatus === 'COMPLETED' || input.serviceStatus === 'PAYMENT_PENDING';
  if (isCompletedService && assignedStaffId && input.completedAt) {
    return {
      status: 'FINISHED',
      eventType: 'FINISHED',
      assignedStaffId,
      reason: BACKFILL_REASON,
      createdAt: input.createdAt,
      endedAt: endedAtAfterCreatedAt(input.createdAt, input.completedAt),
    };
  }

  const isCancelledService =
    input.serviceStatus === 'CANCELLED' || input.appointmentStatus === 'CANCELLED';
  if (isCancelledService) {
    const endedAt = input.cancelledAt ?? input.createdAt;
    return {
      status: 'SKIPPED',
      eventType: 'CANCELLED',
      assignedStaffId,
      reason: `${BACKFILL_REASON}: cancelled record`,
      createdAt: input.createdAt,
      endedAt: endedAtAfterCreatedAt(input.createdAt, endedAt),
    };
  }

  if (isCompletedService) {
    return {
      status: 'SKIPPED',
      eventType: 'SKIPPED',
      assignedStaffId,
      reason: `${BACKFILL_REASON}: missing completion evidence`,
      createdAt: input.createdAt,
      endedAt: input.createdAt,
    };
  }

  if (input.serviceStatus === 'IN_SERVICE' || input.appointmentStatus === 'IN_SERVICE') {
    return {
      status: assignedStaffId ? 'ACCEPTED' : 'ASSIGNED',
      eventType: assignedStaffId ? 'ACCEPTED' : 'WAITING',
      assignedStaffId,
      reason: assignedStaffId
        ? BACKFILL_REASON
        : `${BACKFILL_REASON}: waiting for specialist`,
      createdAt: input.createdAt,
      endedAt: null,
    };
  }

  return {
    status: 'ASSIGNED',
    eventType: assignedStaffId ? 'ASSIGNED' : 'WAITING',
    assignedStaffId,
    reason: assignedStaffId
      ? BACKFILL_REASON
      : `${BACKFILL_REASON}: waiting for specialist`,
    createdAt: input.createdAt,
    endedAt: null,
  };
}
