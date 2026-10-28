import {
  ActorType,
  AppointmentStatus,
  Availability,
  AttendanceClosedBy,
  AttendanceStatus,
  Prisma,
  TurnEventType,
  TurnStatus,
} from '@prisma/d1-client';
import { routeNextTurn } from '@/src/domain/turn-routing';
import {
  transitionAppointment,
  transitionAttendance,
  transitionTurn,
} from '@/src/domain/state-machines';
import type {
  AppointmentServiceSnapshot,
  AppointmentSnapshot,
  DailyReport,
  MonthlyReport,
  PaymentMethod,
  ReportTrendPoint,
  ServiceCandidate,
  StaffCandidate,
} from '@/src/domain/types';
import {
  businessDaysOverdue,
  classifyPastAppointment,
  isPastUnresolvedStatus,
  PAST_UNRESOLVED_STATUSES,
  pastAppointmentGuidance,
  type PastAppointmentResolutionKind,
} from '@/src/domain/past-appointments';
import { normalizeServiceIconKey } from '@/src/domain/service-icons';
import { normalizePhoneNumber } from '@/src/domain/phone';
import { moneyFromMinorUnits, toMinorUnits } from '@/src/domain/money';
import { isAppointmentPaymentReady } from '@/src/domain/payment-readiness';
import { planLegacyDemoTurn } from '@/src/domain/demo-turn-backfill';
import { DEFAULT_TIMEZONE } from '@/src/domain/locale-options';
import {
  configuredTimeToMinutes,
  isWithinOperatingHours,
  minutesInTimezone,
} from '@/src/domain/operating-hours';
import {
  getD1Database,
  isD1Runtime,
  prisma,
  withD1Lease,
  withD1PrismaLease,
  withPrismaRuntime,
  type D1DatabaseLike,
  type D1PrismaRuntime,
  type D1Statement,
} from '@/src/server/db';
import { sha256Hex } from '@/src/server/web-crypto';
import { randomId } from '@/src/server/web-crypto';
import { getBuildTimeValue } from '@/src/server/runtime-config';
import { lockShopBusinessDate } from '@/src/server/services/turn-engine';
import {
  hashSecret,
  recordDbPinAttempt,
  assertDbPinNotLocked,
  verifySecret,
} from '@/src/server/security';

const SHOP_TIMEZONE = getBuildTimeValue('SHOP_TIMEZONE', DEFAULT_TIMEZONE) ?? DEFAULT_TIMEZONE;
const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
// Keep each D1 routing command comfortably below the 50-statement batch cap.
// The admin UI repeats the command when more work remains.
const MAX_ROUTING_APPOINTMENTS_PER_BATCH = 1;

export function currentBusinessDate(now = new Date(), timeZone = SHOP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

export async function currentDbBusinessDate(now = new Date(), client?: D1PrismaRuntime) {
  const config = await getDbShopConfig(client);
  return currentBusinessDate(now, config.timezone);
}

export function formatBusinessDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatBusinessMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function currentBusinessMonth(now = new Date()) {
  return formatBusinessMonth(currentBusinessDate(now));
}

export class KioskCheckInClosedError extends Error {
  readonly code = 'KIOSK_CHECK_IN_CLOSED';

  constructor(
    readonly openingTime: string,
    readonly closingTime: string,
    readonly timezone: string,
  ) {
    super(`Check-in is available from ${openingTime} to ${closingTime}.`);
    this.name = 'KioskCheckInClosedError';
  }
}

export type ClosingBlockerReason = 'PAYMENT_REQUIRED' | 'APPOINTMENT_NOT_RESOLVED';

export type ClosingBlocker = {
  appointmentId: string;
  code: string;
  customerName: string;
  status: AppointmentStatus;
  amount: number;
  reason: ClosingBlockerReason;
  message: string;
};

export function getAppointmentClosingBlocker(input: {
  appointmentId: string;
  code: string;
  customerName: string;
  status: AppointmentStatus;
  amount: number;
  hasPayment: boolean;
  unfinishedServiceCount: number;
}): ClosingBlocker | null {
  if (input.status === AppointmentStatus.CANCELLED) return null;
  if (
    input.status === AppointmentStatus.COMPLETED &&
    input.hasPayment &&
    input.unfinishedServiceCount === 0
  )
    return null;

  const requiresPayment =
    input.status === AppointmentStatus.PAYMENT_PENDING ||
    (input.status === AppointmentStatus.COMPLETED && !input.hasPayment);
  return {
    appointmentId: input.appointmentId,
    code: input.code,
    customerName: input.customerName,
    status: input.status,
    amount: input.amount,
    reason: requiresPayment ? 'PAYMENT_REQUIRED' : 'APPOINTMENT_NOT_RESOLVED',
    message: requiresPayment
      ? 'Confirm payment before closing the shift.'
      : 'Complete the service and confirm payment, or cancel the unserved appointment before closing.',
  };
}

export class ShiftClosingBlockedError extends Error {
  readonly code = 'SHIFT_CLOSING_BLOCKED';

  constructor(
    readonly businessDate: string,
    readonly blockers: ClosingBlocker[],
  ) {
    const preview = blockers
      .slice(0, 5)
      .map((blocker) => `${blocker.code} (${blocker.status.replace('_', ' ')})`)
      .join(', ');
    const suffix = blockers.length > 5 ? `, and ${blockers.length - 5} more` : '';
    super(
      `Cannot close shift. ${blockers.length} appointment${blockers.length === 1 ? '' : 's'} still require resolution: ${preview}${suffix}. Confirm payment for served visits or cancel unserved visits first.`,
    );
    this.name = 'ShiftClosingBlockedError';
  }
}

export function verifiedStaffSessionExpiry(now: Date, ttlMinutes: number) {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

export function parseBusinessDate(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return currentBusinessDate();
  const match = BUSINESS_DATE_PATTERN.exec(normalized);
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date;
}

export function parseBusinessMonth(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    const current = currentBusinessDate();
    return new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
  }
  const match = /^(\d{4})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const [, yearText, monthText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function businessMonthRange(monthStart: Date) {
  return {
    start: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1)),
    end: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)),
  };
}

function mapStaff(row: {
  id: string;
  name: string;
  initials: string;
  isActive: boolean;
  skills: Array<{ skill: { name: string } }>;
  attendance: Array<{ status: AttendanceStatus }>;
  serviceState: {
    availability: Availability;
    lastServiceFinishedAt: Date | null;
    lastAssignedAt: Date | null;
  } | null;
  appointments: Array<{ id: string }>;
  serviceAppointments: Array<{ id: string }>;
  supportingAppointments: Array<{ appointmentId: string }>;
}): StaffCandidate {
  const isPresent = row.attendance[0]?.status === AttendanceStatus.PRESENT;
  const hasActiveAssignment =
    row.appointments.length > 0 ||
    row.serviceAppointments.length > 0 ||
    row.supportingAppointments.length > 0;
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    skills: row.skills.map((item) => item.skill.name),
    isActive: row.isActive,
    isPresent,
    availability: isPresent && hasActiveAssignment ? Availability.BUSY : Availability.AVAILABLE,
    lastServiceFinishedAt: row.serviceState?.lastServiceFinishedAt ?? null,
    lastAssignedAt: row.serviceState?.lastAssignedAt ?? null,
  };
}

function mapAppointment(row: {
  id: string;
  code: string;
  customerNameSnapshot: string;
  customer: { name: string; phone: string };
  service: { id: string; name: string; durationMin: number };
  serviceNameSnapshot: string;
  durationMinSnapshot: number;
  amount: Prisma.Decimal;
  status: AppointmentStatus;
  primaryStaffId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  primaryStaff: { id: string; name: string; initials: string } | null;
  turns: Array<{
    id: string;
    appointmentId: string;
    appointmentServiceId: string | null;
    assignedStaffId: string | null;
    status: TurnStatus;
    reason: string | null;
    skipReasonId: string | null;
    skipReasonNameSnapshot: string | null;
    createdAt: Date;
    endedAt: Date | null;
  }>;
  supportingStaff: Array<{ staffId: string }>;
  payment: {
    amount: Prisma.Decimal;
    tip: Prisma.Decimal;
    method: PaymentMethod;
    confirmedAt: Date | null;
  } | null;
  services: Array<{
    id: string;
    serviceId: string;
    sequence: number;
    serviceNameSnapshot: string;
    durationMinSnapshot: number;
    amount: Prisma.Decimal;
    status: AppointmentStatus;
    primaryStaffId: string | null;
    completedAt: Date | null;
    primaryStaff: { id: string; name: string; initials: string } | null;
    turns: Array<{
      id: string;
      appointmentId: string;
      appointmentServiceId: string | null;
      assignedStaffId: string | null;
      status: TurnStatus;
      reason: string | null;
      skipReasonId: string | null;
      skipReasonNameSnapshot: string | null;
      createdAt: Date;
      endedAt: Date | null;
    }>;
    turnExclusions: Array<{
      staffId: string;
      reason: string;
      createdAt: Date;
      staff: { id: string; name: string };
    }>;
  }>;
}): AppointmentSnapshot {
  const serviceSnapshots: AppointmentServiceSnapshot[] = row.services.map((service) => ({
    id: service.id,
    serviceId: service.serviceId,
    sequence: service.sequence,
    serviceName: service.serviceNameSnapshot,
    durationMin: service.durationMinSnapshot,
    amount: Number(service.amount),
    status: service.status,
    primaryStaffId: service.primaryStaffId,
    primaryStaff: service.primaryStaff
      ? {
          id: service.primaryStaff.id,
          name: service.primaryStaff.name,
          initials: service.primaryStaff.initials,
        }
      : null,
    completedAt: service.completedAt,
    turns: service.turns,
    turnExclusions: service.turnExclusions.map((exclusion) => ({
      staffId: exclusion.staffId,
      staffName: exclusion.staff.name,
      reason: exclusion.reason,
      createdAt: exclusion.createdAt,
    })),
  }));
  const currentService =
    serviceSnapshots.find((service) => service.status === AppointmentStatus.IN_SERVICE) ??
    serviceSnapshots.find((service) => service.status === AppointmentStatus.ASSIGNED) ??
    serviceSnapshots.find(
      (service) =>
        service.status === AppointmentStatus.WAITING ||
        service.status === AppointmentStatus.CREATED,
    ) ??
    serviceSnapshots[serviceSnapshots.length - 1];
  return {
    id: row.id,
    code: row.code,
    customerName: row.customerNameSnapshot || row.customer.name,
    phone: row.customer.phone,
    serviceId: currentService?.serviceId ?? row.service.id,
    serviceName: currentService?.serviceName ?? row.serviceNameSnapshot,
    durationMin: currentService?.durationMin ?? row.durationMinSnapshot,
    amount: Number(row.amount),
    status: row.status,
    primaryStaffId: currentService?.primaryStaffId ?? row.primaryStaffId,
    primaryStaff:
      currentService?.primaryStaff ??
      (row.primaryStaff
        ? {
            id: row.primaryStaff.id,
            name: row.primaryStaff.name,
            initials: row.primaryStaff.initials,
          }
        : null),
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    turns: row.turns,
    services: serviceSnapshots,
    supportingStaffIds: row.supportingStaff.map((item) => item.staffId),
    payment: row.payment?.confirmedAt
      ? {
          amount: Number(row.payment.amount),
          tip: Number(row.payment.tip),
          method: row.payment.method,
          confirmedAt: row.payment.confirmedAt,
        }
      : null,
  };
}

const appointmentInclude = {
  customer: true,
  service: true,
  primaryStaff: true,
  turns: { orderBy: { createdAt: 'asc' as const } },
  services: {
    orderBy: { sequence: 'asc' as const },
    include: {
      service: { include: { requiredSkills: { include: { skill: true } } } },
      primaryStaff: true,
      turns: { orderBy: { createdAt: 'asc' as const } },
      turnExclusions: {
        where: { overriddenAt: null },
        orderBy: { createdAt: 'asc' as const },
        include: { staff: { select: { id: true, name: true } } },
      },
    },
  },
  supportingStaff: true,
  payment: true,
};

// The live Dashboard snapshot does not need catalog descriptions, required
// skill graphs, or payment audit fields. Keep this projection narrow because
// it is polled by every shared tablet and refreshes much more often than the
// management screens.
const dashboardAppointmentInclude = {
  customer: { select: { name: true, phone: true } },
  service: { select: { id: true, name: true, durationMin: true } },
  primaryStaff: { select: { id: true, name: true, initials: true } },
  turns: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      appointmentId: true,
      appointmentServiceId: true,
      assignedStaffId: true,
      status: true,
      reason: true,
      skipReasonId: true,
      skipReasonNameSnapshot: true,
      createdAt: true,
      endedAt: true,
    },
  },
  services: {
    orderBy: { sequence: 'asc' as const },
    select: {
      id: true,
      serviceId: true,
      sequence: true,
      serviceNameSnapshot: true,
      durationMinSnapshot: true,
      amount: true,
      status: true,
      primaryStaffId: true,
      completedAt: true,
      primaryStaff: { select: { id: true, name: true, initials: true } },
      turns: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          appointmentId: true,
          appointmentServiceId: true,
          assignedStaffId: true,
          status: true,
          reason: true,
          skipReasonId: true,
          skipReasonNameSnapshot: true,
          createdAt: true,
          endedAt: true,
        },
      },
      turnExclusions: {
        where: { overriddenAt: null },
        orderBy: { createdAt: 'asc' as const },
        select: {
          staffId: true,
          reason: true,
          createdAt: true,
          staff: { select: { id: true, name: true } },
        },
      },
    },
  },
  supportingStaff: { select: { staffId: true } },
  payment: { select: { amount: true, tip: true, method: true, confirmedAt: true } },
};

// The board polls frequently from every shared tablet. Keep both scalar and
// relation projections limited to fields that mapAppointment and the board UI
// actually consume. In particular, an `include` on services would pull every
// appointment-service column back through Prisma's D1 adapter on every board
// bootstrap.
const boardAppointmentSelect = {
  id: true,
  code: true,
  customerNameSnapshot: true,
  serviceNameSnapshot: true,
  durationMinSnapshot: true,
  amount: true,
  status: true,
  primaryStaffId: true,
  createdAt: true,
  completedAt: true,
  customer: { select: { name: true, phone: true } },
  service: { select: { id: true, name: true, durationMin: true } },
  primaryStaff: { select: { id: true, name: true, initials: true } },
  turns: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      appointmentId: true,
      appointmentServiceId: true,
      assignedStaffId: true,
      status: true,
      reason: true,
      skipReasonId: true,
      skipReasonNameSnapshot: true,
      createdAt: true,
      endedAt: true,
    },
  },
  services: {
    orderBy: { sequence: 'asc' as const },
    select: {
      id: true,
      serviceId: true,
      sequence: true,
      serviceNameSnapshot: true,
      durationMinSnapshot: true,
      amount: true,
      status: true,
      primaryStaffId: true,
      completedAt: true,
      primaryStaff: { select: { id: true, name: true, initials: true } },
      turns: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          appointmentId: true,
          appointmentServiceId: true,
          assignedStaffId: true,
          status: true,
          reason: true,
          skipReasonId: true,
          skipReasonNameSnapshot: true,
          createdAt: true,
          endedAt: true,
        },
      },
      turnExclusions: {
        where: { overriddenAt: null },
        orderBy: { createdAt: 'asc' as const },
        select: {
          staffId: true,
          reason: true,
          createdAt: true,
          staff: { select: { id: true, name: true } },
        },
      },
    },
  },
  supportingStaff: { select: { staffId: true } },
  payment: { select: { amount: true, tip: true, method: true, confirmedAt: true } },
} as const;

// Appointment history is paginated and does not need the service catalog's
// skill graph or any write-only fields. Keep this projection aligned with
// mapAppointment so historical periods do not load an unbounded, board-sized
// relation graph into the admin request.
const historyAppointmentInclude = {
  customer: { select: { name: true, phone: true } },
  service: { select: { id: true, name: true, durationMin: true } },
  primaryStaff: { select: { id: true, name: true, initials: true } },
  turns: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      appointmentId: true,
      appointmentServiceId: true,
      assignedStaffId: true,
      status: true,
      reason: true,
      skipReasonId: true,
      skipReasonNameSnapshot: true,
      createdAt: true,
      endedAt: true,
    },
  },
  services: {
    orderBy: { sequence: 'asc' as const },
    select: {
      id: true,
      serviceId: true,
      sequence: true,
      serviceNameSnapshot: true,
      durationMinSnapshot: true,
      amount: true,
      status: true,
      primaryStaffId: true,
      completedAt: true,
      primaryStaff: { select: { id: true, name: true, initials: true } },
      turns: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          appointmentId: true,
          appointmentServiceId: true,
          assignedStaffId: true,
          status: true,
          reason: true,
          skipReasonId: true,
          skipReasonNameSnapshot: true,
          createdAt: true,
          endedAt: true,
        },
      },
      turnExclusions: {
        where: { overriddenAt: null },
        orderBy: { createdAt: 'asc' as const },
        select: {
          staffId: true,
          reason: true,
          createdAt: true,
          staff: { select: { id: true, name: true } },
        },
      },
    },
  },
  supportingStaff: { select: { staffId: true } },
  payment: { select: { amount: true, tip: true, method: true, confirmedAt: true } },
} as const;

type HistoryAppointmentRow = Prisma.AppointmentGetPayload<{
  include: typeof historyAppointmentInclude;
}>;

// Legacy demo appointments were imported before turn routing existed. Keep
// the repair projection deliberately narrow because this endpoint only needs
// service status, staff, completion/cancellation timestamps, and turn counts.
const demoTurnBackfillInclude = {
  services: {
    orderBy: { sequence: 'asc' as const },
    select: {
      id: true,
      status: true,
      primaryStaffId: true,
      completedAt: true,
      cancelledAt: true,
      primaryStaff: { select: { id: true, name: true } },
      turns: { select: { id: true } },
    },
  },
} as const;

// A staff member is busy only while actively handling a turn. Payment pending is
// deliberately excluded: the service is finished, so the staff member may take
// another turn while the front desk completes payment.
export const staffBusyAppointmentStatuses: AppointmentStatus[] = [
  AppointmentStatus.ASSIGNED,
  AppointmentStatus.IN_SERVICE,
];
const checkoutBlockingAppointmentStatuses: AppointmentStatus[] = [
  AppointmentStatus.ASSIGNED,
  AppointmentStatus.IN_SERVICE,
  AppointmentStatus.PAYMENT_PENDING,
];
const manualCheckoutBlockingAppointmentStatuses: AppointmentStatus[] = [
  AppointmentStatus.ASSIGNED,
  AppointmentStatus.IN_SERVICE,
  AppointmentStatus.PAYMENT_PENDING,
];

async function staffForBusinessDate(tx: D1PrismaRuntime | Prisma.TransactionClient, date: Date) {
  return tx.staff.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      initials: true,
      isActive: true,
      skills: { select: { skill: { select: { name: true } } } },
      attendance: { where: { businessDate: date }, select: { status: true } },
      serviceState: {
        select: {
          availability: true,
          lastServiceFinishedAt: true,
          lastAssignedAt: true,
        },
      },
      appointments: {
        where: { businessDate: date, status: { in: staffBusyAppointmentStatuses } },
        select: { id: true },
      },
      serviceAppointments: {
        where: {
          status: { in: staffBusyAppointmentStatuses },
          appointment: { businessDate: date },
        },
        select: { id: true },
      },
      supportingAppointments: {
        where: {
          releasedAt: null,
          appointment: { businessDate: date, status: { in: staffBusyAppointmentStatuses } },
        },
        select: { appointmentId: true },
      },
    },
  });
}

function ticket(appointment: AppointmentSnapshot, staff: StaffCandidate[]) {
  const assigned = staff.find((member) => member.id === appointment.primaryStaffId);
  const services = appointment.services.map((service) => ({
    id: service.id,
    sequence: service.sequence,
    name: service.serviceName,
    durationMin: service.durationMin,
    amount: service.amount,
    status: service.status,
  }));
  const totalDuration =
    services.reduce((total, service) => total + service.durationMin, 0) || appointment.durationMin;
  return {
    code: appointment.code,
    appointmentId: appointment.id,
    status: appointment.status,
    serviceName: appointment.serviceName,
    durationMin: totalDuration,
    amount: appointment.amount,
    assignedStaffName: assigned?.name ?? appointment.primaryStaff?.name ?? null,
    services,
    message:
      assigned || appointment.primaryStaff
        ? `Assigned to ${assigned?.name ?? appointment.primaryStaff?.name}`
        : 'Waiting for the next available specialist',
  };
}

async function requestHash(input: unknown) {
  return sha256Hex(JSON.stringify(input));
}

function paymentAuditNumber(metadata: Prisma.JsonValue | null | undefined, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return 0;
  const value = (metadata as Prisma.JsonObject)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value) || 0;
  return 0;
}

function paymentAuditOptionalNumber(metadata: Prisma.JsonValue | null | undefined, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Prisma.JsonObject)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value) || 0;
  return null;
}

function paymentAuditCurrentMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): Prisma.JsonValue | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return metadata ?? null;
  const current = (metadata as Prisma.JsonObject).current;
  return current && typeof current === 'object' && !Array.isArray(current) ? current : metadata;
}

function roundMoney(value: number) {
  return moneyFromMinorUnits(toMinorUnits(value));
}

function paymentCashDetails(input: {
  method: PaymentMethod;
  amount: number;
  tip: number;
  cashReceived?: number;
}) {
  const total = moneyFromMinorUnits(toMinorUnits(input.amount) + toMinorUnits(input.tip));
  if (input.method !== 'CASH') return { cashReceived: null, changeGiven: 0, total };
  const cashReceived = roundMoney(input.cashReceived ?? total);
  if (cashReceived < total)
    throw new Error(`Cash received cannot be less than the amount due of ${total.toFixed(2)}`);
  return { cashReceived, changeGiven: roundMoney(cashReceived - total), total };
}

async function bumpBoardVersion(tx: Prisma.TransactionClient) {
  await tx.shopConfig.upsert({
    where: { id: 1 },
    update: { stateVersion: { increment: 1 } },
    create: { id: 1, stateVersion: 1 },
  });
}

async function recordTurnEvent(
  tx: Prisma.TransactionClient,
  input: {
    appointmentId: string;
    appointmentServiceId?: string | null;
    turnId?: string | null;
    eventType: TurnEventType;
    assignedStaffId?: string | null;
    assignedStaffName?: string | null;
    actorType: ActorType;
    actorId?: string | null;
    actorName?: string | null;
    reason?: string | null;
  },
) {
  const assignedStaffName =
    input.assignedStaffName ??
    (input.assignedStaffId
      ? ((
          await tx.staff.findUnique({
            where: { id: input.assignedStaffId },
            select: { name: true },
          })
        )?.name ?? null)
      : null);
  const actorName =
    input.actorName ??
    (input.actorType === ActorType.SYSTEM
      ? 'System'
      : input.actorType === ActorType.STAFF && input.actorId
        ? ((await tx.staff.findUnique({ where: { id: input.actorId }, select: { name: true } }))
            ?.name ?? 'Staff')
        : input.actorType === ActorType.ADMIN && input.actorId
          ? ((
              await tx.authUser.findUnique({
                where: { id: input.actorId },
                select: { email: true },
              })
            )?.email ?? 'Administrator')
          : input.actorType);
  return tx.turnEvent.create({
    data: {
      appointmentId: input.appointmentId,
      appointmentServiceId: input.appointmentServiceId ?? null,
      turnId: input.turnId ?? null,
      eventType: input.eventType,
      assignedStaffId: input.assignedStaffId ?? null,
      assignedStaffNameSnapshot: assignedStaffName,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorNameSnapshot: actorName,
      reason: input.reason?.trim() || null,
    },
  });
}

async function getDbServicesWithClient(client: D1PrismaRuntime): Promise<ServiceCandidate[]> {
  const rows = await client.service.findMany({
    where: { isActive: true, category: { isActive: true } },
    include: {
      category: { select: { id: true, name: true, slug: true, sortOrder: true } },
      requiredSkills: { select: { skillId: true } },
    },
    orderBy: [{ name: 'asc' }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    iconKey: normalizeServiceIconKey(row.iconKey),
    category: row.category,
    durationMin: row.durationMin,
    price: Number(row.price),
    requiredSkillIds: row.requiredSkills.map((item) => item.skillId),
    isActive: row.isActive,
  }));
}

export async function getDbServices(client?: D1PrismaRuntime): Promise<ServiceCandidate[]> {
  if (client) return getDbServicesWithClient(client);
  return withPrismaRuntime('catalog.read', ({ client: runtimeClient }) =>
    getDbServicesWithClient(runtimeClient),
  );
}

function activeCatalogServiceWhere(serviceIds: string[]) {
  return { id: { in: serviceIds }, isActive: true, category: { isActive: true } } as const;
}

export type ShopOperationalConfig = {
  timezone: string;
  openingTime: string;
  closingTime: string;
  currency: string;
  verifiedSessionTtlMin: number;
  roundRobinEnabled: boolean;
  stateVersion: number;
};

async function getDbShopConfigWithClient(client: D1PrismaRuntime): Promise<ShopOperationalConfig> {
  const row = await client.shopConfig.findUnique({ where: { id: 1 } });
  return {
    timezone: row?.timezone ?? SHOP_TIMEZONE,
    openingTime: row?.openingTime ?? '09:00',
    closingTime: row?.closingTime ?? '21:00',
    currency: row?.currency ?? 'USD',
    verifiedSessionTtlMin: row?.verifiedSessionTtlMin ?? 3,
    roundRobinEnabled: row?.roundRobinEnabled ?? true,
    stateVersion: row?.stateVersion ?? 0,
  };
}

export async function getDbShopConfig(client?: D1PrismaRuntime): Promise<ShopOperationalConfig> {
  if (client) return getDbShopConfigWithClient(client);

  if (await isD1Runtime()) {
    const database = await getD1Database();
    const row = await database
      ?.prepare('SELECT timezone, opening_time, closing_time, verified_session_ttl_min, currency, round_robin_enabled, state_version FROM shop_config WHERE id = ?')
      .bind(1)
      .first<{ timezone: string; opening_time: string; closing_time: string; verified_session_ttl_min: number; currency: string; round_robin_enabled: number; state_version: number }>();
    return {
      timezone: row?.timezone ?? SHOP_TIMEZONE,
      openingTime: row?.opening_time ?? '09:00',
      closingTime: row?.closing_time ?? '21:00',
      currency: row?.currency ?? 'USD',
      verifiedSessionTtlMin: Number(row?.verified_session_ttl_min ?? 3),
      roundRobinEnabled: Boolean(row?.round_robin_enabled ?? 1),
      stateVersion: Number(row?.state_version ?? 0),
    };
  }

  const row = await prisma.shopConfig.findUnique({ where: { id: 1 } });
  return {
    timezone: row?.timezone ?? SHOP_TIMEZONE,
    openingTime: row?.openingTime ?? '09:00',
    closingTime: row?.closingTime ?? '21:00',
    currency: row?.currency ?? 'USD',
    verifiedSessionTtlMin: row?.verifiedSessionTtlMin ?? 3,
    roundRobinEnabled: row?.roundRobinEnabled ?? true,
    stateVersion: row?.stateVersion ?? 0,
  };
}

export async function lookupDbCustomerByPhone(phone: string) {
  const customer = await prisma.customer.findUnique({
    where: { phoneNormalized: normalizePhoneNumber(phone) },
    select: { name: true },
  });
  return { found: Boolean(customer), name: customer?.name ?? null };
}

async function getDbBoardStateWithClient(
  { publicView = false }: { publicView?: boolean },
  client: D1PrismaRuntime,
) {
  const config = await getDbShopConfigWithClient(client);
  const businessDate = currentBusinessDate(new Date(), config.timezone);
  const skipReasonsPromise = publicView
    ? Promise.resolve([] as Array<{ id: string; name: string }>)
    : client.skipReason.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true },
      });
  const [currentRows, upNextRows, staffRows, skipReasons] = await Promise.all([
    client.appointment.findMany({
      where: {
        businessDate,
        status: {
          in: [AppointmentStatus.IN_SERVICE, AppointmentStatus.PAYMENT_PENDING],
        },
      },
      select: boardAppointmentSelect,
      orderBy: { createdAt: 'asc' },
    }),
    client.appointment.findMany({
      where: {
        businessDate,
        status: { in: [AppointmentStatus.ASSIGNED, AppointmentStatus.WAITING] },
      },
      select: boardAppointmentSelect,
      orderBy: { createdAt: 'asc' },
      take: 4,
    }),
    staffForBusinessDate(client, businessDate),
    skipReasonsPromise,
  ]);
  const staff = staffRows.map(mapStaff);
  const mapBoardAppointment = (row: (typeof currentRows)[number]) => {
    const appointment = mapAppointment(row);
    if (!publicView) return appointment;
    const redactTurns = <
      T extends {
        reason: string | null;
        skipReasonId?: string | null;
        skipReasonNameSnapshot?: string | null;
      },
    >(
      turns: T[],
    ) =>
      turns.map((turn) => ({
        ...turn,
        reason: null,
        skipReasonId: null,
        skipReasonNameSnapshot: null,
      }));
    return {
      ...appointment,
      customerName: `Guest ${appointment.code}`,
      phone: '',
      turns: redactTurns(appointment.turns),
      services: appointment.services.map((service) => ({
        ...service,
        turns: redactTurns(service.turns),
        turnExclusions: [],
      })),
    };
  };
  const currentTurns = currentRows.map(mapBoardAppointment);
  const current = currentTurns[0] ?? null;
  const upNext = upNextRows.map(mapBoardAppointment);
  const now = new Date();
  return {
    current,
    currentTurns,
    upNext,
    staff,
    skipReasons: publicView ? [] : skipReasons,
    shop: {
      timezone: config.timezone,
      openingTime: config.openingTime,
      closingTime: config.closingTime,
      currency: config.currency,
    },
    version: config.stateVersion,
    at: now.toISOString(),
  };
}

export async function getDbBoardState({ publicView = false }: { publicView?: boolean } = {}) {
  return withPrismaRuntime('board.read', ({ client }) =>
    getDbBoardStateWithClient({ publicView }, client),
  );
}

/**
 * Read only the monotonic board version. Polling clients use this cheap path
 * to avoid rebuilding the full relation graph when no queue action occurred.
 */
export async function getDbBoardVersion(): Promise<number> {
  if (await isD1Runtime()) {
    const database = await getD1Database();
    const row = await database
      .prepare('SELECT state_version FROM shop_config WHERE id = ?')
      .bind(1)
      .first<{ state_version: number }>();
    return Number(row?.state_version ?? 0);
  }

  return withPrismaRuntime('board.version.read', async ({ client }) => {
    const row = await client.shopConfig.findUnique({
      where: { id: 1 },
      select: { stateVersion: true },
    });
    return row?.stateVersion ?? 0;
  });
}

function serviceSkillNames(service: { requiredSkills: Array<{ skill: { name: string } }> }) {
  return service.requiredSkills.map((item) => item.skill.name);
}

async function nextAppointmentCode(
  tx: typeof prisma | Prisma.TransactionClient,
  businessDate: Date,
) {
  const counter = await tx.appointmentCounter.upsert({
    where: { businessDate },
    update: { nextSequence: { increment: 1 } },
    create: { businessDate, nextSequence: 2 },
  });
  return `A${String(counter.nextSequence - 1).padStart(3, '0')}`;
}

export async function getDbAppointments(businessDate?: Date) {
  const date = businessDate ?? (await currentDbBusinessDate());
  const rows = await prisma.appointment.findMany({
    where: { businessDate: date },
    include: appointmentInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapAppointment);
}

async function getDbLiveAppointmentsWithClient(
  businessDate: Date | undefined,
  client: D1PrismaRuntime,
) {
  const date = businessDate ?? (await currentDbBusinessDate(new Date(), client));
  const rows = await client.appointment.findMany({
    where: {
      businessDate: date,
      status: {
        in: [
          AppointmentStatus.CREATED,
          AppointmentStatus.WAITING,
          AppointmentStatus.ASSIGNED,
          AppointmentStatus.IN_SERVICE,
          AppointmentStatus.PAYMENT_PENDING,
        ],
      },
    },
    include: dashboardAppointmentInclude,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(mapAppointment);
}

export async function getDbLiveAppointments(
  businessDate?: Date,
  client?: D1PrismaRuntime,
) {
  if (client) return getDbLiveAppointmentsWithClient(businessDate, client);
  return withPrismaRuntime('dashboard.live.read', ({ client: runtimeClient }) =>
    getDbLiveAppointmentsWithClient(businessDate, runtimeClient),
  );
}

export async function getDbAppointmentsInRange(start: Date, end: Date) {
  const rows = await prisma.appointment.findMany({
    where: { businessDate: { gte: start, lt: end } },
    include: appointmentInclude,
    orderBy: { createdAt: 'desc' },
  });
  return rows.map(mapAppointment);
}

export type AdminAppointmentFilters = {
  start: Date;
  end: Date;
  search?: string;
  status?: string;
  payment?: 'PAID' | 'UNPAID';
  paymentMethod?: 'CARD' | 'CASH';
  staffId?: string;
  serviceId?: string;
  serviceStatus?: string;
  serviceCount?: 'ALL' | 'SINGLE' | 'MULTI';
  sort?:
    | 'NEWEST'
    | 'OLDEST'
    | 'AMOUNT_DESC'
    | 'DURATION_DESC'
    | 'PAYMENT_NEWEST'
    | 'PAYMENT_OLDEST';
};

export type AdminAppointmentPage = {
  appointments: AppointmentSnapshot[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalRevenue: number;
  totalDuration: number;
};

function buildAdminAppointmentWhere(
  filters: AdminAppointmentFilters,
  options: { supportsInsensitiveMode?: boolean } = {},
): Prisma.AppointmentWhereInput {
  const validStatuses = Object.values(AppointmentStatus) as string[];
  const where: Prisma.AppointmentWhereInput = {
    businessDate: { gte: filters.start, lt: filters.end },
  };
  if (filters.status && filters.status !== 'ALL' && validStatuses.includes(filters.status))
    where.status = filters.status as AppointmentStatus;
  if (filters.paymentMethod === 'CARD' || filters.paymentMethod === 'CASH')
    where.payment = { is: { method: filters.paymentMethod } };
  else if (filters.payment === 'PAID') where.payment = { isNot: null };
  else if (filters.payment === 'UNPAID') where.payment = { is: null };
  if (filters.search?.trim()) {
    const search = filters.search.trim();
    const contains = options.supportsInsensitiveMode === false
      ? { contains: search }
      : { contains: search, mode: 'insensitive' as const };
    where.OR = [
      { code: contains },
      { customer: { name: contains } },
      { customer: { phone: contains } },
    ];
  }
  const serviceWhere: Prisma.AppointmentServiceWhereInput = {};
  if (filters.serviceId) serviceWhere.serviceId = filters.serviceId;
  if (
    filters.serviceStatus &&
    filters.serviceStatus !== 'ALL' &&
    validStatuses.includes(filters.serviceStatus)
  ) {
    serviceWhere.status = filters.serviceStatus as AppointmentStatus;
  }
  if (Object.keys(serviceWhere).length) where.services = { some: serviceWhere };
  if (filters.staffId && filters.staffId !== 'ALL') {
    const staffCondition =
      filters.staffId === 'UNASSIGNED'
        ? { primaryStaffId: null, services: { none: { primaryStaffId: { not: null } } } }
        : {
            OR: [
              { primaryStaffId: filters.staffId },
              { services: { some: { primaryStaffId: filters.staffId } } },
              { supportingStaff: { some: { staffId: filters.staffId } } },
            ],
          };
    Object.assign(where, staffCondition);
  }
  return where;
}

async function addServiceCountConstraint(
  where: Prisma.AppointmentWhereInput,
  serviceCount: AdminAppointmentFilters['serviceCount'],
  _client: D1PrismaRuntime | Prisma.TransactionClient = prisma,
) {
  if (!serviceCount || serviceCount === 'ALL') return where;
  return {
    ...where,
    serviceCount: serviceCount === 'SINGLE' ? 1 : { gt: 1 },
  };
}

async function buildAdminAppointmentQuery(
  filters: AdminAppointmentFilters,
  client: D1PrismaRuntime | Prisma.TransactionClient = prisma,
) {
  const isD1 = await isD1Runtime();
  return addServiceCountConstraint(
    buildAdminAppointmentWhere(filters, { supportsInsensitiveMode: !isD1 }),
    filters.serviceCount,
    client,
  );
}

function appointmentOrderBy(sort: AdminAppointmentFilters['sort']) {
  if (sort === 'OLDEST') return [{ createdAt: 'asc' as const }, { id: 'asc' as const }];
  if (sort === 'AMOUNT_DESC')
    return [{ amount: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }];
  return [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
}

function paymentConfirmedAtValue(appointment: AppointmentSnapshot) {
  return new Date(appointment.payment?.confirmedAt ?? appointment.createdAt).getTime();
}

async function getDbAppointmentsFilteredWithClient(
  filters: AdminAppointmentFilters,
  client: D1PrismaRuntime,
) {
  const where = await buildAdminAppointmentQuery(filters, client);
  const rows = await client.appointment.findMany({
    where,
    include: appointmentInclude,
    orderBy: { createdAt: 'desc' },
  });
  const needle = filters.search?.trim().toLocaleLowerCase();
  const filtered = rows.map(mapAppointment).filter((appointment) => {
    const services = appointment.services.length
      ? appointment.services
      : [
          {
            serviceId: appointment.serviceId,
            status: appointment.status,
            primaryStaffId: appointment.primaryStaffId,
          },
        ];
    const staffIds = new Set(
      [
        appointment.primaryStaffId,
        ...appointment.services.map((service) => service.primaryStaffId),
        ...appointment.supportingStaffIds,
      ].filter((staffId): staffId is string => Boolean(staffId)),
    );
    const matchesSearch =
      !needle ||
      [appointment.code, appointment.customerName, appointment.phone].some((value) =>
        value.toLocaleLowerCase().includes(needle),
      );
    const matchesStatus =
      !filters.status || filters.status === 'ALL' || appointment.status === filters.status;
    const matchesPayment =
      !filters.payment ||
      (filters.payment === 'PAID' ? Boolean(appointment.payment) : !appointment.payment);
    const matchesPaymentMethod =
      !filters.paymentMethod || appointment.payment?.method === filters.paymentMethod;
    const matchesStaff =
      !filters.staffId ||
      (filters.staffId === 'UNASSIGNED' ? staffIds.size === 0 : staffIds.has(filters.staffId));
    const matchesService =
      !filters.serviceId || services.some((service) => service.serviceId === filters.serviceId);
    const matchesServiceStatus =
      !filters.serviceStatus ||
      filters.serviceStatus === 'ALL' ||
      services.some((service) => service.status === filters.serviceStatus);
    const matchesServiceCount =
      !filters.serviceCount ||
      filters.serviceCount === 'ALL' ||
      (filters.serviceCount === 'MULTI' ? services.length > 1 : services.length === 1);
    return (
      matchesSearch &&
      matchesStatus &&
      matchesPayment &&
      matchesPaymentMethod &&
      matchesStaff &&
      matchesService &&
      matchesServiceStatus &&
      matchesServiceCount
    );
  });
  const sort = filters.sort ?? 'NEWEST';
  return filtered.sort((left, right) => {
    if (sort === 'OLDEST')
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (sort === 'AMOUNT_DESC')
      return (
        right.amount - left.amount ||
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    if (sort === 'PAYMENT_OLDEST')
      return (
        paymentConfirmedAtValue(left) - paymentConfirmedAtValue(right) ||
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
    if (sort === 'PAYMENT_NEWEST')
      return (
        paymentConfirmedAtValue(right) - paymentConfirmedAtValue(left) ||
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    if (sort === 'DURATION_DESC') {
      const leftDuration =
        left.services.reduce((total, service) => total + service.durationMin, 0) ||
        left.durationMin;
      const rightDuration =
        right.services.reduce((total, service) => total + service.durationMin, 0) ||
        right.durationMin;
      return (
        rightDuration - leftDuration ||
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export async function getDbAppointmentsFiltered(
  filters: AdminAppointmentFilters,
  client?: D1PrismaRuntime,
) {
  if (client) return getDbAppointmentsFilteredWithClient(filters, client);
  return withPrismaRuntime('admin.appointments.filtered.read', ({ client: runtimeClient }) =>
    getDbAppointmentsFilteredWithClient(filters, runtimeClient),
  );
}

export async function getDbAppointmentTurnHistory(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      code: true,
      status: true,
      customerNameSnapshot: true,
      customer: { select: { name: true, phone: true } },
      services: {
        orderBy: { sequence: 'asc' },
        select: {
          id: true,
          sequence: true,
          serviceNameSnapshot: true,
          status: true,
        },
      },
    },
  });
  if (!appointment) throw new Error('Appointment not found');

  const [events, turnRecordCount] = await Promise.all([
    prisma.turnEvent.findMany({
      where: { appointmentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        appointmentServiceId: true,
        turnId: true,
        eventType: true,
        assignedStaffId: true,
        assignedStaffNameSnapshot: true,
        actorType: true,
        actorId: true,
        actorNameSnapshot: true,
        reason: true,
        createdAt: true,
      },
    }),
    prisma.turn.count({ where: { appointmentId } }),
  ]);
  const servicesById = new Map(appointment.services.map((service) => [service.id, service]));

  return {
    appointment: {
      id: appointment.id,
      code: appointment.code,
      customerName: appointment.customerNameSnapshot || appointment.customer.name,
      phone: appointment.customer.phone,
      status: appointment.status,
    },
    turnRecordCount,
    eventCount: events.length,
    events: events.map((event) => {
      const service = event.appointmentServiceId
        ? servicesById.get(event.appointmentServiceId)
        : undefined;
      return {
        id: event.id,
        appointmentServiceId: event.appointmentServiceId,
        turnId: event.turnId,
        serviceSequence: service?.sequence ?? null,
        serviceName: service?.serviceNameSnapshot ?? 'Appointment activity',
        serviceStatus: service?.status ?? null,
        eventType: event.eventType,
        assignedStaffId: event.assignedStaffId,
        assignedStaffName: event.assignedStaffNameSnapshot,
        actorType: event.actorType,
        actorId: event.actorId,
        actorName: event.actorNameSnapshot ?? event.actorType,
        reason: event.reason,
        createdAt: event.createdAt,
      };
    }),
  };
}

export async function getDbAppointmentsPage(
  filters: AdminAppointmentFilters,
  requestedPage = 1,
  requestedPageSize = 25,
  client?: D1PrismaRuntime,
): Promise<AdminAppointmentPage> {
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = Math.min(
    50,
    Math.max(1, Number.isInteger(requestedPageSize) ? requestedPageSize : 25),
  );
  const db = client ?? prisma;
  const where = await buildAdminAppointmentQuery(filters, db);
  const [total, revenue, duration] = await Promise.all([
    db.appointment.count({ where }),
    db.appointment.aggregate({ where, _sum: { amount: true } }),
    db.appointmentService.aggregate({
      where: { appointment: where },
      _sum: { durationMinSnapshot: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const effectivePage = Math.min(page, totalPages);
  const skip = (effectivePage - 1) * pageSize;
  const sort = filters.sort ?? 'NEWEST';
  let appointments: AppointmentSnapshot[];

  if (sort === 'DURATION_DESC') {
    const durationRows = await db.appointment.findMany({
      where,
      select: {
        id: true,
        createdAt: true,
        durationMinSnapshot: true,
        services: { select: { durationMinSnapshot: true } },
      },
    });
    durationRows.sort((left, right) => {
      const leftDuration =
        left.services.reduce((sum, service) => sum + service.durationMinSnapshot, 0) ||
        left.durationMinSnapshot;
      const rightDuration =
        right.services.reduce((sum, service) => sum + service.durationMinSnapshot, 0) ||
        right.durationMinSnapshot;
      return (
        rightDuration - leftDuration ||
        right.createdAt.getTime() - left.createdAt.getTime() ||
        right.id.localeCompare(left.id)
      );
    });
    const pageIds = durationRows.slice(skip, skip + pageSize).map((row) => row.id);
    const rows = pageIds.length
      ? await db.appointment.findMany({
          where: { id: { in: pageIds } },
          include: historyAppointmentInclude,
        })
      : [];
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    appointments = pageIds
      .map((id) => rowsById.get(id))
      .filter((row): row is (typeof rows)[number] => Boolean(row))
      .map(mapAppointment);
  } else if (sort === 'PAYMENT_NEWEST' || sort === 'PAYMENT_OLDEST') {
    const paymentRows = await db.appointment.findMany({
      where,
      select: { id: true, createdAt: true, payment: { select: { confirmedAt: true } } },
    });
    paymentRows.sort((left, right) => {
      const leftConfirmedAt = left.payment?.confirmedAt?.getTime() ?? left.createdAt.getTime();
      const rightConfirmedAt = right.payment?.confirmedAt?.getTime() ?? right.createdAt.getTime();
      const difference =
        sort === 'PAYMENT_NEWEST'
          ? rightConfirmedAt - leftConfirmedAt
          : leftConfirmedAt - rightConfirmedAt;
      return (
        difference ||
        (sort === 'PAYMENT_NEWEST'
          ? right.createdAt.getTime() - left.createdAt.getTime()
          : left.createdAt.getTime() - right.createdAt.getTime()) ||
        right.id.localeCompare(left.id)
      );
    });
    const pageIds = paymentRows.slice(skip, skip + pageSize).map((row) => row.id);
    const rows = pageIds.length
      ? await db.appointment.findMany({
          where: { id: { in: pageIds } },
          include: historyAppointmentInclude,
        })
      : [];
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    appointments = pageIds
      .map((id) => rowsById.get(id))
      .filter((row): row is (typeof rows)[number] => Boolean(row))
      .map(mapAppointment);
  } else {
    const rows = await db.appointment.findMany({
      where,
      include: historyAppointmentInclude,
      orderBy: appointmentOrderBy(sort),
      skip,
      take: pageSize,
    });
    appointments = rows.map(mapAppointment);
  }

  return {
    appointments,
    page: effectivePage,
    pageSize,
    total,
    totalPages,
    totalRevenue: Number(revenue._sum.amount ?? 0),
    totalDuration: duration._sum.durationMinSnapshot ?? 0,
  };
}

export async function getDbAppointmentFilterOptions(client?: D1PrismaRuntime) {
  const db = client ?? prisma;
  const [staff, services] = await Promise.all([
    db.staff.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.service.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return { staff, services };
}

export type PastUnresolvedAppointment = {
  appointment: AppointmentSnapshot;
  businessDate: string;
  daysOverdue: number;
  resolutionKind: PastAppointmentResolutionKind;
  guidance: (typeof pastAppointmentGuidance)[PastAppointmentResolutionKind];
};

export type PastUnresolvedSummary = {
  total: number;
  unserved: number;
  assignmentGap: number;
  serviceInterrupted: number;
  paymentReview: number;
};

async function getDbPastUnresolvedAppointmentsWithClient(
  client: D1PrismaRuntime,
): Promise<{
  currentBusinessDate: string;
  appointments: PastUnresolvedAppointment[];
  summary: PastUnresolvedSummary;
  hasMore: boolean;
}> {
  const currentDate = await currentDbBusinessDate(new Date(), client);
  const where: Prisma.AppointmentWhereInput = {
    businessDate: { lt: currentDate },
    status: { in: PAST_UNRESOLVED_STATUSES as AppointmentStatus[] },
  };
  const [statusCounts, orderedRows] = await Promise.all([
    client.appointment.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    }),
    client.appointment.findMany({
      where,
      select: { id: true },
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    }),
  ]);

  // D1 allows fewer bound SQL variables than the local SQLite runtime. A
  // relation-heavy include for 100 appointments can exceed that limit even
  // though the top-level appointment query is small enough. Load the oldest
  // page in bounded batches, then restore the original deterministic order.
  const rowsById = new Map<string, HistoryAppointmentRow>();
  const batchSize = 20;
  for (let start = 0; start < orderedRows.length; start += batchSize) {
    const ids = orderedRows.slice(start, start + batchSize).map((row) => row.id);
    const batchRows = await client.appointment.findMany({
      where: { id: { in: ids } },
      include: historyAppointmentInclude,
    });
    for (const row of batchRows) rowsById.set(row.id, row);
  }
  const rows = orderedRows
    .map((row) => rowsById.get(row.id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const countByStatus = new Map(
    statusCounts.map((entry) => [entry.status, entry._count._all]),
  );
  const total = statusCounts.reduce((sum, entry) => sum + entry._count._all, 0);
  const summary: PastUnresolvedSummary = {
    total,
    unserved:
      (countByStatus.get(AppointmentStatus.CREATED) ?? 0) +
      (countByStatus.get(AppointmentStatus.WAITING) ?? 0),
    assignmentGap: countByStatus.get(AppointmentStatus.ASSIGNED) ?? 0,
    serviceInterrupted: countByStatus.get(AppointmentStatus.IN_SERVICE) ?? 0,
    paymentReview: countByStatus.get(AppointmentStatus.PAYMENT_PENDING) ?? 0,
  };
  const appointments = rows.map((row) => {
    const appointment = mapAppointment(row);
    const resolutionKind = classifyPastAppointment(appointment.status);
    return {
      appointment,
      businessDate: formatBusinessDate(row.businessDate),
      daysOverdue: businessDaysOverdue(row.businessDate, currentDate),
      resolutionKind,
      guidance: pastAppointmentGuidance[resolutionKind],
    };
  });
  return {
    currentBusinessDate: formatBusinessDate(currentDate),
    appointments,
    summary,
    hasMore: total > appointments.length,
  };
}

export async function getDbPastUnresolvedAppointments(client?: D1PrismaRuntime) {
  if (client) return getDbPastUnresolvedAppointmentsWithClient(client);
  return withPrismaRuntime('admin.past-unresolved.read', ({ client: runtimeClient }) =>
    getDbPastUnresolvedAppointmentsWithClient(runtimeClient),
  );
}

export type DemoTurnBackfillInput = {
  dryRun: boolean;
  adminId: string;
};

export type DemoTurnBackfillResult = {
  ok: true;
  scope: 'SAMPLE-*';
  dryRun: boolean;
  matchedAppointments: number;
  appointmentsWithChanges: number;
  plannedTurns: number;
  insertedTurns: number;
  alreadyRoutedServices: number;
  appointments: Array<{
    code: string;
    status: AppointmentStatus;
    serviceChanges: Array<{
      serviceId: string;
      turnStatus: TurnStatus;
      eventType: TurnEventType;
      assignedStaffId: string | null;
      reason: string;
    }>;
  }>;
};

type DemoTurnBackfillRow = Prisma.AppointmentGetPayload<{
  include: typeof demoTurnBackfillInclude;
}>;

function demoTurnBackfillPlan(
  appointment: Pick<DemoTurnBackfillRow, 'status' | 'createdAt' | 'cancelledAt'>,
  service: DemoTurnBackfillRow['services'][number],
) {
  const assignedStaffId = service.primaryStaff?.id ?? service.primaryStaffId ?? null;
  const plan = planLegacyDemoTurn({
    appointmentStatus: appointment.status as unknown as Parameters<typeof planLegacyDemoTurn>[0]['appointmentStatus'],
    serviceStatus: service.status as unknown as Parameters<typeof planLegacyDemoTurn>[0]['serviceStatus'],
    assignedStaffId,
    createdAt: appointment.createdAt,
    completedAt: service.completedAt,
    cancelledAt: service.cancelledAt ?? appointment.cancelledAt,
  });
  return {
    ...plan,
    assignedStaffId,
    status: plan.status as TurnStatus,
    eventType: plan.eventType as TurnEventType,
  };
}

/**
 * Repair only legacy SAMPLE-* appointments for the demo environment. The
 * operation is idempotent: a service is changed only when it has no turns.
 * Writes are intentionally done as D1 batches so a retry after a Worker
 * interruption can safely continue with the remaining services.
 */
export async function backfillDbDemoAppointmentTurns(
  input: DemoTurnBackfillInput,
): Promise<DemoTurnBackfillResult> {
  return withD1Lease(async (database) => {
    const rows = await prisma.appointment.findMany({
      where: { code: { startsWith: 'SAMPLE-' } },
      include: demoTurnBackfillInclude,
      orderBy: [{ businessDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    const appointmentChanges = rows.map((appointment) => ({
      code: appointment.code,
      status: appointment.status as AppointmentStatus,
      serviceChanges: appointment.services
        .filter((service) => service.turns.length === 0)
        .map((service) => {
          const plan = demoTurnBackfillPlan(appointment, service);
          return {
            serviceId: service.id,
            assignedStaffName: service.primaryStaff?.name ?? null,
            plan,
          };
        }),
    }));
    const changes = appointmentChanges.filter((item) => item.serviceChanges.length > 0);
    const alreadyRoutedServices = rows.reduce(
      (total, appointment) =>
        total + appointment.services.filter((service) => service.turns.length > 0).length,
      0,
    );
    const plannedTurns = changes.reduce((total, appointment) => total + appointment.serviceChanges.length, 0);
    const resultBase = {
      ok: true as const,
      scope: 'SAMPLE-*' as const,
      dryRun: input.dryRun,
      matchedAppointments: rows.length,
      appointmentsWithChanges: changes.length,
      plannedTurns,
      insertedTurns: input.dryRun ? 0 : plannedTurns,
      alreadyRoutedServices,
      appointments: changes.map((appointment) => ({
        code: appointment.code,
        status: appointment.status,
        serviceChanges: appointment.serviceChanges.map(({ serviceId, plan }) => ({
          serviceId,
          turnStatus: plan.status,
          eventType: plan.eventType,
          assignedStaffId: plan.assignedStaffId,
          reason: plan.reason,
        })),
      })),
    } satisfies DemoTurnBackfillResult;

    if (input.dryRun || !plannedTurns) return resultBase;

    const nowIso = d1DateTimeValue(new Date());
    const batches: Array<ReturnType<typeof d1Statement>[]> = [];
    let currentBatch: ReturnType<typeof d1Statement>[] = [];
    const flushBatch = () => {
      if (currentBatch.length) batches.push(currentBatch);
      currentBatch = [];
    };

    for (const appointment of changes) {
      const repairedServiceIds: string[] = [];
      for (const { serviceId, assignedStaffName, plan } of appointment.serviceChanges) {
        const turnId = randomId();
        repairedServiceIds.push(serviceId);
        currentBatch.push(
          d1Statement(
            database,
            `INSERT INTO turns (id, appointment_id, appointment_service_id, assigned_staff_id, status, reason, created_at, ended_at)
             SELECT ?, a.id, ?, ?, ?, ?, ?, ?
             FROM appointments a
             JOIN appointment_services s ON s.appointment_id = a.id
             WHERE a.code = ? AND s.id = ? AND NOT EXISTS (SELECT 1 FROM turns existing_turn WHERE existing_turn.appointment_service_id = s.id)`,
            turnId,
            serviceId,
            plan.assignedStaffId,
            plan.status,
            plan.reason,
            d1DateTimeValue(plan.createdAt),
            plan.endedAt ? d1DateTimeValue(plan.endedAt) : null,
            appointment.code,
            serviceId,
          ),
        );
        currentBatch.push(
          d1Statement(
            database,
            `INSERT INTO turn_events (id, appointment_id, appointment_service_id, turn_id, event_type, assigned_staff_id, assigned_staff_name_snapshot, actor_type, actor_id, actor_name_snapshot, reason, created_at)
             SELECT ?, a.id, s.id, existing_turn.id, ?, ?, ?, ?, ?, ?, ?, ?
             FROM appointments a
             JOIN appointment_services s ON s.appointment_id = a.id
             JOIN turns existing_turn ON existing_turn.appointment_service_id = s.id
             WHERE a.code = ? AND s.id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM turn_events existing_event
                 WHERE existing_event.turn_id = existing_turn.id
                   AND existing_event.event_type = ?
                   AND existing_event.reason = ?
               )`,
            randomId(),
            plan.eventType,
            plan.assignedStaffId,
            assignedStaffName,
            ActorType.ADMIN,
            input.adminId,
            'Demo turn backfill',
            plan.reason,
            nowIso,
            appointment.code,
            serviceId,
            plan.eventType,
            plan.reason,
          ),
        );
      }
      currentBatch.push(
        d1AuditEvent(
          database,
          {
            action: 'appointment.demo_turns_backfilled',
            entity: 'Appointment',
            actorType: ActorType.ADMIN,
            actorId: input.adminId,
            metadata: { code: appointment.code, serviceIds: repairedServiceIds },
          },
          nowIso,
        ),
      );
      if (currentBatch.length >= 75) flushBatch();
    }
    flushBatch();
    for (const batch of batches) await database.batch(batch);
    await database.batch([d1BumpBoardVersion(database, nowIso)]);
    return resultBase;
  });
}

function d1Statement(database: D1DatabaseLike, query: string, ...values: unknown[]) {
  return database.prepare(query).bind(...values);
}

function d1AuditEvent(
  database: D1DatabaseLike,
  input: { action: string; entity: string; entityId?: string; actorId?: string; actorType?: ActorType; metadata?: unknown },
  nowIso: string,
) {
  return d1Statement(
    database,
    `INSERT INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    randomId(),
    nowIso,
    input.actorType ?? ActorType.SYSTEM,
    input.actorId ?? null,
    input.action,
    input.entity,
    input.entityId ?? null,
    input.metadata === undefined ? null : JSON.stringify(input.metadata),
  );
}

function d1TurnEvent(
  database: D1DatabaseLike,
  input: {
    appointmentId: string;
    appointmentServiceId?: string | null;
    turnId?: string | null;
    eventType: TurnEventType;
    assignedStaffId?: string | null;
    assignedStaffName?: string | null;
    actorType: ActorType;
    actorId?: string | null;
    actorName?: string | null;
    reason?: string | null;
  },
  nowIso: string,
) {
  return d1Statement(
    database,
    `INSERT INTO turn_events (id, appointment_id, appointment_service_id, turn_id, event_type, assigned_staff_id, assigned_staff_name_snapshot, actor_type, actor_id, actor_name_snapshot, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomId(),
    input.appointmentId,
    input.appointmentServiceId ?? null,
    input.turnId ?? null,
    input.eventType,
    input.assignedStaffId ?? null,
    input.assignedStaffName ?? null,
    input.actorType,
    input.actorId ?? null,
    input.actorName ?? null,
    input.reason?.trim() || null,
    nowIso,
  );
}

function d1BumpBoardVersion(database: D1DatabaseLike, nowIso: string) {
  return d1Statement(
    database,
    `INSERT INTO shop_config (id, state_version, created_at, updated_at) VALUES (1, 1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET state_version = shop_config.state_version + 1, updated_at = excluded.updated_at`,
    nowIso,
    nowIso,
  );
}

function d1AppointmentAggregate(
  appointment: { serviceId: string; serviceNameSnapshot: string; durationMinSnapshot: number },
  services: Array<{ serviceId: string; serviceNameSnapshot: string; durationMinSnapshot: number; status: AppointmentStatus; primaryStaffId: string | null }>,
) {
  const activeService =
    services.find((service) => service.status === AppointmentStatus.IN_SERVICE) ??
    services.find((service) => service.status === AppointmentStatus.ASSIGNED) ??
    services.find((service) => service.status === AppointmentStatus.WAITING || service.status === AppointmentStatus.CREATED) ??
    services.find((service) => service.status === AppointmentStatus.COMPLETED);
  const status = services.some((service) => service.status === AppointmentStatus.IN_SERVICE)
    ? AppointmentStatus.IN_SERVICE
    : services.some((service) => service.status === AppointmentStatus.ASSIGNED)
      ? AppointmentStatus.ASSIGNED
      : services.some((service) => service.status === AppointmentStatus.CREATED || service.status === AppointmentStatus.WAITING)
        ? AppointmentStatus.WAITING
        : services.some((service) => service.status === AppointmentStatus.COMPLETED)
          ? AppointmentStatus.PAYMENT_PENDING
          : AppointmentStatus.CANCELLED;
  return {
    status,
    serviceId: activeService?.serviceId ?? appointment.serviceId,
    serviceNameSnapshot: activeService?.serviceNameSnapshot ?? appointment.serviceNameSnapshot,
    durationMinSnapshot: activeService?.durationMinSnapshot ?? appointment.durationMinSnapshot,
    serviceCount: services.length,
    primaryStaffId: activeService?.primaryStaffId ?? null,
  };
}

type D1MappedAppointment = Parameters<typeof mapAppointment>[0];
type D1MappedAppointmentService = D1MappedAppointment['services'][number];
type D1RouteService = D1MappedAppointmentService & { service: { requiredSkills: Array<{ skill: { name: string } }> } };
type D1RouteAppointment = Omit<D1MappedAppointment, 'services'> & { services: D1RouteService[] };

async function d1RouteAppointmentPlan(
  database: D1DatabaseLike,
  appointment: D1RouteAppointment,
  services: D1RouteService[],
  businessDate: Date,
  options: {
    excludedServiceId?: string;
    excludedStaffId?: string;
    releasedStaffIds?: string[];
    routingSnapshot?: { candidates: StaffCandidate[]; roundRobinEnabled: boolean };
  } = {},
) {
  const routingSnapshot = options.routingSnapshot ?? {
    candidates: (await staffForBusinessDate(prisma, businessDate)).map(mapStaff),
    roundRobinEnabled:
      (await prisma.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } }))
        ?.roundRobinEnabled ?? true,
  };
  const candidates = routingSnapshot.candidates;
  const releasedStaffIds = new Set(options.releasedStaffIds ?? []);
  for (const candidate of candidates) {
    if (releasedStaffIds.has(candidate.id) && candidate.isPresent) candidate.availability = Availability.AVAILABLE;
  }
  const statements = [] as ReturnType<typeof d1Statement>[];
  for (const appointmentService of services
    .filter((service) => service.status === AppointmentStatus.CREATED || service.status === AppointmentStatus.WAITING)
    .sort((left, right) => left.sequence - right.sequence)) {
    const excludedStaffIds = appointmentService.turnExclusions.map((exclusion) => exclusion.staffId);
    if (appointmentService.id === options.excludedServiceId && options.excludedStaffId)
      excludedStaffIds.push(options.excludedStaffId);
    const assignment = routeNextTurn(candidates, serviceSkillNames(appointmentService.service), [...new Set(excludedStaffIds)], routingSnapshot.roundRobinEnabled);
    const status = assignment.staff ? AppointmentStatus.ASSIGNED : AppointmentStatus.WAITING;
    const previousStaffId = appointmentService.primaryStaffId;
    const activeTurn = [...appointmentService.turns].reverse().find((turn) => turn.status === TurnStatus.ASSIGNED && !turn.assignedStaffId);
    const routedTurnId = activeTurn?.id ?? randomId();
    statements.push(d1Statement(database, `UPDATE appointment_services SET status = ?, primary_staff_id = ? WHERE id = ? AND status IN (?, ?)`, status, assignment.staff?.id ?? null, appointmentService.id, AppointmentStatus.CREATED, AppointmentStatus.WAITING));
    if (activeTurn) {
      statements.push(d1Statement(database, `UPDATE turns SET assigned_staff_id = ?, reason = ? WHERE id = ? AND status = ?`, assignment.staff?.id ?? null, assignment.staff ? null : 'Waiting for eligible staff', activeTurn.id, TurnStatus.ASSIGNED));
    } else {
      statements.push(d1Statement(database, `INSERT INTO turns (id, appointment_id, appointment_service_id, assigned_staff_id, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, routedTurnId, appointment.id, appointmentService.id, assignment.staff?.id ?? null, TurnStatus.ASSIGNED, assignment.staff ? null : 'Waiting for eligible staff', d1DateTimeValue(new Date())));
    }
    const assignmentChanged = !activeTurn || previousStaffId !== (assignment.staff?.id ?? null) || appointmentService.status !== status;
    if (assignmentChanged)
      statements.push(d1TurnEvent(database, { appointmentId: appointment.id, appointmentServiceId: appointmentService.id, turnId: routedTurnId, eventType: assignment.staff ? TurnEventType.ASSIGNED : TurnEventType.WAITING, assignedStaffId: assignment.staff?.id ?? null, assignedStaffName: assignment.staff?.name ?? null, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: assignment.staff ? 'Assigned by skill and fair wait time' : 'Waiting for eligible staff' }, d1DateTimeValue(new Date())));
    if (assignment.staff) {
      statements.push(d1Statement(database, `INSERT INTO staff_service_state (staff_id, availability, last_assigned_at) VALUES (?, ?, ?)
        ON CONFLICT(staff_id) DO UPDATE SET availability = excluded.availability, last_assigned_at = excluded.last_assigned_at`, assignment.staff.id, Availability.BUSY, d1DateTimeValue(new Date())));
      const candidate = candidates.find((item) => item.id === assignment.staff?.id);
      if (candidate) candidate.availability = Availability.BUSY;
    }
    appointmentService.status = status;
    appointmentService.primaryStaffId = assignment.staff?.id ?? null;
  }
  return { statements, services };
}

function d1ReleaseStaffStatements(database: D1DatabaseLike, businessDate: Date, staffIds: string[]) {
  const uniqueStaffIds = [...new Set(staffIds.filter(Boolean))];
  if (!uniqueStaffIds.length) return [] as ReturnType<typeof d1Statement>[];
  const placeholders = uniqueStaffIds.map(() => '?').join(', ');
  return [d1Statement(database, `UPDATE staff_service_state SET availability = ? WHERE staff_id IN (${placeholders}) AND availability = ?
    AND NOT EXISTS (SELECT 1 FROM appointment_services active_service JOIN appointments active_appointment ON active_appointment.id = active_service.appointment_id WHERE active_service.primary_staff_id = staff_service_state.staff_id AND active_service.status IN (?, ?) AND active_appointment.business_date = ?)
    AND NOT EXISTS (SELECT 1 FROM appointment_supporting_staff support JOIN appointments support_appointment ON support_appointment.id = support.appointment_id WHERE support.staff_id = staff_service_state.staff_id AND support.released_at IS NULL AND support_appointment.business_date = ? AND support_appointment.status IN (?, ?, ?))`, Availability.AVAILABLE, ...uniqueStaffIds, Availability.BUSY, AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, d1DateTimeValue(businessDate), d1DateTimeValue(businessDate), AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, AppointmentStatus.PAYMENT_PENDING)];
}

async function changeDbAppointmentServiceD1(
  input: {
    appointmentServiceId: string;
    serviceId: string;
    reason: string;
    idempotencyKey?: string;
    adminId: string;
  },
  businessDate: Date,
) {
  return withD1Lease(async (database) => {
    const scope = `service-change:${input.appointmentServiceId}`;
    const normalizedRequestHash = await requestHash({
      appointmentServiceId: input.appointmentServiceId,
      serviceId: input.serviceId,
      reason: input.reason.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await prisma.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This service-change key was already used for different details');
        const existingService = await prisma.appointmentService.findUnique({
          where: { id: input.appointmentServiceId },
          select: { appointmentId: true },
        });
        const existing = existingService
          ? await prisma.appointment.findUnique({
              where: { id: existingService.appointmentId },
              include: appointmentInclude,
            })
          : null;
        return {
          ok: true,
          appointment: existing ? mapAppointment(existing) : null,
          idempotent: true,
        };
      }
    }

    const current = await prisma.appointmentService.findUnique({
      where: { id: input.appointmentServiceId },
      include: {
        appointment: { include: appointmentInclude },
        service: { include: { requiredSkills: { include: { skill: true } } } },
        primaryStaff: true,
        turns: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!current) throw new Error('Appointment service not found');
    if (
      (
        [
          AppointmentStatus.COMPLETED,
          AppointmentStatus.CANCELLED,
          AppointmentStatus.PAYMENT_PENDING,
        ] as AppointmentStatus[]
      ).includes(current.status) ||
      current.appointment.payment ||
      current.appointment.status === AppointmentStatus.PAYMENT_PENDING ||
      current.appointment.status === AppointmentStatus.COMPLETED
    )
      throw new Error('Completed or payment-confirmed service history cannot be changed');

    const nextService = await prisma.service.findFirst({
      where: activeCatalogServiceWhere([input.serviceId]),
      include: { requiredSkills: { include: { skill: true } } },
    });
    if (!nextService) throw new Error('Replacement service is unavailable');
    if (nextService.id === current.serviceId) throw new Error('Choose a different service');

    const now = new Date();
    const nowIso = d1DateTimeValue(now);
    const reason = input.reason.trim();
    const requiredSkills = nextService.requiredSkills.map((item) => item.skill.name);
    let qualified = !current.primaryStaffId;
    if (current.primaryStaffId) {
      const staff = await prisma.staff.findUnique({
        where: { id: current.primaryStaffId },
        include: {
          skills: { include: { skill: true } },
          attendance: { where: { businessDate } },
        },
      });
      qualified = Boolean(
        staff?.isActive &&
          staff.attendance[0]?.status === AttendanceStatus.PRESENT &&
          requiredSkills.every((skill) => staff.skills.some((item) => item.skill.name === skill)),
      );
    }
    if (current.status === AppointmentStatus.IN_SERVICE && !qualified)
      throw new Error(
        'Current technician is not qualified for the replacement service; reassign before changing it',
      );

    const routedServices = current.appointment.services.map((service) => ({
      ...service,
      turns: [...service.turns],
      turnExclusions: [...service.turnExclusions],
    })) as D1RouteService[];
    const changedService = routedServices.find((service) => service.id === current.id);
    if (!changedService) throw new Error('Appointment service not found');
    const needsReroute = !qualified && current.status !== AppointmentStatus.IN_SERVICE;
    changedService.service = nextService;
    changedService.serviceId = nextService.id;
    changedService.serviceNameSnapshot = nextService.name;
    changedService.durationMinSnapshot = nextService.durationMin;
    changedService.amount = nextService.price;
    if (needsReroute) {
      changedService.status = AppointmentStatus.WAITING;
      changedService.primaryStaffId = null;
    }

    const statements = [] as ReturnType<typeof d1Statement>[];
    const guardedServiceUpdateIndex = statements.length;
    statements.push(
      d1Statement(
        database,
        `UPDATE appointment_services
         SET service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, amount = ?, currency = ?, status = ?, primary_staff_id = ?
         WHERE id = ? AND service_id = ? AND status = ?`,
        nextService.id,
        nextService.name,
        nextService.durationMin,
        moneyFromMinorUnits(toMinorUnits(nextService.price)),
        current.appointment.currency,
        needsReroute ? AppointmentStatus.WAITING : current.status,
        needsReroute ? null : current.primaryStaffId,
        current.id,
        current.serviceId,
        current.status,
      ),
    );

    if (needsReroute) {
      const activeTurn = [...current.turns]
        .reverse()
        .find(
          (turn) =>
            turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED,
        );
      if (activeTurn) {
        statements.push(
          d1Statement(
            database,
            `UPDATE turns SET status = ?, reason = ?, ended_at = ? WHERE id = ? AND status IN (?, ?)`,
            TurnStatus.SKIPPED,
            'Service changed; routing revalidated',
            nowIso,
            activeTurn.id,
            TurnStatus.ASSIGNED,
            TurnStatus.ACCEPTED,
          ),
        );
        statements.push(
          d1TurnEvent(
            database,
            {
              appointmentId: current.appointmentId,
              appointmentServiceId: current.id,
              turnId: activeTurn.id,
              eventType: TurnEventType.SKIPPED,
              assignedStaffId: activeTurn.assignedStaffId,
              assignedStaffName: current.primaryStaff?.name ?? null,
              actorType: ActorType.ADMIN,
              actorId: input.adminId,
              reason: 'Service changed; routing revalidated',
            },
            nowIso,
          ),
        );
      }
    }

    const routePlan = await d1RouteAppointmentPlan(
      database,
      current.appointment as unknown as D1RouteAppointment,
      routedServices,
      businessDate,
    );
    const aggregate = d1AppointmentAggregate(current.appointment, routePlan.services);
    const totalAmount = routePlan.services
      .filter((service) => service.status !== AppointmentStatus.CANCELLED)
      .reduce((total, service) => total + toMinorUnits(service.amount), 0);
    statements.push(...routePlan.statements);
    statements.push(
      d1Statement(
        database,
        `INSERT INTO service_change_events
         (id, appointment_id, appointment_service_id, old_service_id, old_service_name, old_duration_min, old_amount, new_service_id, new_service_name, new_duration_min, new_amount, currency, reason, actor_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomId(),
        current.appointmentId,
        current.id,
        current.serviceId,
        current.serviceNameSnapshot,
        current.durationMinSnapshot,
        moneyFromMinorUnits(toMinorUnits(current.amount)),
        nextService.id,
        nextService.name,
        nextService.durationMin,
        moneyFromMinorUnits(toMinorUnits(nextService.price)),
        current.appointment.currency,
        reason,
        input.adminId,
        nowIso,
      ),
    );
    statements.push(
      d1Statement(
        database,
        `UPDATE appointments
         SET amount = ?, status = ?, service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, service_count = ?, primary_staff_id = ?, completed_at = CASE WHEN ? = ? THEN NULL ELSE completed_at END
         WHERE id = ? AND business_date = ?`,
        moneyFromMinorUnits(totalAmount),
        aggregate.status,
        aggregate.serviceId,
        aggregate.serviceNameSnapshot,
        aggregate.durationMinSnapshot,
        aggregate.serviceCount,
        aggregate.primaryStaffId,
        aggregate.status,
        AppointmentStatus.PAYMENT_PENDING,
        current.appointmentId,
        d1DateTimeValue(businessDate),
      ),
    );
    statements.push(
      d1AuditEvent(
        database,
        {
          action: 'appointment_service.changed',
          entity: 'AppointmentService',
          entityId: current.id,
          actorType: ActorType.ADMIN,
          actorId: input.adminId,
          metadata: {
            oldServiceId: current.serviceId,
            newServiceId: nextService.id,
            reason,
          },
        },
        nowIso,
      ),
    );
    statements.push(d1BumpBoardVersion(database, nowIso));
    if (input.idempotencyKey)
      statements.push(
        d1Statement(
          database,
          `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          randomId(),
          scope,
          input.idempotencyKey,
          JSON.stringify({ ok: true, appointmentId: current.appointmentId }),
          normalizedRequestHash,
          nowIso,
        ),
      );

    const results = (await database.batch(statements)) as D1BatchResult[];
    if (d1BatchChanges(results[guardedServiceUpdateIndex]) !== 1)
      throw new Error(
        'Appointment service changed before the update could be recorded; retry the command',
      );
    const updated = await prisma.appointment.findUnique({
      where: { id: current.appointmentId },
      include: appointmentInclude,
    });
    return {
      ok: true,
      appointment: updated ? mapAppointment(updated) : null,
      idempotent: false,
    };
  });
}

type D1BatchResult = { meta?: { changes?: number } };

function d1BatchChanges(result: unknown) {
  return Number((result as D1BatchResult | undefined)?.meta?.changes ?? 0);
}

// Prisma's D1 adapter serializes DateTime bind values as ISO timestamps with
// an explicit UTC offset. Direct SQL writes must use the same representation
// so Prisma equality filters can see rows created by the D1 batch paths.
function d1DateTimeValue(date: Date) {
  return date.toISOString().replace('Z', '+00:00');
}

async function d1NextAppointmentCode(database: D1DatabaseLike, businessDate: string) {
  await database
    .prepare(
      `INSERT INTO appointment_counters (business_date, next_sequence)
       VALUES (?, 2)
       ON CONFLICT(business_date) DO UPDATE SET next_sequence = next_sequence + 1`,
    )
    .bind(businessDate)
    .run();
  const row = await database
    .prepare('SELECT next_sequence - 1 AS sequence FROM appointment_counters WHERE business_date = ?')
    .bind(businessDate)
    .first<{ sequence: number }>();
  return `A${String(Number(row?.sequence ?? 1)).padStart(3, '0')}`;
}

async function d1CheckInTicket(
  tx: typeof prisma | Prisma.TransactionClient,
  appointmentId: string,
  businessDate: Date,
) {
  const saved = await tx.appointment.findUniqueOrThrow({ where: { id: appointmentId }, include: appointmentInclude });
  const staffRows = await staffForBusinessDate(tx, businessDate);
  return ticket(mapAppointment(saved), staffRows.map(mapStaff));
}

async function routeDbAppointmentD1(
  database: D1DatabaseLike,
  appointmentId: string,
  businessDate: Date,
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });
  if (!appointment) throw new Error('Appointment not found');
  const services = appointment.services.map((service) => ({
    ...service,
    turns: [...service.turns],
    turnExclusions: [...service.turnExclusions],
  })) as D1RouteService[];
  const routePlan = await d1RouteAppointmentPlan(
    database,
    appointment as unknown as D1RouteAppointment,
    services,
    businessDate,
  );
  const aggregate = d1AppointmentAggregate(appointment, routePlan.services);
  await database.batch([
    ...routePlan.statements,
    d1Statement(
      database,
      `UPDATE appointments
       SET status = ?, service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, service_count = ?, primary_staff_id = ?, completed_at = CASE WHEN ? = ? THEN NULL ELSE completed_at END
       WHERE id = ? AND business_date = ?`,
      aggregate.status,
      aggregate.serviceId,
      aggregate.serviceNameSnapshot,
      aggregate.durationMinSnapshot,
      aggregate.serviceCount,
      aggregate.primaryStaffId,
      aggregate.status,
      AppointmentStatus.PAYMENT_PENDING,
      appointment.id,
      d1DateTimeValue(businessDate),
    ),
  ]);
}

async function createDbCheckInD1Attempt(input: {
  serviceId?: string;
  serviceIds?: string[];
  phone: string;
  name: string;
  idempotencyKey?: string;
}) {
  return withD1Lease(async (database) => {
    const shopConfig = await prisma.shopConfig.findUnique({ where: { id: 1 }, select: { timezone: true, openingTime: true, closingTime: true, verifiedSessionTtlMin: true, currency: true, roundRobinEnabled: true } });
    const timezone = shopConfig?.timezone ?? SHOP_TIMEZONE;
    const openingTime = shopConfig?.openingTime ?? '09:00';
    const closingTime = shopConfig?.closingTime ?? '21:00';
    const now = new Date();
    const businessDate = currentBusinessDate(now, timezone);
    const idempotencyScope = `kiosk:${formatBusinessDate(businessDate)}`;
    const normalizedRequestHash = await requestHash({
      serviceId: input.serviceId ?? null,
      serviceIds: input.serviceIds ?? null,
      phone: normalizePhoneNumber(input.phone),
      name: input.name.trim(),
    });
    const prior = input.idempotencyKey
      ? await prisma.commandReceipt.findUnique({ where: { scope_key: { scope: idempotencyScope, key: input.idempotencyKey } } })
      : null;
    if (prior) {
      if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This check-in key was already used for different details');
      const receipt = prior.response as Prisma.JsonObject;
      if (typeof receipt.appointmentId !== 'string') return prior.response as unknown as ReturnType<typeof ticket>;
      if (receipt.state === 'ROUTING') {
        await routeDbAppointmentD1(database, receipt.appointmentId, businessDate);
        await database
          .prepare('UPDATE command_receipts SET response = ? WHERE id = ?')
          .bind(JSON.stringify({ state: 'COMPLETE', appointmentId: receipt.appointmentId }), prior.id)
          .run();
      }
      return d1CheckInTicket(prisma, receipt.appointmentId, businessDate);
    }
    if (!isWithinOperatingHours(now, { timezone, openingTime, closingTime })) throw new KioskCheckInClosedError(openingTime, closingTime, timezone);
    const requestedServiceIds = [...new Set(input.serviceIds?.length ? input.serviceIds : input.serviceId ? [input.serviceId] : [])];
    if (!requestedServiceIds.length) throw new Error('Choose at least one service');
    const services = await prisma.service.findMany({ where: activeCatalogServiceWhere(requestedServiceIds), include: { requiredSkills: { include: { skill: true } } } });
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const orderedServices = requestedServiceIds.map((serviceId) => serviceById.get(serviceId)).filter((service): service is NonNullable<typeof service> => Boolean(service));
    if (orderedServices.length !== requestedServiceIds.length) throw new Error('One or more selected services are unavailable');
    const phoneNormalized = normalizePhoneNumber(input.phone);
    const existingCustomer = await prisma.customer.findUnique({ where: { phoneNormalized }, select: { id: true } });
    const customerId = existingCustomer?.id ?? randomId();
    const appointmentId = randomId();
    const nowIso = now.toISOString();
    const businessDateIso = d1DateTimeValue(businessDate);
    const code = await d1NextAppointmentCode(database, businessDateIso);
    const totalAmount = moneyFromMinorUnits(orderedServices.reduce((total, service) => total + toMinorUnits(service.price), 0));
    const receiptResponse = { state: 'ROUTING', appointmentId };
    const statements = [
      d1Statement(database, `INSERT INTO customers (id, phone, phone_normalized, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(phone_normalized) DO UPDATE SET phone = excluded.phone, updated_at = excluded.updated_at`, customerId, input.phone, phoneNormalized, input.name.trim(), nowIso, nowIso),
      d1Statement(database, `INSERT INTO appointments (id, code, customer_id, customer_name_snapshot, service_id, service_name_snapshot, duration_min_snapshot, status, primary_staff_id, amount, currency, service_count, business_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`, appointmentId, code, customerId, input.name.trim(), orderedServices[0].id, orderedServices[0].name, orderedServices[0].durationMin, AppointmentStatus.CREATED, totalAmount, shopConfig?.currency ?? 'USD', orderedServices.length, businessDateIso, nowIso),
      ...orderedServices.map((service, index) => d1Statement(database, `INSERT INTO appointment_services (id, appointment_id, service_id, sequence, service_name_snapshot, duration_min_snapshot, amount, currency, status, primary_staff_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`, randomId(), appointmentId, service.id, index + 1, service.name, service.durationMin, moneyFromMinorUnits(toMinorUnits(service.price)), shopConfig?.currency ?? 'USD', AppointmentStatus.CREATED)),
      d1Statement(database, `INSERT INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`, randomId(), nowIso, ActorType.SYSTEM, 'appointment.checked_in', 'Appointment', appointmentId, JSON.stringify({ code, serviceIds: orderedServices.map((service) => service.id) })),
      ...(input.idempotencyKey ? [d1Statement(database, `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, randomId(), idempotencyScope, input.idempotencyKey, JSON.stringify(receiptResponse), normalizedRequestHash, nowIso)] : []),
      d1Statement(database, `INSERT INTO shop_config (id, timezone, opening_time, closing_time, verified_session_ttl_min, currency, round_robin_enabled, state_version, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state_version = shop_config.state_version + 1, updated_at = excluded.updated_at`, timezone, openingTime, closingTime, shopConfig?.verifiedSessionTtlMin ?? 3, shopConfig?.currency ?? 'USD', shopConfig?.roundRobinEnabled ?? true, nowIso, nowIso),
    ];
    await database.batch(statements);
    try {
      await routeDbAppointmentD1(database, appointmentId, businessDate);
      if (input.idempotencyKey)
        await database
          .prepare('UPDATE command_receipts SET response = ? WHERE scope = ? AND key = ?')
          .bind(JSON.stringify({ state: 'COMPLETE', appointmentId }), idempotencyScope, input.idempotencyKey)
          .run();
    } catch (error) {
      // The receipt intentionally remains in ROUTING state. A safe retry with
      // the same idempotency key repairs routing instead of creating a visit.
      throw error;
    }
    return d1CheckInTicket(prisma, appointmentId, businessDate);
  });
}

async function createDbCheckInD1(input: {
  serviceId?: string;
  serviceIds?: string[];
  phone: string;
  name: string;
  idempotencyKey?: string;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await createDbCheckInD1Attempt(input);
    } catch (error) {
      if (!(error instanceof Error) || !/appointments\.business_date, appointments\.code/.test(error.message)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
  throw new Error('A turn number conflict occurred. Please try joining again.');
}

async function confirmDbPaymentD1(input: {
  appointmentId: string;
  method: PaymentMethod;
  amount?: number;
  tip?: number;
  cashReceived?: number;
  idempotencyKey?: string;
  adminId?: string;
}) {
  const run = async (database: D1DatabaseLike) => {
    const db = prisma;
    const shopConfig = await db.shopConfig.findUnique({
      where: { id: 1 },
      select: {
        timezone: true,
        openingTime: true,
        closingTime: true,
        verifiedSessionTtlMin: true,
        currency: true,
        roundRobinEnabled: true,
      },
    });
    const businessDate = currentBusinessDate(new Date(), shopConfig?.timezone ?? SHOP_TIMEZONE);
    const appointment = await db.appointment.findUnique({
      where: { id: input.appointmentId },
      include: appointmentInclude,
    });
    if (!appointment) throw new Error('Appointment not found');
    const shouldReleaseCurrentStaff =
      formatBusinessDate(appointment.businessDate) === formatBusinessDate(businessDate);
    const finalAmount = roundMoney(input.amount ?? Number(appointment.amount));
    const tip = roundMoney(input.tip ?? 0);
    const originalAmount = roundMoney(Number(appointment.amount));
    const cashDetails = paymentCashDetails({ method: input.method, amount: finalAmount, tip, cashReceived: input.cashReceived });
    const idempotencyScope = `payment:${appointment.id}`;
    const normalizedRequestHash = await requestHash({ appointmentId: input.appointmentId, method: input.method, amount: finalAmount, tip, cashReceived: cashDetails.cashReceived });
    const prior = input.idempotencyKey ? await db.commandReceipt.findUnique({ where: { scope_key: { scope: idempotencyScope, key: input.idempotencyKey } } }) : null;
    if (prior) {
      if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This payment key was already used for different payment details');
      const stored = prior.response as Prisma.JsonObject;
      const savedAppointment = await db.appointment.findUnique({
        where: { id: appointment.id },
        include: appointmentInclude,
      });
      return { ok: true, appointment: savedAppointment ? mapAppointment(savedAppointment) : null, message: typeof stored.message === 'string' ? stored.message : 'Payment already confirmed', idempotent: true };
    }
    const appointmentStaffIds = [...new Set([appointment.primaryStaffId, ...appointment.services.map((service) => service.primaryStaffId), ...appointment.supportingStaff.map((staff) => staff.staffId)].filter((staffId): staffId is string => Boolean(staffId)))];
    if (appointment.payment) {
      const releaseStatements = shouldReleaseCurrentStaff
        ? d1ReleaseStaffStatements(database, businessDate, appointmentStaffIds)
        : [];
      if (input.idempotencyKey)
        releaseStatements.push(
          d1Statement(
            database,
            `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            randomId(),
            idempotencyScope,
            input.idempotencyKey,
            JSON.stringify({ ok: true, appointmentId: appointment.id, message: 'Payment already confirmed' }),
            normalizedRequestHash,
            d1DateTimeValue(new Date()),
          ),
        );
      if (releaseStatements.length) await database.batch(releaseStatements);
      const snapshot = await db.appointment.findUnique({
        where: { id: appointment.id },
        include: appointmentInclude,
      });
      const response = {
        ok: true,
        appointment: snapshot ? mapAppointment(snapshot) : null,
        message: 'Payment already confirmed',
      };
      return response;
    }
    if (!isAppointmentPaymentReady(appointment))
      throw new Error(
        'Appointment is not ready for payment: every completed service must have a specialist and completion record',
      );
    const payableServices = appointment.services.filter(
      (service) => service.status === AppointmentStatus.COMPLETED,
    );
    const admin = input.adminId ? await db.authUser.findUnique({ where: { id: input.adminId } }) : await db.authUser.findFirst({ where: { role: 'ADMIN', isActive: true } });
    if (!admin) throw new Error('Admin account not found');
    const paymentId = randomId();
    const nowIso = new Date().toISOString();
    const statements = [
      d1Statement(database, `INSERT INTO payments (id, appointment_id, amount, tip, currency, method, service_name_snapshot, staff_name_snapshot, confirmed_by_admin_id, confirmed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, paymentId, appointment.id, finalAmount, tip, appointment.currency, input.method, payableServices.map((service) => service.serviceNameSnapshot).join(' + '), payableServices.map((service) => service.primaryStaff?.name).filter(Boolean).join(', ') || null, admin.id, nowIso),
      ...payableServices.map((service) => d1Statement(database, `INSERT INTO payment_items (id, payment_id, appointment_service_id, service_name_snapshot, staff_name_snapshot, amount, currency)
        VALUES (?, ?, ?, ?, ?, ?, ?)`, randomId(), paymentId, service.id, service.serviceNameSnapshot, service.primaryStaff?.name ?? null, Number(service.amount), appointment.currency)),
      d1Statement(database, `UPDATE appointments SET status = ?, completed_at = ? WHERE id = ? AND status = ?`, AppointmentStatus.COMPLETED, nowIso, appointment.id, AppointmentStatus.PAYMENT_PENDING),
      ...(shouldReleaseCurrentStaff && appointmentStaffIds.length ? [d1Statement(database, `UPDATE staff_service_state
        SET availability = ?
        WHERE staff_id IN (${appointmentStaffIds.map(() => '?').join(', ')})
          AND availability = ?
          AND NOT EXISTS (
            SELECT 1 FROM appointment_services active_service
            JOIN appointments active_appointment ON active_appointment.id = active_service.appointment_id
            WHERE active_service.primary_staff_id = staff_service_state.staff_id
              AND active_service.status IN (?, ?)
              AND active_appointment.business_date = ?
          )
          AND NOT EXISTS (
            SELECT 1 FROM appointment_supporting_staff support
            JOIN appointments support_appointment ON support_appointment.id = support.appointment_id
            WHERE support.staff_id = staff_service_state.staff_id
              AND support.released_at IS NULL
              AND support_appointment.business_date = ?
              AND support_appointment.status IN (?, ?, ?)
          )`, Availability.AVAILABLE, ...appointmentStaffIds, Availability.BUSY, AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, d1DateTimeValue(businessDate), d1DateTimeValue(businessDate), AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, AppointmentStatus.PAYMENT_PENDING)] : []),
      d1Statement(database, `INSERT INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, randomId(), nowIso, ActorType.ADMIN, admin.id, 'payment.confirmed', 'Payment', paymentId, JSON.stringify({ method: input.method, originalAmount, amount: finalAmount, tip, cashReceived: cashDetails.cashReceived, changeGiven: cashDetails.changeGiven })),
      ...(input.idempotencyKey ? [d1Statement(database, `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`, randomId(), idempotencyScope, input.idempotencyKey, JSON.stringify({ ok: true, appointmentId: appointment.id, message: `Payment confirmed via ${input.method}` }), normalizedRequestHash, nowIso)] : []),
      d1Statement(database, `INSERT INTO shop_config (id, timezone, opening_time, closing_time, verified_session_ttl_min, currency, round_robin_enabled, state_version, created_at, updated_at)
        VALUES (1, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state_version = shop_config.state_version + 1, updated_at = excluded.updated_at`, shopConfig?.timezone ?? SHOP_TIMEZONE, shopConfig?.openingTime ?? '09:00', shopConfig?.closingTime ?? '21:00', shopConfig?.verifiedSessionTtlMin ?? 3, shopConfig?.currency ?? 'USD', shopConfig?.roundRobinEnabled ?? true, nowIso, nowIso),
    ];
    await database.batch(statements);
    const updated = await db.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    const response = { ok: true, appointment: updated ? mapAppointment(updated) : null, message: `Payment confirmed via ${input.method}` };
    return response;
  };
  return withD1Lease(run);
}

export async function createDbCheckIn(input: {
  serviceId?: string;
  serviceIds?: string[];
  phone: string;
  name: string;
  idempotencyKey?: string;
}) {
  if (await isD1Runtime()) return createDbCheckInD1(input);
  return prisma.$transaction(async (tx) => {
    const shopConfig = await tx.shopConfig.findUnique({
      where: { id: 1 },
      select: { timezone: true, openingTime: true, closingTime: true, currency: true },
    });
    const timezone = shopConfig?.timezone ?? SHOP_TIMEZONE;
    const openingTime = shopConfig?.openingTime ?? '09:00';
    const closingTime = shopConfig?.closingTime ?? '21:00';
    const now = new Date();
    const businessDate = currentBusinessDate(now, timezone);
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const idempotencyScope = `kiosk:${formatBusinessDate(businessDate)}`;
    const normalizedRequestHash = await requestHash({
      serviceId: input.serviceId ?? null,
      serviceIds: input.serviceIds ?? null,
      phone: normalizePhoneNumber(input.phone),
      name: input.name.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope: idempotencyScope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This check-in key was already used for different details');
        return prior.response as unknown as ReturnType<typeof ticket>;
      }
    }
    if (!isWithinOperatingHours(now, { timezone, openingTime, closingTime }))
      throw new KioskCheckInClosedError(openingTime, closingTime, timezone);
    const requestedServiceIds = [
      ...new Set(
        input.serviceIds?.length ? input.serviceIds : input.serviceId ? [input.serviceId] : [],
      ),
    ];
    if (!requestedServiceIds.length) throw new Error('Choose at least one service');
    const services = await tx.service.findMany({
      where: activeCatalogServiceWhere(requestedServiceIds),
      include: { requiredSkills: { include: { skill: true } } },
    });
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const orderedServices = requestedServiceIds
      .map((serviceId) => serviceById.get(serviceId))
      .filter((service): service is NonNullable<typeof service> => Boolean(service));
    if (orderedServices.length !== requestedServiceIds.length)
      throw new Error('One or more selected services are unavailable');
    const phoneNormalized = normalizePhoneNumber(input.phone);
    const currency = shopConfig?.currency ?? 'USD';
    const customerNameSnapshot = input.name.trim();
    const customer = await tx.customer.upsert({
      where: { phoneNormalized },
      update: { phone: input.phone, phoneNormalized },
      create: { phone: input.phone, phoneNormalized, name: customerNameSnapshot },
    });
    const code = await nextAppointmentCode(tx, businessDate);
    const totalAmount = moneyFromMinorUnits(orderedServices.reduce((total, service) => total + toMinorUnits(service.price), 0));
    const appointment = await tx.appointment.create({
      data: {
        code,
        customerId: customer.id,
        customerNameSnapshot,
        serviceId: orderedServices[0].id,
        serviceNameSnapshot: orderedServices[0].name,
        durationMinSnapshot: orderedServices[0].durationMin,
        status: AppointmentStatus.CREATED,
        primaryStaffId: null,
        amount: totalAmount,
        currency,
        serviceCount: orderedServices.length,
        businessDate,
      },
    });
    for (const [index, service] of orderedServices.entries()) {
      await tx.appointmentService.create({
        data: {
          appointmentId: appointment.id,
          serviceId: service.id,
          sequence: index + 1,
          serviceNameSnapshot: service.name,
          durationMinSnapshot: service.durationMin,
          amount: service.price,
          currency,
          status: AppointmentStatus.CREATED,
          primaryStaffId: null,
        },
      });
    }
    await routeAppointmentServices(tx, appointment.id, businessDate);
    await tx.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'appointment.checked_in',
        entity: 'Appointment',
        entityId: appointment.id,
        metadata: {
          code: appointment.code,
          serviceIds: orderedServices.map((service) => service.id),
        },
      },
    });
    const saved = await tx.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    const staffRows = await staffForBusinessDate(tx, businessDate);
    const response = ticket(mapAppointment(saved), staffRows.map(mapStaff));
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: {
          scope: idempotencyScope,
          key: input.idempotencyKey,
          requestHash: normalizedRequestHash,
          response,
        },
      });
    await bumpBoardVersion(tx);
    return response;
  });
}

export async function confirmDbPayment(input: {
  appointmentId: string;
  method: PaymentMethod;
  amount?: number;
  tip?: number;
  cashReceived?: number;
  idempotencyKey?: string;
  adminId?: string;
}) {
  if (await isD1Runtime())
    return confirmDbPaymentD1(input);
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const appointment = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
      include: appointmentInclude,
    });
    if (!appointment) throw new Error('Appointment not found');
    const shouldReleaseCurrentStaff =
      formatBusinessDate(appointment.businessDate) === formatBusinessDate(businessDate);
    const finalAmount = roundMoney(input.amount ?? Number(appointment.amount));
    const tip = roundMoney(input.tip ?? 0);
    const originalAmount = roundMoney(Number(appointment.amount));
    const cashDetails = paymentCashDetails({
      method: input.method,
      amount: finalAmount,
      tip,
      cashReceived: input.cashReceived,
    });
    const idempotencyScope = `payment:${appointment.id}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      method: input.method,
      amount: finalAmount,
      tip,
      cashReceived: cashDetails.cashReceived,
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope: idempotencyScope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This payment key was already used for different payment details');
        const stored = prior.response as Prisma.JsonObject;
        const savedAppointment = await tx.appointment.findUnique({
          where: { id: appointment.id },
          include: appointmentInclude,
        });
        return {
          ok: true,
          appointment: savedAppointment,
          message:
            typeof stored.message === 'string' ? stored.message : 'Payment already confirmed',
          idempotent: true,
        };
      }
    }
    const appointmentStaffIds = [
      ...new Set(
        [
          appointment.primaryStaffId,
          ...appointment.services.map((service) => service.primaryStaffId),
          ...appointment.supportingStaff.map((staff) => staff.staffId),
        ].filter((staffId): staffId is string => Boolean(staffId)),
      ),
    ];
    if (appointment.payment) {
      if (shouldReleaseCurrentStaff)
        await releaseCompletedAppointmentStaff(tx, businessDate, appointmentStaffIds);
      const response = {
        ok: true,
        appointment: mapAppointment(appointment),
        message: 'Payment already confirmed',
      };
      if (input.idempotencyKey)
        await tx.commandReceipt.create({
          data: {
            scope: idempotencyScope,
            key: input.idempotencyKey,
            requestHash: normalizedRequestHash,
            response: { ok: true, appointmentId: appointment.id, message: response.message },
          },
        });
      return response;
    }
    if (!isAppointmentPaymentReady(appointment))
      throw new Error(
        'Appointment is not ready for payment: every completed service must have a specialist and completion record',
      );
    const payableServices = appointment.services.filter(
      (service) => service.status === AppointmentStatus.COMPLETED,
    );
    const admin = input.adminId
      ? await tx.authUser.findUnique({ where: { id: input.adminId } })
      : await tx.authUser.findFirst({ where: { role: 'ADMIN', isActive: true } });
    if (!admin) throw new Error('Admin account not found');
    const payment = await tx.payment.create({
      data: {
        id: randomId(),
        appointmentId: appointment.id,
        amount: finalAmount,
        tip,
        currency: appointment.currency,
        method: input.method,
        serviceNameSnapshot: payableServices
          .map((service) => service.serviceNameSnapshot)
          .join(' + '),
        staffNameSnapshot:
          payableServices
            .map((service) => service.primaryStaff?.name)
            .filter(Boolean)
            .join(', ') || null,
        confirmedByAdminId: admin.id,
        confirmedAt: new Date(),
        items: {
          create: payableServices.map((service) => ({
            appointmentServiceId: service.id,
            serviceNameSnapshot: service.serviceNameSnapshot,
            staffNameSnapshot: service.primaryStaff?.name ?? null,
            amount: service.amount,
            currency: appointment.currency,
          })),
        },
      },
    });
    const updated = await tx.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.COMPLETED, completedAt: new Date() },
      include: appointmentInclude,
    });
    if (shouldReleaseCurrentStaff)
      await releaseCompletedAppointmentStaff(tx, businessDate, appointmentStaffIds);
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'payment.confirmed',
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          method: input.method,
          originalAmount,
          amount: finalAmount,
          tip,
          cashReceived: cashDetails.cashReceived,
          changeGiven: cashDetails.changeGiven,
        },
      },
    });
    const response = {
      ok: true,
      appointment: mapAppointment(updated),
      message: `Payment confirmed via ${input.method}`,
    };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: {
          scope: idempotencyScope,
          key: input.idempotencyKey,
          requestHash: normalizedRequestHash,
          response: { ok: true, appointmentId: updated.id, message: response.message },
        },
      });
    await bumpBoardVersion(tx);
    return response;
  });
}

export async function getDbPaymentHistory(appointmentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { appointmentId },
    include: {
      appointment: {
        select: {
          id: true,
          code: true,
          amount: true,
          businessDate: true,
          customerNameSnapshot: true,
          customer: { select: { name: true } },
        },
      },
      confirmedByAdmin: { select: { id: true, email: true } },
    },
  });
  if (!payment) throw new Error('Payment not found');

  const events = await prisma.auditEvent.findMany({
    where: {
      entity: 'Payment',
      action: {
        in: ['payment.confirmed', 'payment.adjusted', 'payment.corrected', 'payment.refunded'],
      },
      OR: [{ entityId: payment.id }, { entityId: appointmentId }],
    },
    orderBy: [{ ts: 'asc' }, { id: 'asc' }],
    select: { id: true, ts: true, actorType: true, actorId: true, action: true, metadata: true },
  });
  const actorIds = [
    ...new Set(
      events.map((event) => event.actorId).filter((actorId): actorId is string => Boolean(actorId)),
    ),
  ];
  const actors = actorIds.length
    ? await prisma.authUser.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, email: true },
      })
    : [];
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.email]));
  const hasConfirmationEvent = events.some((event) => event.action === 'payment.confirmed');
  const historyEvents = events.map((event) => ({
    id: event.id,
    action: event.action,
    actorName: event.actorId ? (actorNames.get(event.actorId) ?? event.actorType) : event.actorType,
    createdAt: event.ts,
    metadata: event.metadata,
  }));
  if (!hasConfirmationEvent) {
    historyEvents.unshift({
      id: `payment-confirmed-${payment.id}`,
      action: 'payment.confirmed',
      actorName: payment.confirmedByAdmin?.email ?? 'Administrator',
      createdAt: payment.confirmedAt ?? payment.appointment.businessDate,
      metadata: {
        method: payment.method,
        amount: Number(payment.amount),
        tip: Number(payment.tip),
      },
    });
  }

  const latestPaymentState = [...historyEvents]
    .reverse()
    .find((event) =>
      ['payment.confirmed', 'payment.adjusted', 'payment.corrected'].includes(event.action),
    );
  const latestPaymentStateMetadata = paymentAuditCurrentMetadata(latestPaymentState?.metadata);
  const cashReceived = paymentAuditOptionalNumber(latestPaymentStateMetadata, 'cashReceived');
  const changeGiven = roundMoney(paymentAuditNumber(latestPaymentStateMetadata, 'changeGiven'));
  const refundedAmount = roundMoney(
    historyEvents
      .filter((event) => event.action === 'payment.refunded')
      .reduce((total, event) => total + paymentAuditNumber(event.metadata, 'amount'), 0),
  );
  const total = roundMoney(Number(payment.amount) + Number(payment.tip));
  const refundableAmount = roundMoney(Math.max(0, total - refundedAmount));
  const status =
    refundableAmount === 0 ? 'REFUNDED' : refundedAmount > 0 ? 'PARTIALLY_REFUNDED' : 'PAID';
  return {
    payment: {
      id: payment.id,
      appointmentId: payment.appointment.id,
      code: payment.appointment.code,
      customerName:
        payment.appointment.customerNameSnapshot || payment.appointment.customer.name,
      originalAmount: Number(payment.appointment.amount),
      amount: Number(payment.amount),
      tip: Number(payment.tip),
      total,
      method: payment.method,
      cashReceived,
      changeGiven,
      confirmedAt: payment.confirmedAt,
      confirmedBy: payment.confirmedByAdmin?.email ?? 'Administrator',
      refundedAmount,
      refundableAmount,
      status,
    },
    events: historyEvents,
  };
}

async function adjustDbPaymentD1(input: {
  appointmentId: string;
  method: PaymentMethod;
  amount: number;
  tip: number;
  cashReceived?: number;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  return withD1Lease(async (database) => {
    const payment = await prisma.payment.findUnique({
      where: { appointmentId: input.appointmentId },
      include: { appointment: { select: { businessDate: true } } },
    });
    if (!payment) throw new Error('Payment not found');
    const amount = roundMoney(input.amount);
    const tip = roundMoney(input.tip);
    const cashDetails = paymentCashDetails({
      method: input.method,
      amount,
      tip,
      cashReceived: input.cashReceived,
    });
    const scope = `payment-adjustment:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      method: input.method,
      amount,
      tip,
      cashReceived: cashDetails.cashReceived,
      reason: input.reason.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await prisma.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This adjustment key was already used for different payment details');
        return { ok: true, message: 'Payment adjustment already recorded', idempotent: true };
      }
    }
    const admin = await prisma.authUser.findUnique({ where: { id: input.adminId } });
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive)
      throw new Error('Admin account not found');
    const latestEvent = await prisma.auditEvent.findFirst({
      where: {
        entity: 'Payment',
        entityId: payment.id,
        action: { in: ['payment.confirmed', 'payment.adjusted', 'payment.corrected'] },
      },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
      select: { metadata: true },
    });
    const previousMetadata = paymentAuditCurrentMetadata(latestEvent?.metadata);
    const previousCashReceived = paymentAuditOptionalNumber(previousMetadata, 'cashReceived');
    const previousChangeGiven = roundMoney(paymentAuditNumber(previousMetadata, 'changeGiven'));
    const previous = {
      amount: Number(payment.amount),
      method: payment.method,
      tip: Number(payment.tip),
      cashReceived: previousCashReceived,
      changeGiven: previousChangeGiven,
    };
    const current = {
      amount,
      method: input.method,
      tip,
      cashReceived: cashDetails.cashReceived,
      changeGiven: cashDetails.changeGiven,
    };
    if (
      previous.amount === current.amount &&
      previous.method === current.method &&
      previous.tip === current.tip &&
      previous.cashReceived === current.cashReceived &&
      previous.changeGiven === current.changeGiven
    )
      throw new Error('No payment details changed');
    const now = new Date();
    const nowIso = now.toISOString();
    const statements = [
      d1Statement(
        database,
        `UPDATE payments
         SET amount = ?, method = ?, tip = ?
         WHERE id = ? AND amount = ? AND method = ? AND tip = ?`,
        amount,
        input.method,
        tip,
        payment.id,
        previous.amount,
        previous.method,
        previous.tip,
      ),
      d1Statement(
        database,
        `INSERT INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomId(),
        nowIso,
        ActorType.ADMIN,
        admin.id,
        'payment.adjusted',
        'Payment',
        payment.id,
        JSON.stringify({ reason: input.reason.trim(), previous, current }),
      ),
      ...(input.idempotencyKey
        ? [
            d1Statement(
              database,
              `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              randomId(),
              scope,
              input.idempotencyKey,
              JSON.stringify({ ok: true, message: 'Payment adjusted', idempotent: false }),
              normalizedRequestHash,
              nowIso,
            ),
          ]
        : []),
    ];
    const results = (await database.batch(statements)) as D1BatchResult[];
    if (d1BatchChanges(results[0]) !== 1)
      throw new Error('Payment changed before the adjustment could be recorded; retry the command');
    return { ok: true, message: 'Payment adjusted', idempotent: false };
  });
}

async function correctDbPaymentD1(input: {
  appointmentId: string;
  method: PaymentMethod;
  tip: number;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  return withD1Lease(async (database) => {
    const payment = await prisma.payment.findUnique({
      where: { appointmentId: input.appointmentId },
      include: { appointment: { select: { businessDate: true } } },
    });
    if (!payment) throw new Error('Payment not found');
    const scope = `payment-correction:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      method: input.method,
      tip: input.tip,
      reason: input.reason,
    });
    if (input.idempotencyKey) {
      const prior = await prisma.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This correction key was already used for different payment details');
        return { ok: true, message: 'Payment record already corrected', idempotent: true };
      }
    }
    const admin = await prisma.authUser.findUnique({ where: { id: input.adminId } });
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive)
      throw new Error('Admin account not found');
    if (payment.method === input.method && Number(payment.tip) === input.tip)
      throw new Error('No payment details changed');
    const now = new Date();
    const nowIso = now.toISOString();
    const updated = {
      method: input.method,
      tip: input.tip,
    };
    const statements = [
      d1Statement(
        database,
        `UPDATE payments SET method = ?, tip = ?
         WHERE id = ? AND method = ? AND tip = ?`,
        input.method,
        input.tip,
        payment.id,
        payment.method,
        Number(payment.tip),
      ),
      d1Statement(
        database,
        `INSERT INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomId(),
        nowIso,
        ActorType.ADMIN,
        admin.id,
        'payment.corrected',
        'Payment',
        payment.id,
        JSON.stringify({
          reason: input.reason,
          previous: { method: payment.method, tip: Number(payment.tip) },
          current: updated,
        }),
      ),
      ...(input.idempotencyKey
        ? [
            d1Statement(
              database,
              `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              randomId(),
              scope,
              input.idempotencyKey,
              JSON.stringify({ ok: true, message: 'Payment record corrected', idempotent: false }),
              normalizedRequestHash,
              nowIso,
            ),
          ]
        : []),
    ];
    const results = (await database.batch(statements)) as D1BatchResult[];
    if (d1BatchChanges(results[0]) !== 1)
      throw new Error('Payment changed before the correction could be recorded; retry the command');
    return { ok: true, message: 'Payment record corrected', idempotent: false };
  });
}

async function refundDbPaymentD1(input: {
  appointmentId: string;
  amount: number;
  refundMethod: PaymentMethod;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  return withD1Lease(async (database) => {
    const payment = await prisma.payment.findUnique({
      where: { appointmentId: input.appointmentId },
      include: { appointment: { select: { businessDate: true } } },
    });
    if (!payment) throw new Error('Payment not found');
    const scope = `payment-refund:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      amount: input.amount,
      refundMethod: input.refundMethod,
      reason: input.reason,
    });
    if (input.idempotencyKey) {
      const prior = await prisma.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This refund key was already used for different payment details');
        return { ok: true, message: 'Refund already recorded', idempotent: true };
      }
    }
    const refundEvents = await prisma.auditEvent.findMany({
      where: { entity: 'Payment', entityId: payment.id, action: 'payment.refunded' },
      select: { metadata: true },
    });
    const refundedAmount = refundEvents.reduce(
      (total, event) => total + paymentAuditNumber(event.metadata, 'amount'),
      0,
    );
    const refundableAmount = roundMoney(
      Math.max(0, Number(payment.amount) + Number(payment.tip) - refundedAmount),
    );
    if (input.amount > refundableAmount)
      throw new Error(
        `Refund cannot exceed the remaining refundable amount of ${refundableAmount.toFixed(2)}`,
      );
    const admin = await prisma.authUser.findUnique({ where: { id: input.adminId } });
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive)
      throw new Error('Admin account not found');
    const now = new Date();
    const nowIso = now.toISOString();
    const response = {
      ok: true,
      message: `Refund of ${input.amount.toFixed(2)} recorded`,
      idempotent: false,
    };
    const statements = [
      d1Statement(
        database,
        `INSERT INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        randomId(),
        nowIso,
        ActorType.ADMIN,
        admin.id,
        'payment.refunded',
        'Payment',
        payment.id,
        JSON.stringify({
          amount: input.amount,
          reason: input.reason,
          method: payment.method,
          refundMethod: input.refundMethod,
          previousRefundedAmount: roundMoney(refundedAmount),
          remainingRefundableAmount: roundMoney(refundableAmount - input.amount),
        }),
      ),
      ...(input.idempotencyKey
        ? [
            d1Statement(
              database,
              `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
              randomId(),
              scope,
              input.idempotencyKey,
              JSON.stringify(response),
              normalizedRequestHash,
              nowIso,
            ),
          ]
        : []),
    ];
    await database.batch(statements);
    return response;
  });
}

export async function adjustDbPayment(input: {
  appointmentId: string;
  method: PaymentMethod;
  amount: number;
  tip: number;
  cashReceived?: number;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  if (await isD1Runtime()) return adjustDbPaymentD1(input);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { appointmentId: input.appointmentId },
      include: { appointment: { select: { businessDate: true } } },
    });
    if (!payment) throw new Error('Payment not found');
    await lockShopBusinessDate(tx, payment.appointment.businessDate.toISOString());
    const amount = roundMoney(input.amount);
    const tip = roundMoney(input.tip);
    const cashDetails = paymentCashDetails({
      method: input.method,
      amount,
      tip,
      cashReceived: input.cashReceived,
    });
    const scope = `payment-adjustment:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      method: input.method,
      amount,
      tip,
      cashReceived: cashDetails.cashReceived,
      reason: input.reason.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This adjustment key was already used for different payment details');
        return { ok: true, message: 'Payment adjustment already recorded', idempotent: true };
      }
    }
    const admin = await tx.authUser.findUnique({ where: { id: input.adminId } });
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive)
      throw new Error('Admin account not found');
    const latestEvent = await tx.auditEvent.findFirst({
      where: {
        entity: 'Payment',
        entityId: payment.id,
        action: { in: ['payment.confirmed', 'payment.adjusted', 'payment.corrected'] },
      },
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
      select: { metadata: true },
    });
    const previousMetadata = paymentAuditCurrentMetadata(latestEvent?.metadata);
    const previousCashReceived = paymentAuditOptionalNumber(previousMetadata, 'cashReceived');
    const previousChangeGiven = roundMoney(paymentAuditNumber(previousMetadata, 'changeGiven'));
    const previous = {
      amount: Number(payment.amount),
      method: payment.method,
      tip: Number(payment.tip),
      cashReceived: previousCashReceived,
      changeGiven: previousChangeGiven,
    };
    const current = {
      amount,
      method: input.method,
      tip,
      cashReceived: cashDetails.cashReceived,
      changeGiven: cashDetails.changeGiven,
    };
    if (
      previous.amount === current.amount &&
      previous.method === current.method &&
      previous.tip === current.tip &&
      previous.cashReceived === current.cashReceived &&
      previous.changeGiven === current.changeGiven
    )
      throw new Error('No payment details changed');
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { amount, method: input.method, tip },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'payment.adjusted',
        entity: 'Payment',
        entityId: payment.id,
        metadata: { reason: input.reason.trim(), previous, current },
      },
    });
    const response = { ok: true, message: 'Payment adjusted', idempotent: false };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response },
      });
    return response;
  });
}

export async function correctDbPayment(input: {
  appointmentId: string;
  method: PaymentMethod;
  tip: number;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  if (await isD1Runtime()) return correctDbPaymentD1(input);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { appointmentId: input.appointmentId },
      include: { appointment: { select: { businessDate: true } } },
    });
    if (!payment) throw new Error('Payment not found');
    await lockShopBusinessDate(tx, payment.appointment.businessDate.toISOString());
    const scope = `payment-correction:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      method: input.method,
      tip: input.tip,
      reason: input.reason,
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This correction key was already used for different payment details');
        return { ok: true, message: 'Payment record already corrected', idempotent: true };
      }
    }
    const admin = await tx.authUser.findUnique({ where: { id: input.adminId } });
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive)
      throw new Error('Admin account not found');
    if (payment.method === input.method && Number(payment.tip) === input.tip)
      throw new Error('No payment details changed');
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: { method: input.method, tip: input.tip },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'payment.corrected',
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          reason: input.reason,
          previous: { method: payment.method, tip: Number(payment.tip) },
          current: { method: updated.method, tip: Number(updated.tip) },
        },
      },
    });
    const response = { ok: true, message: 'Payment record corrected', idempotent: false };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response },
      });
    return response;
  });
}

export async function refundDbPayment(input: {
  appointmentId: string;
  amount: number;
  refundMethod: PaymentMethod;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  if (await isD1Runtime()) return refundDbPaymentD1(input);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { appointmentId: input.appointmentId },
      include: { appointment: { select: { businessDate: true } } },
    });
    if (!payment) throw new Error('Payment not found');
    await lockShopBusinessDate(tx, payment.appointment.businessDate.toISOString());
    const scope = `payment-refund:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      amount: input.amount,
      refundMethod: input.refundMethod,
      reason: input.reason,
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This refund key was already used for different payment details');
        return { ok: true, message: 'Refund already recorded', idempotent: true };
      }
    }
    const refundEvents = await tx.auditEvent.findMany({
      where: { entity: 'Payment', entityId: payment.id, action: 'payment.refunded' },
      select: { metadata: true },
    });
    const refundedAmount = refundEvents.reduce(
      (total, event) => total + paymentAuditNumber(event.metadata, 'amount'),
      0,
    );
    const refundableAmount = roundMoney(
      Math.max(0, Number(payment.amount) + Number(payment.tip) - refundedAmount),
    );
    if (input.amount > refundableAmount)
      throw new Error(
        `Refund cannot exceed the remaining refundable amount of ${refundableAmount.toFixed(2)}`,
      );
    const admin = await tx.authUser.findUnique({ where: { id: input.adminId } });
    if (!admin || admin.role !== 'ADMIN' || !admin.isActive)
      throw new Error('Admin account not found');
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: admin.id,
        action: 'payment.refunded',
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          amount: input.amount,
          reason: input.reason,
          method: payment.method,
          refundMethod: input.refundMethod,
          previousRefundedAmount: roundMoney(refundedAmount),
          remainingRefundableAmount: roundMoney(refundableAmount - input.amount),
        },
      },
    });
    const response = {
      ok: true,
      message: `Refund of ${input.amount.toFixed(2)} recorded`,
      idempotent: false,
    };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response },
      });
    return response;
  });
}

type CancellationInput = {
  appointmentId: string;
  appointmentServiceId?: string;
  scope: 'SERVICE' | 'VISIT';
  reason: string;
  confirmed?: boolean;
  idempotencyKey?: string;
  adminId: string;
};

async function cancelDbAppointmentD1(input: CancellationInput, businessDate: Date) {
  return withD1Lease(async (database) => {
    const scope = `cancel:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({ appointmentId: input.appointmentId, appointmentServiceId: input.appointmentServiceId ?? null, scope: input.scope, reason: input.reason.trim(), confirmed: input.confirmed === true });
    if (input.idempotencyKey) {
      const prior = await prisma.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This cancellation key was already used for different details');
        const existing = await prisma.appointment.findUnique({ where: { id: input.appointmentId }, include: appointmentInclude });
        return { ok: true, appointment: existing ? mapAppointment(existing) : null, idempotent: true };
      }
    }
    const appointment = await prisma.appointment.findFirst({ where: { id: input.appointmentId, businessDate }, include: appointmentInclude });
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.payment || appointment.status === AppointmentStatus.PAYMENT_PENDING || appointment.status === AppointmentStatus.COMPLETED)
      throw new Error('Paid or payment-pending appointments cannot be cancelled');
    if (input.scope === 'SERVICE' && !input.appointmentServiceId) throw new Error('Choose a service to cancel');
    if (input.scope === 'VISIT' && input.appointmentServiceId) throw new Error('Choose either a service or the whole visit');
    const targetIds = input.scope === 'VISIT' ? appointment.services.map((service) => service.id) : [input.appointmentServiceId as string];
    const targets = appointment.services.filter((service) => targetIds.includes(service.id));
    if (!targets.length) throw new Error('Appointment service not found');
    if (targets.some((service) => service.status === AppointmentStatus.COMPLETED || service.status === AppointmentStatus.PAYMENT_PENDING || service.status === AppointmentStatus.CANCELLED))
      throw new Error('Completed, paid, or already cancelled service cannot be cancelled');
    if (targets.some((service) => service.status === AppointmentStatus.IN_SERVICE) && input.confirmed !== true)
      throw new Error('In-service cancellation requires explicit confirmation');
    const reason = input.reason.trim();
    const participatingStaffIds = [...new Set([...targets.map((service) => service.primaryStaffId), ...appointment.supportingStaff.map((member) => member.staffId)].filter((staffId): staffId is string => Boolean(staffId)))];
    const cancelsEntireVisit = input.scope === 'VISIT' || appointment.services.every((service) => targetIds.includes(service.id));
    const otherActivePrimary = await prisma.appointmentService.findMany({ where: { id: { notIn: targetIds }, primaryStaffId: { in: participatingStaffIds }, status: { in: staffBusyAppointmentStatuses }, appointment: { businessDate } }, select: { primaryStaffId: true } });
    const otherActiveSupport = await prisma.appointmentSupportingStaff.findMany({ where: { appointmentId: { not: appointment.id }, staffId: { in: participatingStaffIds }, releasedAt: null, appointment: { businessDate, status: { in: checkoutBlockingAppointmentStatuses } } }, select: { staffId: true } });
    const stillBusyStaffIds = new Set([...otherActivePrimary.map((row) => row.primaryStaffId), ...otherActiveSupport.map((row) => row.staffId)].filter((staffId): staffId is string => Boolean(staffId)));
    const releasableStaffIds = participatingStaffIds.filter((staffId) => !stillBusyStaffIds.has(staffId));
    const cancelledAt = new Date();
    const cancelledAtIso = d1DateTimeValue(cancelledAt);
    const nextServices = appointment.services.map((service) => targetIds.includes(service.id) ? { ...service, status: AppointmentStatus.CANCELLED, primaryStaffId: null } : service);
    const routePlan = await d1RouteAppointmentPlan(database, appointment, nextServices, businessDate, { releasedStaffIds: releasableStaffIds });
    const aggregate = d1AppointmentAggregate(appointment, routePlan.services);
    const totalAmount = appointment.services.filter((service) => !targetIds.includes(service.id) && service.status !== AppointmentStatus.CANCELLED).reduce((total, service) => total + toMinorUnits(service.amount), 0);
    const statements = [] as ReturnType<typeof d1Statement>[];
    for (const service of targets) {
      const activeTurns = service.turns.filter((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
      for (const turn of activeTurns) {
        statements.push(d1Statement(database, `UPDATE turns SET status = ?, reason = ?, ended_at = ? WHERE id = ? AND status = ?`, TurnStatus.SKIPPED, reason, cancelledAtIso, turn.id, turn.status));
        statements.push(d1TurnEvent(database, { appointmentId: appointment.id, appointmentServiceId: service.id, turnId: turn.id, eventType: TurnEventType.CANCELLED, assignedStaffId: turn.assignedStaffId, assignedStaffName: service.primaryStaff?.name ?? null, actorType: ActorType.ADMIN, actorId: input.adminId, reason }, cancelledAtIso));
      }
      statements.push(d1Statement(database, `UPDATE appointment_services SET status = ?, primary_staff_id = NULL, cancelled_at = ?, cancelled_reason = ?, cancelled_by_type = ?, cancelled_by_id = ? WHERE id = ? AND status = ?`, AppointmentStatus.CANCELLED, cancelledAtIso, reason, ActorType.ADMIN, input.adminId, service.id, service.status));
    }
    const supportingRelease = cancelsEntireVisit
      ? [d1Statement(database, `UPDATE appointment_supporting_staff SET released_at = ? WHERE appointment_id = ? AND released_at IS NULL`, cancelledAtIso, appointment.id)]
      : [];
    statements.push(...supportingRelease);
    statements.push(...d1ReleaseStaffStatements(database, businessDate, releasableStaffIds));
    statements.push(...routePlan.statements);
    const appointmentStatementIndex = statements.length;
    statements.push(d1Statement(database, `UPDATE appointments SET amount = ?, status = ?, service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, service_count = ?, primary_staff_id = ?, ${cancelsEntireVisit ? 'cancelled_at = ?, cancelled_reason = ?, cancelled_by_type = ?, cancelled_by_id = ?,' : ''} completed_at = CASE WHEN ? = ? THEN NULL ELSE completed_at END WHERE id = ? AND business_date = ?`, totalAmount ? moneyFromMinorUnits(totalAmount) : 0, aggregate.status, aggregate.serviceId, aggregate.serviceNameSnapshot, aggregate.durationMinSnapshot, aggregate.serviceCount, aggregate.primaryStaffId, ...(cancelsEntireVisit ? [cancelledAtIso, reason, ActorType.ADMIN, input.adminId] : []), aggregate.status, AppointmentStatus.PAYMENT_PENDING, appointment.id, d1DateTimeValue(businessDate)));
    statements.push(d1AuditEvent(database, { action: input.scope === 'VISIT' ? 'appointment.cancelled' : 'appointment_service.cancelled', entity: input.scope === 'VISIT' ? 'Appointment' : 'AppointmentService', entityId: input.scope === 'VISIT' ? appointment.id : targets[0].id, actorId: input.adminId, actorType: ActorType.ADMIN, metadata: { reason, scope: input.scope, appointmentServiceIds: targets.map((service) => service.id) } }, cancelledAtIso));
    statements.push(d1BumpBoardVersion(database, cancelledAtIso));
    if (input.idempotencyKey)
      statements.push(d1Statement(database, `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`, randomId(), scope, input.idempotencyKey, JSON.stringify({ ok: true, appointmentId: appointment.id, scope: input.scope }), normalizedRequestHash, cancelledAtIso));
    const results = (await database.batch(statements)) as D1BatchResult[];
    if (d1BatchChanges(results[appointmentStatementIndex]) !== 1)
      throw new Error('Appointment changed before cancellation could be recorded; retry the command');
    const updated = await prisma.appointment.findUnique({ where: { id: appointment.id }, include: appointmentInclude });
    return { ok: true, appointment: updated ? mapAppointment(updated) : null, idempotent: false };
  });
}

export async function cancelDbAppointment(input: CancellationInput) {
  const businessDate = await currentDbBusinessDate();
  if (await isD1Runtime()) return cancelDbAppointmentD1(input, businessDate);
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `cancel:${input.appointmentId}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      appointmentServiceId: input.appointmentServiceId ?? null,
      scope: input.scope,
      reason: input.reason.trim(),
      confirmed: input.confirmed === true,
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This cancellation key was already used for different details');
        const existing = await tx.appointment.findUnique({
          where: { id: input.appointmentId },
          include: appointmentInclude,
        });
        return {
          ok: true,
          appointment: existing ? mapAppointment(existing) : null,
          idempotent: true,
        };
      }
    }
    const appointment = await tx.appointment.findFirst({
      where: { id: input.appointmentId, businessDate },
      include: appointmentInclude,
    });
    if (!appointment) throw new Error('Appointment not found');
    if (
      appointment.payment ||
      appointment.status === AppointmentStatus.PAYMENT_PENDING ||
      appointment.status === AppointmentStatus.COMPLETED
    )
      throw new Error('Paid or payment-pending appointments cannot be cancelled');
    if (input.scope === 'SERVICE' && !input.appointmentServiceId)
      throw new Error('Choose a service to cancel');
    if (input.scope === 'VISIT' && input.appointmentServiceId)
      throw new Error('Choose either a service or the whole visit');

    const targets =
      input.scope === 'VISIT'
        ? appointment.services
        : appointment.services.filter((service) => service.id === input.appointmentServiceId);
    if (!targets.length) throw new Error('Appointment service not found');
    if (
      targets.some(
        (service) =>
          service.status === AppointmentStatus.COMPLETED ||
          service.status === AppointmentStatus.PAYMENT_PENDING ||
          service.status === AppointmentStatus.CANCELLED,
      )
    )
      throw new Error('Completed, paid, or already cancelled service cannot be cancelled');
    if (
      targets.some((service) => service.status === AppointmentStatus.IN_SERVICE) &&
      input.confirmed !== true
    )
      throw new Error('In-service cancellation requires explicit confirmation');

    const participatingStaffIds = [
      ...new Set(
        [
          ...targets.map((service) => service.primaryStaffId),
          ...appointment.supportingStaff.map((member) => member.staffId),
        ].filter((staffId): staffId is string => Boolean(staffId)),
      ),
    ];
    const cancelledAt = new Date();
    for (const service of targets) {
      const activeTurns = service.turns.filter(
        (turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED,
      );
      for (const turn of activeTurns) {
        await tx.turn.update({
          where: { id: turn.id },
          data: {
            status: transitionTurn(turn.status, TurnStatus.SKIPPED),
            reason: input.reason.trim(),
            endedAt: cancelledAt,
          },
        });
        await recordTurnEvent(tx, {
          appointmentId: appointment.id,
          appointmentServiceId: service.id,
          turnId: turn.id,
          eventType: TurnEventType.CANCELLED,
          assignedStaffId: turn.assignedStaffId,
          assignedStaffName: service.primaryStaff?.name ?? null,
          actorType: ActorType.ADMIN,
          actorId: input.adminId,
          reason: input.reason,
        });
      }
      await tx.appointmentService.update({
        where: { id: service.id },
        data: {
          status: transitionAppointment(service.status, AppointmentStatus.CANCELLED),
          primaryStaffId: null,
          cancelledAt,
          cancelledReason: input.reason.trim(),
          cancelledByType: 'ADMIN',
          cancelledById: input.adminId,
        },
      });
    }
    const totalAmount = appointment.services
      .filter(
        (service) =>
          !targets.some((target) => target.id === service.id) &&
          service.status !== AppointmentStatus.CANCELLED,
      )
      .reduce((total, service) => total + toMinorUnits(service.amount), 0);
    const totalAmountValue = moneyFromMinorUnits(totalAmount);
    await tx.appointment.update({
      where: { id: appointment.id },
      data: {
        amount: totalAmountValue,
        ...(input.scope === 'VISIT'
          ? {
              cancelledAt,
              cancelledReason: input.reason.trim(),
              cancelledByType: 'ADMIN',
              cancelledById: input.adminId,
            }
          : {}),
      },
    });
    const cancelsEntireVisit =
      input.scope === 'VISIT' ||
      appointment.services.every((service) => targets.some((target) => target.id === service.id));
    if (cancelsEntireVisit)
      await tx.appointmentSupportingStaff.updateMany({
        where: { appointmentId: appointment.id, releasedAt: null },
        data: { releasedAt: cancelledAt },
      });
    await syncAppointmentAggregate(tx, appointment.id);
    await releaseCompletedAppointmentStaff(tx, businessDate, participatingStaffIds);
    await routeAppointmentServices(tx, appointment.id, businessDate);
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: input.scope === 'VISIT' ? 'appointment.cancelled' : 'appointment_service.cancelled',
        entity: input.scope === 'VISIT' ? 'Appointment' : 'AppointmentService',
        entityId: input.scope === 'VISIT' ? appointment.id : targets[0].id,
        metadata: {
          reason: input.reason.trim(),
          scope: input.scope,
          appointmentServiceIds: targets.map((service) => service.id),
        },
      },
    });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    const response = {
      ok: true,
      appointment: updated ? mapAppointment(updated) : null,
      idempotent: false,
    };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: {
          scope,
          key: input.idempotencyKey,
          requestHash: normalizedRequestHash,
          response: { ok: true, appointmentId: appointment.id, scope: input.scope },
        },
      });
    return response;
  });
}

type PastAppointmentResolutionInput = {
  appointmentId: string;
  appointmentServiceId?: string;
  action: 'CANCEL_UNSERVED' | 'MARK_COMPLETED';
  staffId?: string;
  reason: string;
  confirmed?: boolean;
  idempotencyKey?: string;
  adminId: string;
};

const pastAppointmentActionableStatuses: AppointmentStatus[] = [
  AppointmentStatus.CREATED,
  AppointmentStatus.WAITING,
  AppointmentStatus.ASSIGNED,
  AppointmentStatus.IN_SERVICE,
];

function isPastAppointmentActionableStatus(status: AppointmentStatus) {
  return pastAppointmentActionableStatuses.includes(status);
}

function isInvalidPaymentPendingAppointment(appointment: {
  status: AppointmentStatus;
  services: Array<{
    status: AppointmentStatus;
    primaryStaffId: string | null;
    completedAt: Date | null;
  }>;
}) {
  return appointment.status === AppointmentStatus.PAYMENT_PENDING && !isAppointmentPaymentReady(appointment);
}

function pastAppointmentResolutionMessage(
  action: PastAppointmentResolutionInput['action'],
  code: string,
) {
  return action === 'MARK_COMPLETED'
    ? `${code} reconciled as completed. Payment is ready to collect.`
    : `${code} marked as unserved.`;
}

async function resolvePastAppointmentTx(
  tx: Prisma.TransactionClient,
  input: PastAppointmentResolutionInput,
  currentBusinessDate: Date,
) {
  const scope = `past-resolve:${input.appointmentId}:${input.appointmentServiceId ?? 'auto'}`;
  const normalizedRequestHash = await requestHash({
    appointmentId: input.appointmentId,
    appointmentServiceId: input.appointmentServiceId ?? null,
    action: input.action,
    staffId: input.staffId ?? null,
    reason: input.reason.trim(),
    confirmed: input.confirmed === true,
  });
  let appointment = await tx.appointment.findUnique({
    where: { id: input.appointmentId },
    include: appointmentInclude,
  });
  if (!appointment) throw new Error('Appointment not found');
  if (input.idempotencyKey) {
    const prior = await tx.commandReceipt.findUnique({
      where: { scope_key: { scope, key: input.idempotencyKey } },
    });
    if (prior) {
      if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
        throw new Error('This historical resolution key was already used for different details');
      return {
        ok: true,
        appointment: mapAppointment(appointment),
        message: pastAppointmentResolutionMessage(input.action, appointment.code),
        idempotent: true,
      };
    }
  }
  await lockShopBusinessDate(tx, appointment.businessDate.toISOString());
  appointment = await tx.appointment.findUnique({
    where: { id: input.appointmentId },
    include: appointmentInclude,
  });
  if (!appointment) throw new Error('Appointment not found');
  if (appointment.businessDate.getTime() >= currentBusinessDate.getTime())
    throw new Error('Only appointments from a previous business date can be resolved here');
  if (!isPastUnresolvedStatus(appointment.status))
    throw new Error('This appointment is already resolved');
  if (appointment.payment)
    throw new Error('Payment-confirmed history cannot be changed');

  const invalidPaymentPending = isInvalidPaymentPendingAppointment(appointment);
  const actionableServices = appointment.services.filter(
    (service) =>
      isPastAppointmentActionableStatus(service.status) ||
      (invalidPaymentPending && service.status === AppointmentStatus.PAYMENT_PENDING),
  );
  const target = input.appointmentServiceId
    ? appointment.services.find((service) => service.id === input.appointmentServiceId)
    : actionableServices.length === 1
      ? actionableServices[0]
      : undefined;
  if (!target) {
    throw new Error(
      actionableServices.length > 1
        ? 'Choose the service to resolve; this visit has more than one unfinished service'
        : 'Appointment service not found',
    );
  }
  if (
    !isPastAppointmentActionableStatus(target.status) &&
    !(invalidPaymentPending && target.status === AppointmentStatus.PAYMENT_PENDING)
  )
    throw new Error('Only unfinished services can be resolved from past appointments');
  if (
    input.action === 'CANCEL_UNSERVED' &&
    target.status === AppointmentStatus.IN_SERVICE &&
    input.confirmed !== true
  ) {
    throw new Error('Confirm that the in-service record should be marked unserved');
  }

  const reason = input.reason.trim();
  const now = new Date();
  const nextServices = appointment.services.map((service) => ({ ...service }));
  const nextTarget = nextServices.find((service) => service.id === target.id);
  if (!nextTarget) throw new Error('Appointment service not found');
  let finishedTurnId: string | null = null;

  if (input.action === 'CANCEL_UNSERVED') {
    for (const turn of target.turns.filter(
      (item) => item.status === TurnStatus.ASSIGNED || item.status === TurnStatus.ACCEPTED,
    )) {
      await tx.turn.update({
        where: { id: turn.id },
        data: {
          status: transitionTurn(turn.status, TurnStatus.SKIPPED),
          reason,
          endedAt: now,
        },
      });
      await recordTurnEvent(tx, {
        appointmentId: appointment.id,
        appointmentServiceId: target.id,
        turnId: turn.id,
        eventType: TurnEventType.CANCELLED,
        assignedStaffId: turn.assignedStaffId,
        assignedStaffName: target.primaryStaff?.name ?? null,
        actorType: ActorType.ADMIN,
        actorId: input.adminId,
        reason,
      });
    }
    await tx.appointmentService.update({
      where: { id: target.id },
      data: {
        status:
          invalidPaymentPending && target.status === AppointmentStatus.PAYMENT_PENDING
            ? AppointmentStatus.CANCELLED
            : transitionAppointment(target.status, AppointmentStatus.CANCELLED),
        primaryStaffId: null,
        cancelledAt: now,
        cancelledReason: reason,
        cancelledByType: ActorType.ADMIN,
        cancelledById: input.adminId,
      },
    });
    nextTarget.status = AppointmentStatus.CANCELLED;
    nextTarget.primaryStaffId = null;
  } else {
    const resolvedStaffId = input.staffId ?? target.primaryStaffId;
    if (!resolvedStaffId) throw new Error('Choose the specialist who completed the service');
    const resolvedStaff = await tx.staff.findUnique({
      where: { id: resolvedStaffId },
      select: { id: true, name: true },
    });
    if (!resolvedStaff) throw new Error('The selected specialist no longer exists');
    const activeTurn = [...target.turns]
      .reverse()
      .find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
    finishedTurnId = activeTurn?.id ?? null;
    if (activeTurn) {
      await tx.turn.update({
        where: { id: activeTurn.id },
        data: {
          status: transitionTurn(activeTurn.status, TurnStatus.FINISHED),
          assignedStaffId: resolvedStaff.id,
          endedAt: now,
        },
      });
    } else {
      const finishedTurn = await tx.turn.create({
        data: {
          id: randomId(),
          appointmentId: appointment.id,
          appointmentServiceId: target.id,
          assignedStaffId: resolvedStaff.id,
          status: TurnStatus.FINISHED,
          reason: 'Historical manager reconciliation',
          createdAt: now,
          endedAt: now,
        },
      });
      finishedTurnId = finishedTurn.id;
    }
    await recordTurnEvent(tx, {
      appointmentId: appointment.id,
      appointmentServiceId: target.id,
      turnId: finishedTurnId,
      eventType: TurnEventType.FINISHED,
      assignedStaffId: resolvedStaff.id,
      assignedStaffName: resolvedStaff.name,
      actorType: ActorType.ADMIN,
      actorId: input.adminId,
      reason,
    });
    await tx.appointmentService.update({
      where: { id: target.id },
      data: {
        status: AppointmentStatus.COMPLETED,
        primaryStaffId: resolvedStaff.id,
        completedAt: now,
      },
    });
    nextTarget.status = AppointmentStatus.COMPLETED;
    nextTarget.primaryStaffId = resolvedStaff.id;
    nextTarget.completedAt = now;
  }

  const allServicesResolved = nextServices.every((service) =>
    ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]).includes(
      service.status,
    ),
  );
  if (allServicesResolved) {
    await tx.appointmentSupportingStaff.updateMany({
      where: { appointmentId: appointment.id, releasedAt: null },
      data: { releasedAt: now },
    });
    if (input.action === 'MARK_COMPLETED' && finishedTurnId) {
      for (const support of appointment.supportingStaff.filter((member) => !member.releasedAt)) {
        await recordTurnEvent(tx, {
          appointmentId: appointment.id,
          appointmentServiceId: target.id,
          turnId: finishedTurnId,
          eventType: TurnEventType.SUPPORT_RELEASED,
          assignedStaffId: support.staffId,
          actorType: ActorType.ADMIN,
          actorId: input.adminId,
          reason: 'Support released after historical reconciliation',
        });
      }
    }
  }

  const allCancelled = nextServices.every(
    (service) => service.status === AppointmentStatus.CANCELLED,
  );
  const totalAmount = nextServices
    .filter((service) => service.status !== AppointmentStatus.CANCELLED)
    .reduce((total, service) => total + toMinorUnits(service.amount), 0);
  await syncAppointmentAggregate(tx, appointment.id);
  const updated = await tx.appointment.update({
    where: { id: appointment.id },
    data: {
      amount: moneyFromMinorUnits(totalAmount),
      ...(allCancelled
        ? {
            cancelledAt: now,
            cancelledReason: reason,
            cancelledByType: ActorType.ADMIN,
            cancelledById: input.adminId,
          }
        : {}),
    },
    include: appointmentInclude,
  });
  await tx.auditEvent.create({
    data: {
      actorType: ActorType.ADMIN,
      actorId: input.adminId,
      action: 'appointment.past_resolution',
      entity: 'AppointmentService',
      entityId: target.id,
      metadata: {
        action: input.action,
        reason,
        businessDate: formatBusinessDate(appointment.businessDate),
        previousStatus: target.status,
        nextStatus: input.action === 'MARK_COMPLETED' ? AppointmentStatus.COMPLETED : AppointmentStatus.CANCELLED,
        staffId: input.staffId ?? target.primaryStaffId,
      },
    },
  });
  await bumpBoardVersion(tx);
  const response = {
    ok: true,
    appointment: mapAppointment(updated),
    message: pastAppointmentResolutionMessage(input.action, appointment.code),
    idempotent: false,
  };
  if (input.idempotencyKey) {
    await tx.commandReceipt.create({
      data: {
        scope,
        key: input.idempotencyKey,
        requestHash: normalizedRequestHash,
        response: { ok: true, appointmentId: appointment.id, action: input.action },
      },
    });
  }
  return response;
}

async function resolvePastAppointmentD1(
  input: PastAppointmentResolutionInput,
  currentBusinessDate: Date,
) {
  const run = async (database: D1DatabaseLike) => {
    const db = prisma;
    const scope = `past-resolve:${input.appointmentId}:${input.appointmentServiceId ?? 'auto'}`;
    const normalizedRequestHash = await requestHash({
      appointmentId: input.appointmentId,
      appointmentServiceId: input.appointmentServiceId ?? null,
      action: input.action,
      staffId: input.staffId ?? null,
      reason: input.reason.trim(),
      confirmed: input.confirmed === true,
    });
    const appointment = await db.appointment.findUnique({
      where: { id: input.appointmentId },
      include: appointmentInclude,
    });
    if (!appointment) throw new Error('Appointment not found');
    if (input.idempotencyKey) {
      const prior = await db.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This historical resolution key was already used for different details');
        return {
          ok: true,
          appointment: mapAppointment(appointment as unknown as D1MappedAppointment),
          message: pastAppointmentResolutionMessage(input.action, appointment.code),
          idempotent: true,
        };
      }
    }
    if (appointment.businessDate.getTime() >= currentBusinessDate.getTime())
      throw new Error('Only appointments from a previous business date can be resolved here');
    if (!isPastUnresolvedStatus(appointment.status))
      throw new Error('This appointment is already resolved');
    if (appointment.payment) throw new Error('Payment-confirmed history cannot be changed');

    const invalidPaymentPending = isInvalidPaymentPendingAppointment(appointment);
    const actionableServices = appointment.services.filter(
      (service) =>
        isPastAppointmentActionableStatus(service.status) ||
        (invalidPaymentPending && service.status === AppointmentStatus.PAYMENT_PENDING),
    );
    const target = input.appointmentServiceId
      ? appointment.services.find((service) => service.id === input.appointmentServiceId)
      : actionableServices.length === 1
        ? actionableServices[0]
        : undefined;
    if (!target) {
      throw new Error(
        actionableServices.length > 1
          ? 'Choose the service to resolve; this visit has more than one unfinished service'
          : 'Appointment service not found',
      );
    }
    if (
      !isPastAppointmentActionableStatus(target.status) &&
      !(invalidPaymentPending && target.status === AppointmentStatus.PAYMENT_PENDING)
    )
      throw new Error('Only unfinished services can be resolved from past appointments');
    if (
      input.action === 'CANCEL_UNSERVED' &&
      target.status === AppointmentStatus.IN_SERVICE &&
      input.confirmed !== true
    )
      throw new Error('Confirm that the in-service record should be marked unserved');

    const reason = input.reason.trim();
    const now = new Date();
    const nowIso = d1DateTimeValue(now);
    const nextServices = appointment.services.map((service) => ({ ...service }));
    const nextTarget = nextServices.find((service) => service.id === target.id);
    if (!nextTarget) throw new Error('Appointment service not found');
    const statements = [] as ReturnType<typeof d1Statement>[];
    const activeTurns = target.turns.filter(
      (turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED,
    );
    let finishedTurnId = [...activeTurns].reverse()[0]?.id ?? null;
    let serviceStatementIndex = -1;

    if (input.action === 'CANCEL_UNSERVED') {
      for (const turn of activeTurns) {
        statements.push(
          d1Statement(
            database,
            `UPDATE turns SET status = ?, reason = ?, ended_at = ? WHERE id = ? AND status IN (?, ?)`,
            TurnStatus.SKIPPED,
            reason,
            nowIso,
            turn.id,
            TurnStatus.ASSIGNED,
            TurnStatus.ACCEPTED,
          ),
        );
        statements.push(
          d1TurnEvent(
            database,
            {
              appointmentId: appointment.id,
              appointmentServiceId: target.id,
              turnId: turn.id,
              eventType: TurnEventType.CANCELLED,
              assignedStaffId: turn.assignedStaffId,
              assignedStaffName: target.primaryStaff?.name ?? null,
              actorType: ActorType.ADMIN,
              actorId: input.adminId,
              reason,
            },
            nowIso,
          ),
        );
      }
      serviceStatementIndex = statements.length;
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_services SET status = ?, primary_staff_id = NULL, cancelled_at = ?, cancelled_reason = ?, cancelled_by_type = ?, cancelled_by_id = ? WHERE id = ? AND status = ?`,
          AppointmentStatus.CANCELLED,
          nowIso,
          reason,
          ActorType.ADMIN,
          input.adminId,
          target.id,
          target.status,
        ),
      );
      nextTarget.status = AppointmentStatus.CANCELLED;
      nextTarget.primaryStaffId = null;
      nextTarget.cancelledAt = now;
      nextTarget.cancelledReason = reason;
      nextTarget.cancelledByType = ActorType.ADMIN;
      nextTarget.cancelledById = input.adminId;
    } else {
      const resolvedStaffId = input.staffId ?? target.primaryStaffId;
      if (!resolvedStaffId) throw new Error('Choose the specialist who completed the service');
      const resolvedStaff = await db.staff.findUnique({
        where: { id: resolvedStaffId },
        select: { id: true, name: true },
      });
      if (!resolvedStaff) throw new Error('The selected specialist no longer exists');
      const activeTurn = [...target.turns]
        .reverse()
        .find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
      if (activeTurn) {
        statements.push(
          d1Statement(
            database,
            `UPDATE turns SET status = ?, assigned_staff_id = ?, ended_at = ? WHERE id = ? AND status IN (?, ?)`,
            TurnStatus.FINISHED,
            resolvedStaff.id,
            nowIso,
            activeTurn.id,
            TurnStatus.ASSIGNED,
            TurnStatus.ACCEPTED,
          ),
        );
        finishedTurnId = activeTurn.id;
      } else {
        finishedTurnId = randomId();
        statements.push(
          d1Statement(
            database,
            `INSERT INTO turns (id, appointment_id, appointment_service_id, assigned_staff_id, status, reason, created_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            finishedTurnId,
            appointment.id,
            target.id,
            resolvedStaff.id,
            TurnStatus.FINISHED,
            'Historical manager reconciliation',
            nowIso,
            nowIso,
          ),
        );
      }
      statements.push(
        d1TurnEvent(
          database,
          {
            appointmentId: appointment.id,
            appointmentServiceId: target.id,
            turnId: finishedTurnId,
            eventType: TurnEventType.FINISHED,
            assignedStaffId: resolvedStaff.id,
            assignedStaffName: resolvedStaff.name,
            actorType: ActorType.ADMIN,
            actorId: input.adminId,
            reason,
          },
          nowIso,
        ),
      );
      serviceStatementIndex = statements.length;
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_services SET status = ?, primary_staff_id = ?, completed_at = ? WHERE id = ? AND status = ?`,
          AppointmentStatus.COMPLETED,
          resolvedStaff.id,
          nowIso,
          target.id,
          target.status,
        ),
      );
      nextTarget.status = AppointmentStatus.COMPLETED;
      nextTarget.primaryStaffId = resolvedStaff.id;
      nextTarget.completedAt = now;
    }

    const allServicesResolved = nextServices.every((service) =>
      ([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]).includes(
        service.status,
      ),
    );
    if (allServicesResolved) {
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_supporting_staff SET released_at = ? WHERE appointment_id = ? AND released_at IS NULL`,
          nowIso,
          appointment.id,
        ),
      );
      if (input.action === 'MARK_COMPLETED' && finishedTurnId) {
        for (const support of appointment.supportingStaff.filter((member) => !member.releasedAt)) {
          statements.push(
            d1TurnEvent(
              database,
              {
                appointmentId: appointment.id,
                appointmentServiceId: target.id,
                turnId: finishedTurnId,
                eventType: TurnEventType.SUPPORT_RELEASED,
                assignedStaffId: support.staffId,
                actorType: ActorType.ADMIN,
                actorId: input.adminId,
                reason: 'Support released after historical reconciliation',
              },
              nowIso,
            ),
          );
        }
      }
    }

    const allCancelled = nextServices.every(
      (service) => service.status === AppointmentStatus.CANCELLED,
    );
    const totalAmount = nextServices
      .filter((service) => service.status !== AppointmentStatus.CANCELLED)
      .reduce((total, service) => total + toMinorUnits(service.amount), 0);
    const aggregate = d1AppointmentAggregate(appointment, nextServices);
    const appointmentStatementIndex = statements.length;
    statements.push(
      d1Statement(
        database,
        `UPDATE appointments SET amount = ?, status = ?, service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, service_count = ?, primary_staff_id = ?, ${allCancelled ? 'cancelled_at = ?, cancelled_reason = ?, cancelled_by_type = ?, cancelled_by_id = ?,' : ''} completed_at = CASE WHEN ? = ? THEN NULL ELSE completed_at END WHERE id = ? AND status = ?`,
        moneyFromMinorUnits(totalAmount),
        aggregate.status,
        aggregate.serviceId,
        aggregate.serviceNameSnapshot,
        aggregate.durationMinSnapshot,
        aggregate.serviceCount,
        aggregate.primaryStaffId,
        ...(allCancelled ? [nowIso, reason, ActorType.ADMIN, input.adminId] : []),
        aggregate.status,
        AppointmentStatus.PAYMENT_PENDING,
        appointment.id,
        appointment.status,
      ),
    );
    statements.push(
      d1AuditEvent(
        database,
        {
          action: 'appointment.past_resolution',
          entity: 'AppointmentService',
          entityId: target.id,
          actorId: input.adminId,
          actorType: ActorType.ADMIN,
          metadata: {
            action: input.action,
            reason,
            businessDate: formatBusinessDate(appointment.businessDate),
            previousStatus: target.status,
            nextStatus: input.action === 'MARK_COMPLETED' ? AppointmentStatus.COMPLETED : AppointmentStatus.CANCELLED,
            staffId: input.staffId ?? target.primaryStaffId,
          },
        },
        nowIso,
      ),
    );
    statements.push(d1BumpBoardVersion(database, nowIso));
    if (input.idempotencyKey) {
      statements.push(
        d1Statement(
          database,
          `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          randomId(),
          scope,
          input.idempotencyKey,
          JSON.stringify({ ok: true, appointmentId: appointment.id, action: input.action }),
          normalizedRequestHash,
          nowIso,
        ),
      );
    }
    const results = (await database.batch(statements)) as D1BatchResult[];
    if (
      serviceStatementIndex < 0 ||
      d1BatchChanges(results[serviceStatementIndex]) !== 1 ||
      d1BatchChanges(results[appointmentStatementIndex]) !== 1
    )
      throw new Error('Appointment changed before historical resolution could be recorded; retry the command');
    const updated = await db.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    return {
      ok: true,
      appointment: updated ? mapAppointment(updated) : null,
      message: pastAppointmentResolutionMessage(input.action, appointment.code),
      idempotent: false,
    };
  };
  return withD1Lease(run);
}

export async function resolveDbPastAppointment(input: PastAppointmentResolutionInput) {
  const currentBusinessDate = await currentDbBusinessDate();
  if (await isD1Runtime()) return resolvePastAppointmentD1(input, currentBusinessDate);
  return prisma.$transaction((tx) =>
    resolvePastAppointmentTx(tx, input, currentBusinessDate),
  );
}

async function reassignDbAppointmentServiceD1(input: {
  appointmentServiceId: string;
  staffId: string;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  const businessDate = await currentDbBusinessDate();
  return withD1Lease(async (database) => {
    const scope = `reassign:${input.appointmentServiceId}`;
    const normalizedRequestHash = await requestHash({ appointmentServiceId: input.appointmentServiceId, staffId: input.staffId, reason: input.reason.trim() });
    if (input.idempotencyKey) {
      const prior = await prisma.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This reassignment key was already used for different details');
        const stored = prior.response as Prisma.JsonObject;
        const appointmentId = typeof stored.appointmentId === 'string' ? stored.appointmentId : null;
        const existing = appointmentId ? await prisma.appointment.findUnique({ where: { id: appointmentId }, include: appointmentInclude }) : null;
        return { ok: true, appointment: existing ? mapAppointment(existing) : null, idempotent: true };
      }
    }
    const service = await prisma.appointmentService.findUnique({
      where: { id: input.appointmentServiceId },
      include: {
        appointment: { include: appointmentInclude },
        service: { include: { requiredSkills: { include: { skill: true } } } },
        primaryStaff: true,
        turns: { orderBy: { createdAt: 'asc' } },
        turnExclusions: { where: { overriddenAt: null }, select: { staffId: true } },
      },
    });
    if (!service) throw new Error('Appointment service not found');
    if (!( [AppointmentStatus.WAITING, AppointmentStatus.ASSIGNED] as AppointmentStatus[]).includes(service.status))
      throw new Error('Only waiting or assigned services can be manually reassigned');
    if (service.turnExclusions.some((exclusion) => exclusion.staffId === input.staffId))
      throw new Error('This technician was explicitly excluded from the service; override the exclusion first');
    const staffRows = await staffForBusinessDate(prisma, businessDate);
    const candidate = staffRows.map(mapStaff).find((staff) => staff.id === input.staffId);
    if (!candidate || !candidate.isActive || !candidate.isPresent || candidate.availability !== Availability.AVAILABLE)
      throw new Error('Technician must be active, clocked in, and available');
    const requiredSkills = service.service.requiredSkills.map((item) => item.skill.name);
    if (!requiredSkills.every((skill) => candidate.skills.includes(skill)))
      throw new Error('Technician does not have the required skills');
    const activeTurn = [...service.turns].reverse().find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
    const now = new Date();
    const nowIso = d1DateTimeValue(now);
    const reassignedTurnId = randomId();
    const nextServices = service.appointment.services.map((item) => item.id === service.id ? { ...item, status: AppointmentStatus.ASSIGNED, primaryStaffId: input.staffId } : item);
    const aggregate = d1AppointmentAggregate(service.appointment, nextServices);
    const statements = [] as ReturnType<typeof d1Statement>[];
    if (activeTurn) {
      statements.push(d1Statement(database, `UPDATE turns SET status = ?, reason = ?, ended_at = ? WHERE id = ? AND status = ?`, TurnStatus.SKIPPED, `Manually reassigned: ${input.reason.trim()}`, nowIso, activeTurn.id, activeTurn.status));
      statements.push(d1TurnEvent(database, { appointmentId: service.appointmentId, appointmentServiceId: service.id, turnId: activeTurn.id, eventType: TurnEventType.SKIPPED, assignedStaffId: activeTurn.assignedStaffId, assignedStaffName: service.primaryStaff?.name ?? null, actorType: ActorType.ADMIN, actorId: input.adminId, reason: input.reason }, nowIso));
    }
    const serviceStatementIndex = statements.length;
    statements.push(d1Statement(database, `UPDATE appointment_services SET status = ?, primary_staff_id = ? WHERE id = ? AND status IN (?, ?)`, AppointmentStatus.ASSIGNED, input.staffId, service.id, AppointmentStatus.WAITING, AppointmentStatus.ASSIGNED));
    statements.push(d1Statement(database, `INSERT INTO turns (id, appointment_id, appointment_service_id, assigned_staff_id, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, reassignedTurnId, service.appointmentId, service.id, input.staffId, TurnStatus.ASSIGNED, 'Manager reassignment', nowIso));
    statements.push(d1TurnEvent(database, { appointmentId: service.appointmentId, appointmentServiceId: service.id, turnId: reassignedTurnId, eventType: TurnEventType.REASSIGNED, assignedStaffId: input.staffId, assignedStaffName: candidate.name, actorType: ActorType.ADMIN, actorId: input.adminId, reason: input.reason }, nowIso));
    statements.push(d1Statement(database, `INSERT INTO staff_service_state (staff_id, availability, last_assigned_at) VALUES (?, ?, ?)
      ON CONFLICT(staff_id) DO UPDATE SET availability = excluded.availability, last_assigned_at = excluded.last_assigned_at`, input.staffId, Availability.BUSY, nowIso));
    if (service.primaryStaffId && service.primaryStaffId !== input.staffId) {
      statements.push(d1Statement(database, `UPDATE staff_service_state SET availability = ? WHERE staff_id = ? AND availability = ?
        AND NOT EXISTS (SELECT 1 FROM appointment_services active_service JOIN appointments active_appointment ON active_appointment.id = active_service.appointment_id WHERE active_service.primary_staff_id = ? AND active_service.status IN (?, ?) AND active_appointment.business_date = ?)
        AND NOT EXISTS (SELECT 1 FROM appointment_supporting_staff support JOIN appointments support_appointment ON support_appointment.id = support.appointment_id WHERE support.staff_id = ? AND support.released_at IS NULL AND support_appointment.business_date = ? AND support_appointment.status IN (?, ?, ?))`, Availability.AVAILABLE, service.primaryStaffId, Availability.BUSY, service.primaryStaffId, AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, d1DateTimeValue(businessDate), service.primaryStaffId, d1DateTimeValue(businessDate), AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, AppointmentStatus.PAYMENT_PENDING));
    }
    statements.push(d1Statement(database, `UPDATE appointments SET status = ?, service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, service_count = ?, primary_staff_id = ? WHERE id = ?`, aggregate.status, aggregate.serviceId, aggregate.serviceNameSnapshot, aggregate.durationMinSnapshot, aggregate.serviceCount, aggregate.primaryStaffId, service.appointmentId));
    statements.push(d1AuditEvent(database, { action: 'appointment_service.reassigned', entity: 'AppointmentService', entityId: service.id, actorId: input.adminId, actorType: ActorType.ADMIN, metadata: { staffId: input.staffId, reason: input.reason.trim() } }, nowIso));
    statements.push(d1BumpBoardVersion(database, nowIso));
    if (input.idempotencyKey)
      statements.push(d1Statement(database, `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`, randomId(), scope, input.idempotencyKey, JSON.stringify({ ok: true, appointmentId: service.appointmentId }), normalizedRequestHash, nowIso));
    const results = (await database.batch(statements)) as D1BatchResult[];
    if (d1BatchChanges(results[serviceStatementIndex]) !== 1)
      throw new Error('Appointment service changed before reassignment could be recorded; retry the command');
    const updated = await prisma.appointment.findUnique({ where: { id: service.appointmentId }, include: appointmentInclude });
    return { ok: true, appointment: updated ? mapAppointment(updated) : null, idempotent: false };
  });
}

export async function reassignDbAppointmentService(input: {
  appointmentServiceId: string;
  staffId: string;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  if (await isD1Runtime()) return reassignDbAppointmentServiceD1(input);
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `reassign:${input.appointmentServiceId}`;
    const normalizedRequestHash = await requestHash({
      appointmentServiceId: input.appointmentServiceId,
      staffId: input.staffId,
      reason: input.reason.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This reassignment key was already used for different details');
        const service = await tx.appointmentService.findUnique({
          where: { id: input.appointmentServiceId },
          select: { appointmentId: true },
        });
        const existing = service
          ? await tx.appointment.findUnique({
              where: { id: service.appointmentId },
              include: appointmentInclude,
            })
          : null;
        return {
          ok: true,
          appointment: existing ? mapAppointment(existing) : null,
          idempotent: true,
        };
      }
    }
    const service = await tx.appointmentService.findUnique({
      where: { id: input.appointmentServiceId },
      include: {
        appointment: { include: appointmentInclude },
        service: { include: { requiredSkills: { include: { skill: true } } } },
        primaryStaff: true,
        turns: { orderBy: { createdAt: 'asc' } },
        turnExclusions: { where: { overriddenAt: null }, select: { staffId: true } },
      },
    });
    if (!service) throw new Error('Appointment service not found');
    if (
      !([AppointmentStatus.WAITING, AppointmentStatus.ASSIGNED] as AppointmentStatus[]).includes(
        service.status,
      )
    )
      throw new Error('Only waiting or assigned services can be manually reassigned');
    if (service.turnExclusions.some((exclusion) => exclusion.staffId === input.staffId))
      throw new Error(
        'This technician was explicitly excluded from the service; override the exclusion first',
      );
    const staffRows = await staffForBusinessDate(tx, businessDate);
    const candidate = staffRows.map(mapStaff).find((staff) => staff.id === input.staffId);
    if (
      !candidate ||
      !candidate.isActive ||
      !candidate.isPresent ||
      candidate.availability !== Availability.AVAILABLE
    )
      throw new Error('Technician must be active, clocked in, and available');
    const requiredSkills = service.service.requiredSkills.map((item) => item.skill.name);
    if (!requiredSkills.every((skill) => candidate.skills.includes(skill)))
      throw new Error('Technician does not have the required skills');
    const activeTurn = [...service.turns]
      .reverse()
      .find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
    if (activeTurn) {
      await tx.turn.update({
        where: { id: activeTurn.id },
        data: {
          status: transitionTurn(activeTurn.status, TurnStatus.SKIPPED),
          reason: `Manually reassigned: ${input.reason.trim()}`,
          endedAt: new Date(),
        },
      });
      await recordTurnEvent(tx, {
        appointmentId: service.appointmentId,
        appointmentServiceId: service.id,
        turnId: activeTurn.id,
        eventType: TurnEventType.SKIPPED,
        assignedStaffId: activeTurn.assignedStaffId,
        assignedStaffName: service.primaryStaff?.name ?? null,
        actorType: ActorType.ADMIN,
        actorId: input.adminId,
        reason: input.reason,
      });
    }
    await tx.appointmentService.update({
      where: { id: service.id },
      data: { status: AppointmentStatus.ASSIGNED, primaryStaffId: input.staffId },
    });
    const reassignedTurn = await tx.turn.create({
      data: {
        appointmentId: service.appointmentId,
        appointmentServiceId: service.id,
        assignedStaffId: input.staffId,
        status: TurnStatus.ASSIGNED,
        reason: 'Manager reassignment',
      },
    });
    await recordTurnEvent(tx, {
      appointmentId: service.appointmentId,
      appointmentServiceId: service.id,
      turnId: reassignedTurn.id,
      eventType: TurnEventType.REASSIGNED,
      assignedStaffId: input.staffId,
      assignedStaffName: candidate.name,
      actorType: ActorType.ADMIN,
      actorId: input.adminId,
      reason: input.reason,
    });
    await tx.staffServiceState.upsert({
      where: { staffId: input.staffId },
      update: { availability: Availability.BUSY, lastAssignedAt: new Date() },
      create: {
        staffId: input.staffId,
        availability: Availability.BUSY,
        lastAssignedAt: new Date(),
      },
    });
    await syncAppointmentAggregate(tx, service.appointmentId);
    if (service.primaryStaffId && service.primaryStaffId !== input.staffId)
      await releaseCompletedAppointmentStaff(tx, businessDate, [service.primaryStaffId]);
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'appointment_service.reassigned',
        entity: 'AppointmentService',
        entityId: service.id,
        metadata: { staffId: input.staffId, reason: input.reason.trim() },
      },
    });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({
      where: { id: service.appointmentId },
      include: appointmentInclude,
    });
    const response = {
      ok: true,
      appointment: updated ? mapAppointment(updated) : null,
      idempotent: false,
    };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: {
          scope,
          key: input.idempotencyKey,
          requestHash: normalizedRequestHash,
          response: { ok: true, appointmentId: service.appointmentId },
        },
      });
    return response;
  });
}

async function overrideDbTurnExclusionD1(input: {
  appointmentServiceId: string;
  staffId: string;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  return withD1Lease(async (database) => {
    const scope = `override-exclusion:${input.appointmentServiceId}:${input.staffId}`;
    const normalizedRequestHash = await requestHash({
      appointmentServiceId: input.appointmentServiceId,
      staffId: input.staffId,
      reason: input.reason.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await prisma.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This override key was already used for different details');
        const stored = prior.response as Prisma.JsonObject;
        return {
          ok: true,
          exclusionId: typeof stored.exclusionId === 'string' ? stored.exclusionId : null,
          overriddenAt: typeof stored.overriddenAt === 'string' ? new Date(stored.overriddenAt) : null,
          idempotent: true,
        };
      }
    }
    const exclusion = await prisma.turnExclusion.findUnique({
      where: { appointmentServiceId_staffId: { appointmentServiceId: input.appointmentServiceId, staffId: input.staffId } },
    });
    if (!exclusion) throw new Error('Turn exclusion not found');
    const overriddenAt = new Date();
    const overriddenAtIso = d1DateTimeValue(overriddenAt);
    const statements = [
      d1Statement(database, `UPDATE turn_exclusions SET overridden_at = ?, override_reason = ?, overridden_by_id = ? WHERE id = ?`, overriddenAtIso, input.reason.trim(), input.adminId, exclusion.id),
      d1AuditEvent(database, { action: 'turn_exclusion.overridden', entity: 'TurnExclusion', entityId: exclusion.id, actorId: input.adminId, actorType: ActorType.ADMIN, metadata: { appointmentServiceId: input.appointmentServiceId, staffId: input.staffId, reason: input.reason.trim(), overriddenAt: overriddenAt.toISOString() } }, overriddenAtIso),
      d1Statement(database, `INSERT INTO shop_config (id, state_version, created_at, updated_at) VALUES (1, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET state_version = shop_config.state_version + 1, updated_at = excluded.updated_at`, overriddenAtIso, overriddenAtIso),
      ...(input.idempotencyKey
        ? [
            d1Statement(database, `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`, randomId(), scope, input.idempotencyKey, JSON.stringify({ ok: true, exclusionId: exclusion.id, overriddenAt: overriddenAt.toISOString() }), normalizedRequestHash, overriddenAtIso),
          ]
        : []),
    ];
    const results = (await database.batch(statements)) as D1BatchResult[];
    if (d1BatchChanges(results[0]) !== 1)
      throw new Error('Turn exclusion changed before the override could be recorded; retry the command');
    return { ok: true, exclusionId: exclusion.id, overriddenAt, idempotent: false };
  });
}

export async function overrideDbTurnExclusion(input: {
  appointmentServiceId: string;
  staffId: string;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  if (await isD1Runtime()) return overrideDbTurnExclusionD1(input);
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `override-exclusion:${input.appointmentServiceId}:${input.staffId}`;
    const normalizedRequestHash = await requestHash({
      appointmentServiceId: input.appointmentServiceId,
      staffId: input.staffId,
      reason: input.reason.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This override key was already used for different details');
        return {
          ok: true,
          exclusionId:
            typeof (prior.response as Prisma.JsonObject).exclusionId === 'string'
              ? (prior.response as Prisma.JsonObject).exclusionId
              : null,
          overriddenAt:
            typeof (prior.response as Prisma.JsonObject).overriddenAt === 'string'
              ? new Date((prior.response as Prisma.JsonObject).overriddenAt as string)
              : null,
          idempotent: true,
        };
      }
    }
    const exclusion = await tx.turnExclusion.findUnique({
      where: {
        appointmentServiceId_staffId: {
          appointmentServiceId: input.appointmentServiceId,
          staffId: input.staffId,
        },
      },
    });
    if (!exclusion) throw new Error('Turn exclusion not found');
    const overriddenAt = new Date();
    await tx.turnExclusion.update({
      where: { id: exclusion.id },
      data: { overriddenAt, overrideReason: input.reason.trim(), overriddenById: input.adminId },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'turn_exclusion.overridden',
        entity: 'TurnExclusion',
        entityId: exclusion.id,
        metadata: {
          appointmentServiceId: input.appointmentServiceId,
          staffId: input.staffId,
          reason: input.reason.trim(),
          overriddenAt: overriddenAt.toISOString(),
        },
      },
    });
    await bumpBoardVersion(tx);
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: {
          scope,
          key: input.idempotencyKey,
          requestHash: normalizedRequestHash,
          response: {
            ok: true,
            exclusionId: exclusion.id,
            overriddenAt: overriddenAt.toISOString(),
          },
        },
      });
    return { ok: true, exclusionId: exclusion.id, overriddenAt, idempotent: false };
  });
}

export async function changeDbAppointmentService(input: {
  appointmentServiceId: string;
  serviceId: string;
  reason: string;
  idempotencyKey?: string;
  adminId: string;
}) {
  const businessDate = await currentDbBusinessDate();
  if (await isD1Runtime()) return changeDbAppointmentServiceD1(input, businessDate);
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `service-change:${input.appointmentServiceId}`;
    const normalizedRequestHash = await requestHash({
      appointmentServiceId: input.appointmentServiceId,
      serviceId: input.serviceId,
      reason: input.reason.trim(),
    });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This service-change key was already used for different details');
        const existingService = await tx.appointmentService.findUnique({
          where: { id: input.appointmentServiceId },
          select: { appointmentId: true },
        });
        const existing = existingService
          ? await tx.appointment.findUnique({
              where: { id: existingService.appointmentId },
              include: appointmentInclude,
            })
          : null;
        return {
          ok: true,
          appointment: existing ? mapAppointment(existing) : null,
          idempotent: true,
        };
      }
    }
    const current = await tx.appointmentService.findUnique({
      where: { id: input.appointmentServiceId },
      include: {
        appointment: { include: appointmentInclude },
        service: { include: { requiredSkills: { include: { skill: true } } } },
        primaryStaff: true,
        turns: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!current) throw new Error('Appointment service not found');
    if (
      (
        [
          AppointmentStatus.COMPLETED,
          AppointmentStatus.CANCELLED,
          AppointmentStatus.PAYMENT_PENDING,
        ] as AppointmentStatus[]
      ).includes(current.status) ||
      current.appointment.payment ||
      current.appointment.status === AppointmentStatus.PAYMENT_PENDING ||
      current.appointment.status === AppointmentStatus.COMPLETED
    )
      throw new Error('Completed or payment-confirmed service history cannot be changed');
    const nextService = await tx.service.findFirst({
      where: activeCatalogServiceWhere([input.serviceId]),
      include: { requiredSkills: { include: { skill: true } } },
    });
    if (!nextService) throw new Error('Replacement service is unavailable');
    if (nextService.id === current.serviceId) throw new Error('Choose a different service');
    const requiredSkills = nextService.requiredSkills.map((item) => item.skill.name);
    if (current.primaryStaffId) {
      const staff = await tx.staff.findUnique({
        where: { id: current.primaryStaffId },
        include: { skills: { include: { skill: true } }, attendance: { where: { businessDate } } },
      });
      const qualified = Boolean(
        staff?.isActive &&
          staff.attendance[0]?.status === AttendanceStatus.PRESENT &&
          requiredSkills.every((skill) => staff.skills.some((item) => item.skill.name === skill)),
      );
      if (current.status === AppointmentStatus.IN_SERVICE && !qualified)
        throw new Error(
          'Current technician is not qualified for the replacement service; reassign before changing it',
        );
      if (current.status !== AppointmentStatus.IN_SERVICE && !qualified) {
        const activeTurn = [...current.turns]
          .reverse()
          .find(
            (turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED,
          );
        if (activeTurn) {
          await tx.turn.update({
            where: { id: activeTurn.id },
            data: {
              status: transitionTurn(activeTurn.status, TurnStatus.SKIPPED),
              reason: 'Service changed; routing revalidated',
              endedAt: new Date(),
            },
          });
          await recordTurnEvent(tx, {
            appointmentId: current.appointmentId,
            appointmentServiceId: current.id,
            turnId: activeTurn.id,
            eventType: TurnEventType.SKIPPED,
            assignedStaffId: activeTurn.assignedStaffId,
            assignedStaffName: current.primaryStaff?.name ?? null,
            actorType: ActorType.ADMIN,
            actorId: input.adminId,
            reason: 'Service changed; routing revalidated',
          });
        }
        await tx.appointmentService.update({
          where: { id: current.id },
          data: {
            serviceId: nextService.id,
            serviceNameSnapshot: nextService.name,
            durationMinSnapshot: nextService.durationMin,
            amount: nextService.price,
            currency: current.appointment.currency,
            status: AppointmentStatus.WAITING,
            primaryStaffId: null,
          },
        });
      } else {
        await tx.appointmentService.update({
          where: { id: current.id },
          data: {
            serviceId: nextService.id,
            serviceNameSnapshot: nextService.name,
            durationMinSnapshot: nextService.durationMin,
            amount: nextService.price,
            currency: current.appointment.currency,
          },
        });
      }
    } else {
      await tx.appointmentService.update({
        where: { id: current.id },
        data: {
          serviceId: nextService.id,
          serviceNameSnapshot: nextService.name,
          durationMinSnapshot: nextService.durationMin,
          amount: nextService.price,
          currency: current.appointment.currency,
        },
      });
    }
    await tx.serviceChangeEvent.create({
      data: {
        appointmentId: current.appointmentId,
        appointmentServiceId: current.id,
        oldServiceId: current.serviceId,
        oldServiceName: current.serviceNameSnapshot,
        oldDurationMin: current.durationMinSnapshot,
        oldAmount: current.amount,
        newServiceId: nextService.id,
        newServiceName: nextService.name,
        newDurationMin: nextService.durationMin,
        newAmount: nextService.price,
        currency: current.appointment.currency,
        reason: input.reason.trim(),
        actorId: input.adminId,
      },
    });
    const allServices = await tx.appointmentService.findMany({
      where: { appointmentId: current.appointmentId },
      select: { amount: true, status: true },
    });
    await tx.appointment.update({
      where: { id: current.appointmentId },
      data: {
        amount: moneyFromMinorUnits(allServices
          .filter((service) => service.status !== AppointmentStatus.CANCELLED)
          .reduce((total, service) => total + toMinorUnits(service.amount), 0)),
      },
    });
    await syncAppointmentAggregate(tx, current.appointmentId);
    await routeAppointmentServices(tx, current.appointmentId, businessDate);
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'appointment_service.changed',
        entity: 'AppointmentService',
        entityId: current.id,
        metadata: {
          oldServiceId: current.serviceId,
          newServiceId: nextService.id,
          reason: input.reason.trim(),
        },
      },
    });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({
      where: { id: current.appointmentId },
      include: appointmentInclude,
    });
    const response = {
      ok: true,
      appointment: updated ? mapAppointment(updated) : null,
      idempotent: false,
    };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: {
          scope,
          key: input.idempotencyKey,
          requestHash: normalizedRequestHash,
          response: { ok: true, appointmentId: current.appointmentId },
        },
      });
    return response;
  });
}

async function releaseCompletedAppointmentStaff(
  tx: Prisma.TransactionClient,
  businessDate: Date,
  staffIds: string[],
) {
  if (!staffIds.length) return;
  const [activeServiceAssignments, activeSupportingAssignments] = await Promise.all([
    tx.appointmentService.findMany({
      where: {
        appointment: { businessDate },
        status: { in: [AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE] },
        primaryStaffId: { in: staffIds },
      },
      select: { primaryStaffId: true },
    }),
    tx.appointmentSupportingStaff.findMany({
      where: {
        staffId: { in: staffIds },
        releasedAt: null,
        appointment: { businessDate, status: { in: checkoutBlockingAppointmentStatuses } },
      },
      select: { staffId: true },
    }),
  ]);
  const stillAssignedStaffIds = new Set<string>();
  for (const service of activeServiceAssignments)
    if (service.primaryStaffId) stillAssignedStaffIds.add(service.primaryStaffId);
  for (const supportingStaff of activeSupportingAssignments)
    stillAssignedStaffIds.add(supportingStaff.staffId);
  const releasableStaffIds = staffIds.filter((staffId) => !stillAssignedStaffIds.has(staffId));
  if (releasableStaffIds.length)
    await tx.staffServiceState.updateMany({
      where: { staffId: { in: releasableStaffIds }, availability: Availability.BUSY },
      data: { availability: Availability.AVAILABLE },
    });
}

async function syncAppointmentAggregate(tx: Prisma.TransactionClient, appointmentId: string) {
  const appointment = await tx.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { services: { orderBy: { sequence: 'asc' } } },
  });
  const activeService =
    appointment.services.find((service) => service.status === AppointmentStatus.IN_SERVICE) ??
    appointment.services.find((service) => service.status === AppointmentStatus.ASSIGNED) ??
    appointment.services.find(
      (service) =>
        service.status === AppointmentStatus.WAITING ||
        service.status === AppointmentStatus.CREATED,
    ) ??
    appointment.services.find((service) => service.status === AppointmentStatus.COMPLETED);
  const status = appointment.services.some(
    (service) => service.status === AppointmentStatus.IN_SERVICE,
  )
    ? AppointmentStatus.IN_SERVICE
    : appointment.services.some((service) => service.status === AppointmentStatus.ASSIGNED)
      ? AppointmentStatus.ASSIGNED
      : appointment.services.some(
            (service) =>
              service.status === AppointmentStatus.CREATED ||
              service.status === AppointmentStatus.WAITING,
          )
        ? AppointmentStatus.WAITING
        : appointment.services.some((service) => service.status === AppointmentStatus.COMPLETED)
          ? AppointmentStatus.PAYMENT_PENDING
          : AppointmentStatus.CANCELLED;
  return tx.appointment.update({
    where: { id: appointment.id },
    data: {
      status,
      serviceId: activeService?.serviceId ?? appointment.serviceId,
      serviceNameSnapshot: activeService?.serviceNameSnapshot ?? appointment.serviceNameSnapshot,
      durationMinSnapshot: activeService?.durationMinSnapshot ?? appointment.durationMinSnapshot,
      serviceCount: appointment.services.length,
      primaryStaffId: activeService?.primaryStaffId ?? null,
      completedAt: status === AppointmentStatus.PAYMENT_PENDING ? null : appointment.completedAt,
    },
  });
}

async function routeAppointmentServices(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  businessDate: Date,
  excludedServiceId?: string,
  excludedStaffId?: string,
  routingSnapshot?: { candidates: StaffCandidate[]; roundRobinEnabled: boolean },
) {
  const appointment = await tx.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      services: {
        where: { status: { in: [AppointmentStatus.CREATED, AppointmentStatus.WAITING] } },
        orderBy: { sequence: 'asc' },
        include: {
          service: { include: { requiredSkills: { include: { skill: true } } } },
          turns: { orderBy: { createdAt: 'asc' } },
          turnExclusions: { where: { overriddenAt: null }, select: { staffId: true } },
        },
      },
    },
  });
  if (!appointment) throw new Error('Appointment not found');
  const routingSnapshotResolved =
    routingSnapshot ?? {
      candidates: (await staffForBusinessDate(tx, businessDate)).map(mapStaff),
      roundRobinEnabled:
        (await tx.shopConfig.findUnique({
          where: { id: 1 },
          select: { roundRobinEnabled: true },
        }))?.roundRobinEnabled ?? true,
    };
  const candidates = routingSnapshotResolved.candidates;
  for (const appointmentService of appointment.services) {
    const excludedStaffIds = appointmentService.turnExclusions.map(
      (exclusion) => exclusion.staffId,
    );
    if (appointmentService.id === excludedServiceId && excludedStaffId)
      excludedStaffIds.push(excludedStaffId);
    const assignment = routeNextTurn(
      candidates,
      serviceSkillNames(appointmentService.service),
      [...new Set(excludedStaffIds)],
      routingSnapshotResolved.roundRobinEnabled,
    );
    const status = assignment.staff ? AppointmentStatus.ASSIGNED : AppointmentStatus.WAITING;
    const previousStaffId = appointmentService.primaryStaffId;
    await tx.appointmentService.update({
      where: { id: appointmentService.id },
      data: { status, primaryStaffId: assignment.staff?.id ?? null },
    });
    const activeTurn = [...appointmentService.turns]
      .reverse()
      .find((turn) => turn.status === TurnStatus.ASSIGNED && !turn.assignedStaffId);
    let routedTurnId: string;
    if (activeTurn) {
      await tx.turn.update({
        where: { id: activeTurn.id },
        data: {
          assignedStaffId: assignment.staff?.id ?? null,
          reason: assignment.staff ? null : 'Waiting for eligible staff',
        },
      });
      routedTurnId = activeTurn.id;
    } else {
      const routedTurn = await tx.turn.create({
        data: {
          appointmentId: appointment.id,
          appointmentServiceId: appointmentService.id,
          assignedStaffId: assignment.staff?.id ?? null,
          status: TurnStatus.ASSIGNED,
          reason: assignment.staff ? undefined : 'Waiting for eligible staff',
        },
      });
      routedTurnId = routedTurn.id;
    }
    const assignmentChanged =
      !activeTurn ||
      previousStaffId !== (assignment.staff?.id ?? null) ||
      appointmentService.status !== status;
    if (assignmentChanged)
      await recordTurnEvent(tx, {
        appointmentId: appointment.id,
        appointmentServiceId: appointmentService.id,
        turnId: routedTurnId,
        eventType: assignment.staff ? TurnEventType.ASSIGNED : TurnEventType.WAITING,
        assignedStaffId: assignment.staff?.id ?? null,
        assignedStaffName: assignment.staff?.name ?? null,
        actorType: ActorType.SYSTEM,
        actorName: 'Fair routing',
        reason: assignment.staff
          ? 'Assigned by skill and fair wait time'
          : 'Waiting for eligible staff',
      });
    if (assignment.staff) {
      await tx.staffServiceState.upsert({
        where: { staffId: assignment.staff.id },
        update: { availability: Availability.BUSY, lastAssignedAt: new Date() },
        create: {
          staffId: assignment.staff.id,
          availability: Availability.BUSY,
          lastAssignedAt: new Date(),
        },
      });
      const candidate = candidates.find((item) => item.id === assignment.staff?.id);
      if (candidate) candidate.availability = Availability.BUSY;
    }
  }
  return syncAppointmentAggregate(tx, appointment.id);
}

async function reconcileDbAssignmentsD1(date: Date, adminId?: string) {
  return withD1Lease(async (database) => {
    const where = {
      businessDate: date,
      status: { not: AppointmentStatus.COMPLETED },
      services: {
        some: { status: { in: [AppointmentStatus.CREATED, AppointmentStatus.WAITING] } },
      },
    };
    const totalAppointments = await prisma.appointment.count({ where });
    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: MAX_ROUTING_APPOINTMENTS_PER_BATCH,
      select: { id: true },
    });
    const [routingConfig, routingStaff] = await Promise.all([
      prisma.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } }),
      staffForBusinessDate(prisma, date),
    ]);
    const routingSnapshot = {
      candidates: routingStaff.map(mapStaff),
      roundRobinEnabled: routingConfig?.roundRobinEnabled ?? true,
    };
    const statements = [] as ReturnType<typeof d1Statement>[];
    const guardedAppointmentIndexes: number[] = [];
    for (const appointmentSummary of appointments) {
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentSummary.id },
        include: appointmentInclude,
      });
      if (!appointment) continue;
      const services = appointment.services.map((service) => ({
        ...service,
        turns: [...service.turns],
        turnExclusions: [...service.turnExclusions],
      })) as D1RouteService[];
      const routePlan = await d1RouteAppointmentPlan(
        database,
        appointment as unknown as D1RouteAppointment,
        services,
        date,
        { routingSnapshot },
      );
      const aggregate = d1AppointmentAggregate(appointment, routePlan.services);
      statements.push(...routePlan.statements);
      guardedAppointmentIndexes.push(statements.length);
      statements.push(
        d1Statement(
          database,
          `UPDATE appointments
           SET status = ?, service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, service_count = ?, primary_staff_id = ?, completed_at = CASE WHEN ? = ? THEN NULL ELSE completed_at END
           WHERE id = ? AND business_date = ?`,
          aggregate.status,
          aggregate.serviceId,
          aggregate.serviceNameSnapshot,
          aggregate.durationMinSnapshot,
          aggregate.serviceCount,
          aggregate.primaryStaffId,
          aggregate.status,
          AppointmentStatus.PAYMENT_PENDING,
          appointment.id,
          d1DateTimeValue(date),
        ),
      );
    }
    const nowIso = d1DateTimeValue(new Date());
    statements.push(
      d1AuditEvent(
        database,
        {
          actorType: ActorType.ADMIN,
          actorId: adminId,
          action: 'queue.assignments_reconciled',
          entity: 'Queue',
          metadata: {
            businessDate: formatBusinessDate(date),
            routedAppointments: appointments.length,
            remainingAppointments: Math.max(0, totalAppointments - appointments.length),
          },
        },
        nowIso,
      ),
    );
    if (appointments.length) statements.push(d1BumpBoardVersion(database, nowIso));
    const results = (await database.batch(statements)) as D1BatchResult[];
    for (const statementIndex of guardedAppointmentIndexes) {
      if (d1BatchChanges(results[statementIndex]) !== 1)
        throw new Error('An appointment changed before reconciliation could be recorded; retry the command');
    }
    return {
      routedAppointments: appointments.length,
      remainingAppointments: Math.max(0, totalAppointments - appointments.length),
    };
  });
}

export async function reconcileDbAssignments(businessDate?: Date, adminId?: string) {
  const date = businessDate ?? (await currentDbBusinessDate());
  if (await isD1Runtime()) return reconcileDbAssignmentsD1(date, adminId);
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, date.toISOString());
    const where = {
      businessDate: date,
      status: { not: AppointmentStatus.COMPLETED },
      services: {
        some: { status: { in: [AppointmentStatus.CREATED, AppointmentStatus.WAITING] } },
      },
    };
    const totalAppointments = await tx.appointment.count({ where });
    const appointments = await tx.appointment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: MAX_ROUTING_APPOINTMENTS_PER_BATCH,
      select: { id: true },
    });
    const [routingConfig, routingStaff] = await Promise.all([
      tx.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } }),
      staffForBusinessDate(tx, date),
    ]);
    const routingSnapshot = {
      candidates: routingStaff.map(mapStaff),
      roundRobinEnabled: routingConfig?.roundRobinEnabled ?? true,
    };
    for (const appointment of appointments)
      await routeAppointmentServices(tx, appointment.id, date, undefined, undefined, routingSnapshot);
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: adminId,
        action: 'queue.assignments_reconciled',
        entity: 'Queue',
        metadata: {
          businessDate: formatBusinessDate(date),
          routedAppointments: appointments.length,
          remainingAppointments: Math.max(0, totalAppointments - appointments.length),
        },
      },
    });
    if (appointments.length) await bumpBoardVersion(tx);
    return {
      routedAppointments: appointments.length,
      remainingAppointments: Math.max(0, totalAppointments - appointments.length),
    };
  });
}

async function getDbReportForRange({
  start,
  end,
  period,
  periodLabel,
  client,
}: {
  start: Date;
  end: Date;
  period: 'day' | 'month';
  periodLabel: string;
  client: D1PrismaRuntime;
}): Promise<DailyReport | MonthlyReport> {
  const [payments, appointments] = await Promise.all([
    client.payment.findMany({
      where: { confirmedAt: { not: null }, appointment: { businessDate: { gte: start, lt: end } } },
      include: {
        items: {
          include: {
            appointmentService: {
              include: { service: { select: { category: { select: { name: true } } } } },
            },
          },
        },
        appointment: {
          select: {
            businessDate: true,
            service: { select: { category: { select: { name: true } } } },
          },
        },
      },
    }),
    client.appointment.findMany({
      where: { businessDate: { gte: start, lt: end } },
      select: { businessDate: true, status: true },
    }),
  ]);
  // D1 caps bound parameters at 100. Keep report lookups indexed and
  // sequential instead of scanning the complete refund audit stream or
  // building one oversized `IN (...)` statement for a large month.
  const paymentIds = payments.map((payment) => payment.id);
  const refundEvents: Array<{ entityId: string | null; metadata: Prisma.JsonValue | null }> = [];
  for (let offset = 0; offset < paymentIds.length; offset += 75) {
    const chunk = paymentIds.slice(offset, offset + 75);
    refundEvents.push(
      ...(await client.auditEvent.findMany({
        where: {
          entity: 'Payment',
          action: 'payment.refunded',
          entityId: { in: chunk },
        },
        select: { entityId: true, metadata: true },
      })),
    );
  }
  const refundsByPayment = new Map<string, number>();
  for (const event of refundEvents) {
    if (!event.entityId) continue;
    refundsByPayment.set(
      event.entityId,
      (refundsByPayment.get(event.entityId) ?? 0) + paymentAuditNumber(event.metadata, 'amount'),
    );
  }
  const byService = new Map<string, { revenue: number; count: number }>();
  const byCategory = new Map<string, { revenue: number; count: number }>();
  const byStaff = new Map<string, { revenue: number; count: number }>();
  const trend = new Map<string, ReportTrendPoint>();
  for (const appointment of appointments) {
    const date = formatBusinessDate(appointment.businessDate);
    const point = trend.get(date) ?? { date, revenue: 0, appointmentCount: 0, completedCount: 0 };
    point.appointmentCount += 1;
    if (appointment.status === AppointmentStatus.COMPLETED) point.completedCount += 1;
    trend.set(date, point);
  }
  let cardTotal = 0;
  let cashTotal = 0;
  let tipTotal = 0;
  let cardCollectedTotal = 0;
  let cashCollectedTotal = 0;
  for (const payment of payments) {
    const amount = Number(payment.amount);
    const tip = Number(payment.tip);
    const refunded = Math.min(amount + tip, refundsByPayment.get(payment.id) ?? 0);
    const netAmount = Math.max(0, amount - Math.min(amount, refunded));
    const netTip = Math.max(0, tip - Math.max(0, refunded - amount));
    const collected = netAmount + netTip;
    const paymentDate = formatBusinessDate(payment.appointment.businessDate);
    const trendPoint = trend.get(paymentDate) ?? {
      date: paymentDate,
      revenue: 0,
      appointmentCount: 0,
      completedCount: 0,
    };
    trendPoint.revenue += netAmount;
    trend.set(paymentDate, trendPoint);
    const items = payment.items.length
      ? payment.items.map((item) => ({
          ...item,
          categoryName: item.appointmentService.service.category.name,
        }))
      : [
          {
            amount: payment.amount,
            serviceNameSnapshot: payment.serviceNameSnapshot,
            staffNameSnapshot: payment.staffNameSnapshot,
            categoryName: payment.appointment.service.category.name,
          },
        ];
    const itemTotal = items.reduce((total, item) => total + Number(item.amount), 0);
    for (const item of items) {
      const itemAmount = Number(item.amount);
      const serviceAmount = itemTotal > 0 ? itemAmount * (netAmount / itemTotal) : 0;
      const serviceValue = byService.get(item.serviceNameSnapshot) ?? { revenue: 0, count: 0 };
      serviceValue.revenue += serviceAmount;
      serviceValue.count += 1;
      byService.set(item.serviceNameSnapshot, serviceValue);
      const categoryValue = byCategory.get(item.categoryName) ?? { revenue: 0, count: 0 };
      categoryValue.revenue += serviceAmount;
      categoryValue.count += 1;
      byCategory.set(item.categoryName, categoryValue);
      const staffName = item.staffNameSnapshot;
      if (staffName) {
        const staffValue = byStaff.get(staffName) ?? { revenue: 0, count: 0 };
        staffValue.revenue += serviceAmount;
        staffValue.count += 1;
        byStaff.set(staffName, staffValue);
      }
    }
    tipTotal += netTip;
    if (payment.method === 'CARD') {
      cardTotal += netAmount;
      cardCollectedTotal += collected;
    } else {
      cashTotal += netAmount;
      cashCollectedTotal += collected;
    }
  }
  const dailyTrend = [...trend.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => ({ ...point, revenue: Number(point.revenue.toFixed(2)) }));
  const roundedCardTotal = Number(cardTotal.toFixed(2));
  const roundedCashTotal = Number(cashTotal.toFixed(2));
  const roundedTipTotal = Number(tipTotal.toFixed(2));
  const roundedCardCollectedTotal = Number(cardCollectedTotal.toFixed(2));
  const roundedCashCollectedTotal = Number(cashCollectedTotal.toFixed(2));
  const serviceRevenue = Number((roundedCardTotal + roundedCashTotal).toFixed(2));
  const totalCollected = Number((roundedCardCollectedTotal + roundedCashCollectedTotal).toFixed(2));
  const common = {
    periodStart: formatBusinessDate(start),
    periodEnd: formatBusinessDate(new Date(end.getTime() - 24 * 60 * 60 * 1000)),
    periodLabel,
    appointmentCount: appointments.length,
    openCount: appointments.filter(
      (appointment) =>
        !(
          [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]
        ).includes(appointment.status),
    ).length,
    pendingPaymentCount: appointments.filter(
      (appointment) => appointment.status === AppointmentStatus.PAYMENT_PENDING,
    ).length,
    cancelledCount: appointments.filter(
      (appointment) => appointment.status === AppointmentStatus.CANCELLED,
    ).length,
    revenue: serviceRevenue,
    completedCount: payments.length,
    cardTotal: roundedCardTotal,
    cashTotal: roundedCashTotal,
    tipTotal: roundedTipTotal,
    cardCollectedTotal: roundedCardCollectedTotal,
    cashCollectedTotal: roundedCashCollectedTotal,
    totalCollected,
    byService: [...byService].map(([serviceName, values]) => ({ serviceName, ...values })),
    byCategory: [...byCategory]
      .map(([categoryName, values]) => ({ categoryName, ...values }))
      .sort((left, right) => right.revenue - left.revenue),
    byStaff: [...byStaff].map(([staffName, values]) => ({ staffName, ...values })),
    dailyTrend,
  };
  if (period === 'month') return { period, businessMonth: formatBusinessMonth(start), ...common };
  return { period, businessDate: formatBusinessDate(start), ...common };
}

export async function getDbReport(date?: Date, client?: D1PrismaRuntime): Promise<DailyReport> {
  const read = async (runtimeClient: D1PrismaRuntime) => {
    const start = date ?? (await currentDbBusinessDate(new Date(), runtimeClient));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return (await getDbReportForRange({
      start,
      end,
      period: 'day',
      periodLabel: formatBusinessDate(start),
      client: runtimeClient,
    })) as DailyReport;
  };
  return client ? read(client) : withPrismaRuntime('dashboard.report.read', ({ client: runtimeClient }) => read(runtimeClient));
}

export async function getDbMonthlyReport(monthStart?: Date, client?: D1PrismaRuntime): Promise<MonthlyReport> {
  const read = async (runtimeClient: D1PrismaRuntime) => {
    const current =
      monthStart ?? parseBusinessMonth(formatBusinessMonth(await currentDbBusinessDate(new Date(), runtimeClient)))!;
    const { start, end } = businessMonthRange(current);
    return (await getDbReportForRange({
      start,
      end,
      period: 'month',
      periodLabel: formatBusinessMonth(start),
      client: runtimeClient,
    })) as MonthlyReport;
  };
  return client ? read(client) : withPrismaRuntime('dashboard.monthly-report.read', ({ client: runtimeClient }) => read(runtimeClient));
}

async function autoCloseDbAttendanceD1(businessDate: Date) {
  return withD1Lease(async (database) => {
    const appointments = await prisma.appointment.findMany({
      where: { businessDate },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        code: true,
        status: true,
        amount: true,
        customerNameSnapshot: true,
        customer: { select: { name: true } },
        payment: { select: { id: true, confirmedAt: true } },
        services: { select: { status: true } },
      },
    });
    const blockers = appointments
      .map((appointment) =>
        getAppointmentClosingBlocker({
          appointmentId: appointment.id,
          code: appointment.code,
          customerName: appointment.customerNameSnapshot || appointment.customer.name,
          status: appointment.status,
          amount: Number(appointment.amount),
          hasPayment: Boolean(appointment.payment?.confirmedAt),
          unfinishedServiceCount: appointment.services.filter(
            (service) =>
              !(
                [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]
              ).includes(service.status),
          ).length,
        }),
      )
      .filter((blocker): blocker is ClosingBlocker => Boolean(blocker));
    if (blockers.length)
      throw new ShiftClosingBlockedError(businessDate.toISOString().slice(0, 10), blockers);

    const [activeServiceAssignments, activeSupportingAppointments] = await Promise.all([
      prisma.appointmentService.findMany({
        where: { appointment: { businessDate }, status: { in: staffBusyAppointmentStatuses } },
        select: { primaryStaffId: true },
      }),
      prisma.appointmentSupportingStaff.findMany({
        where: {
          releasedAt: null,
          appointment: { businessDate, status: { in: checkoutBlockingAppointmentStatuses } },
        },
        select: { staffId: true },
      }),
    ]);
    const checkoutBlockedStaffIds = new Set<string>();
    for (const service of activeServiceAssignments)
      if (service.primaryStaffId) checkoutBlockedStaffIds.add(service.primaryStaffId);
    for (const supportingStaff of activeSupportingAppointments)
      checkoutBlockedStaffIds.add(supportingStaff.staffId);
    const presentAttendance = await prisma.attendance.findMany({
      where: { businessDate, status: AttendanceStatus.PRESENT },
      select: { id: true, staffId: true },
    });
    const deferredAttendance = presentAttendance.filter((attendance) => checkoutBlockedStaffIds.has(attendance.staffId));
    const openAttendance = presentAttendance.filter((attendance) => !checkoutBlockedStaffIds.has(attendance.staffId));
    const closedAt = new Date();
    if (openAttendance.length || deferredAttendance.length) {
      const openIds = openAttendance.map((attendance) => attendance.id);
      const openStaffIds = openAttendance.map((attendance) => attendance.staffId);
      const idPlaceholders = openIds.map(() => '?').join(', ');
      const staffPlaceholders = openStaffIds.map(() => '?').join(', ');
      const statements = [
        ...(openIds.length
          ? [
              d1Statement(database, `UPDATE attendance SET status = ?, check_out_at = ?, closed_by = ? WHERE id IN (${idPlaceholders}) AND status = ?`, AttendanceStatus.CHECKED_OUT, d1DateTimeValue(closedAt), AttendanceClosedBy.AUTO, ...openIds, AttendanceStatus.PRESENT),
            ]
          : []),
        ...(openStaffIds.length
          ? [
              d1Statement(database, `UPDATE staff_service_state SET availability = ? WHERE staff_id IN (${staffPlaceholders}) AND availability = ?`, Availability.AVAILABLE, ...openStaffIds, Availability.BUSY),
            ]
          : []),
        d1AuditEvent(database, { action: 'attendance.auto_closed', entity: 'Attendance', actorId: undefined, metadata: { businessDate: businessDate.toISOString().slice(0, 10), staffIds: openStaffIds, deferredStaffIds: deferredAttendance.map((attendance) => attendance.staffId), checkoutBlockedStaffIds: [...checkoutBlockedStaffIds], closedAt: closedAt.toISOString() } }, d1DateTimeValue(closedAt)),
        d1Statement(database, `INSERT INTO shop_config (id, state_version, created_at, updated_at) VALUES (1, 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET state_version = shop_config.state_version + 1, updated_at = excluded.updated_at`, d1DateTimeValue(closedAt), d1DateTimeValue(closedAt)),
      ];
      const results = (await database.batch(statements)) as D1BatchResult[];
      const attendanceResultIndex = openIds.length ? 0 : -1;
      if (attendanceResultIndex >= 0 && d1BatchChanges(results[attendanceResultIndex]) !== openIds.length)
        throw new Error('Attendance changed before automatic closing could be recorded; retry the job');
    }
    return {
      closedCount: openAttendance.length,
      deferredCount: deferredAttendance.length,
      businessDate: businessDate.toISOString().slice(0, 10),
      skipped: false,
    };
  });
}

export async function autoCloseDbAttendance({ force = false, businessDate: requestedBusinessDate }: { force?: boolean; businessDate?: Date } = {}) {
  const currentBusinessDate = await currentDbBusinessDate();
  const businessDate = requestedBusinessDate ?? currentBusinessDate;
  if (requestedBusinessDate) {
    const dateDelta = Math.round((currentBusinessDate.getTime() - requestedBusinessDate.getTime()) / 86_400_000);
    if (dateDelta < 0 || dateDelta > 1) throw new Error('Closing business date must be today or the immediately previous business date');
  }
  const shopConfig = await getDbShopConfig();
  const closingMinutes = configuredTimeToMinutes(shopConfig.closingTime);
  if (
    !force &&
    formatBusinessDate(businessDate) === formatBusinessDate(currentBusinessDate) &&
    closingMinutes !== null &&
    minutesInTimezone(new Date(), shopConfig.timezone) < closingMinutes
  ) {
    return {
      closedCount: 0,
      deferredCount: 0,
      businessDate: businessDate.toISOString().slice(0, 10),
      skipped: true,
      reason: 'Closing time has not been reached',
    };
  }
  if (await isD1Runtime()) return autoCloseDbAttendanceD1(businessDate);
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const appointments = await tx.appointment.findMany({
      where: { businessDate },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        code: true,
        status: true,
        amount: true,
        customerNameSnapshot: true,
        customer: { select: { name: true } },
        payment: { select: { id: true, confirmedAt: true } },
        services: { select: { status: true } },
      },
    });
    const blockers = appointments
      .map((appointment) =>
        getAppointmentClosingBlocker({
          appointmentId: appointment.id,
          code: appointment.code,
          customerName: appointment.customerNameSnapshot || appointment.customer.name,
          status: appointment.status,
          amount: Number(appointment.amount),
          hasPayment: Boolean(appointment.payment?.confirmedAt),
          unfinishedServiceCount: appointment.services.filter(
            (service) =>
              !(
                [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]
              ).includes(service.status),
          ).length,
        }),
      )
      .filter((blocker): blocker is ClosingBlocker => Boolean(blocker));
    if (blockers.length)
      throw new ShiftClosingBlockedError(businessDate.toISOString().slice(0, 10), blockers);

    const [activeServiceAssignments, activeSupportingAppointments] = await Promise.all([
      tx.appointmentService.findMany({
        where: { appointment: { businessDate }, status: { in: staffBusyAppointmentStatuses } },
        select: { primaryStaffId: true },
      }),
      tx.appointmentSupportingStaff.findMany({
        where: {
          releasedAt: null,
          appointment: { businessDate, status: { in: checkoutBlockingAppointmentStatuses } },
        },
        select: { staffId: true },
      }),
    ]);
    const checkoutBlockedStaffIds = new Set<string>();
    for (const service of activeServiceAssignments)
      if (service.primaryStaffId) checkoutBlockedStaffIds.add(service.primaryStaffId);
    for (const supportingStaff of activeSupportingAppointments)
      checkoutBlockedStaffIds.add(supportingStaff.staffId);
    const presentAttendance = await tx.attendance.findMany({
      where: { businessDate, status: AttendanceStatus.PRESENT },
      select: { id: true, staffId: true },
    });
    const deferredAttendance = presentAttendance.filter((attendance) =>
      checkoutBlockedStaffIds.has(attendance.staffId),
    );
    const openAttendance = presentAttendance.filter(
      (attendance) => !checkoutBlockedStaffIds.has(attendance.staffId),
    );
    const closedAt = new Date();
    for (const attendance of openAttendance) {
      await tx.attendance.update({
        where: { id: attendance.id },
        data: {
          status: transitionAttendance(AttendanceStatus.PRESENT, AttendanceStatus.CHECKED_OUT),
          checkOutAt: closedAt,
          closedBy: AttendanceClosedBy.AUTO,
        },
      });
    }
    if (openAttendance.length || deferredAttendance.length) {
      if (openAttendance.length)
        await tx.staffServiceState.updateMany({
          where: {
            staffId: { in: openAttendance.map((attendance) => attendance.staffId) },
            availability: Availability.BUSY,
          },
          data: { availability: Availability.AVAILABLE },
        });
      await tx.auditEvent.create({
        data: {
          actorType: 'SYSTEM',
          action: 'attendance.auto_closed',
          entity: 'Attendance',
          metadata: {
            businessDate: businessDate.toISOString().slice(0, 10),
            staffIds: openAttendance.map((attendance) => attendance.staffId),
            deferredStaffIds: deferredAttendance.map((attendance) => attendance.staffId),
            checkoutBlockedStaffIds: [...checkoutBlockedStaffIds],
            closedAt: closedAt.toISOString(),
          },
        },
      });
      await bumpBoardVersion(tx);
    }
    return {
      closedCount: openAttendance.length,
      deferredCount: deferredAttendance.length,
      businessDate: businessDate.toISOString().slice(0, 10),
      skipped: false,
    };
  });
}

export async function cleanupDbOperationalData(
  retentionDays = 90,
  auditActor: { actorType: ActorType; actorId?: string } = { actorType: ActorType.SYSTEM },
) {
  const safeRetentionDays = Math.min(3650, Math.max(30, Math.floor(retentionDays)));
  const cutoff = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000);
  const rateLimitCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const now = new Date();
  if (await isD1Runtime()) {
    return withD1Lease(async (database) => {
      const cutoffIso = d1DateTimeValue(cutoff);
      const rateLimitCutoffIso = d1DateTimeValue(rateLimitCutoff);
      const nowIso = d1DateTimeValue(now);
      const results = (await database.batch([
        d1Statement(database, 'DELETE FROM verified_staff_sessions WHERE expires_at < ?', cutoffIso),
        d1Statement(database, 'DELETE FROM command_receipts WHERE created_at < ?', cutoffIso),
        d1Statement(database, `DELETE FROM staff_pin_lockouts WHERE updated_at < ? AND (locked_until IS NULL OR locked_until < ?)`, cutoffIso, nowIso),
        d1Statement(database, 'DELETE FROM kiosk_rate_limits WHERE updated_at < ?', rateLimitCutoffIso),
        d1AuditEvent(database, { actorType: auditActor.actorType, actorId: auditActor.actorId, action: 'operational_data.retention_cleanup', entity: 'OperationalData', metadata: { retentionDays: safeRetentionDays, cutoff: cutoff.toISOString(), rateLimitCutoff: rateLimitCutoff.toISOString() } }, nowIso),
      ])) as D1BatchResult[];
      return {
        retentionDays: safeRetentionDays,
        cutoff: cutoff.toISOString(),
        expiredSessions: d1BatchChanges(results[0]),
        oldReceipts: d1BatchChanges(results[1]),
        oldLockouts: d1BatchChanges(results[2]),
        oldRateLimitRows: d1BatchChanges(results[3]),
      };
    });
  }
  const [expiredSessions, oldReceipts, oldLockouts, oldRateLimitRows] = await prisma.$transaction(async (tx) => {
    const result = await Promise.all([
      tx.verifiedStaffSession.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
      tx.commandReceipt.deleteMany({ where: { createdAt: { lt: cutoff } } }),
      tx.staffPinLockout.deleteMany({
        where: {
          updatedAt: { lt: cutoff },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
      }),
      tx.kioskRateLimit.deleteMany({ where: { updatedAt: { lt: rateLimitCutoff } } }),
    ]);
    await tx.auditEvent.create({
      data: {
        actorType: auditActor.actorType,
        actorId: auditActor.actorId,
        action: 'operational_data.retention_cleanup',
        entity: 'OperationalData',
        metadata: { retentionDays: safeRetentionDays, cutoff: cutoff.toISOString(), rateLimitCutoff: rateLimitCutoff.toISOString() },
      },
    });
    return result;
  });
  return {
    retentionDays: safeRetentionDays,
    cutoff: cutoff.toISOString(),
    expiredSessions: expiredSessions.count,
    oldReceipts: oldReceipts.count,
    oldLockouts: oldLockouts.count,
    oldRateLimitRows: oldRateLimitRows.count,
  };
}

type StaffActionInput = {
  action:
    | 'ACCEPT'
    | 'SKIP'
    | 'FINISH'
    | 'CHECK_IN'
    | 'CHECK_OUT'
    | 'ADD_SUPPORT'
    | 'CONTINUE_WITH_ME';
  appointmentId?: string;
  appointmentServiceId?: string;
  staffId: string;
  pin?: string;
  reason?: string;
  skipReasonId?: string;
  idempotencyKey?: string;
};

async function staffActionD1({
  input,
  stationUserId,
  verifiedSessionId,
  trustedAdmin,
  pin,
  normalizedRequestHash,
  businessDate,
  scope,
  staff,
}: {
  input: StaffActionInput;
  stationUserId: string;
  verifiedSessionId?: string;
  trustedAdmin: boolean;
  pin?: string;
  normalizedRequestHash: string;
  businessDate: Date;
  scope: string;
  staff: { id: string; name: string };
}, databaseOverride?: D1DatabaseLike, clientOverride?: D1PrismaRuntime) {
  const run = async (database: D1DatabaseLike) => {
    const db = clientOverride ?? prisma;
    if (input.idempotencyKey) {
      const prior = await db.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This action key was already used for different action details');
        const stored = prior.response as Prisma.JsonObject;
        const appointmentId =
          typeof stored.appointmentId === 'string' ? stored.appointmentId : null;
        const savedAppointment = appointmentId
          ? await db.appointment.findUnique({
              where: { id: appointmentId },
              select: { code: true },
            })
          : null;
        return {
          ok: true,
          action: input.action,
          staffId: input.staffId,
          appointment: savedAppointment,
          idempotent: true,
          verifiedStaffSessionId: null,
          verifiedStaffSessionExpiresAt: null,
        };
      }
    }

    const config = await db.shopConfig.findUnique({ where: { id: 1 } });
    const now = new Date();
    const nowIso = d1DateTimeValue(now);
    const sessionId = pin ? randomId() : null;
    const sessionExpiresAt = pin
      ? verifiedStaffSessionExpiry(now, config?.verifiedSessionTtlMin ?? 3)
      : null;
    const statements = [] as ReturnType<typeof d1Statement>[];
    if (sessionId && sessionExpiresAt)
      statements.push(
        d1Statement(
          database,
          `INSERT INTO verified_staff_sessions (id, staff_id, station_user_id, started_at, expires_at)
           VALUES (?, ?, ?, ?, ?)`,
          sessionId,
          input.staffId,
          stationUserId,
          nowIso,
          d1DateTimeValue(sessionExpiresAt),
        ),
      );

    const appendReceipt = (appointmentId?: string) => {
      if (!input.idempotencyKey) return;
      statements.push(
        d1Statement(
          database,
          `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          randomId(),
          scope,
          input.idempotencyKey,
          JSON.stringify({
            ok: true,
            staffId: input.staffId,
            action: input.action,
            ...(appointmentId ? { appointmentId } : {}),
          }),
          normalizedRequestHash,
          nowIso,
        ),
      );
    };
    const sessionResponse = {
      verifiedStaffSessionId: sessionId,
      verifiedStaffSessionExpiresAt: sessionExpiresAt,
    };
    const appendAggregate = (
      appointmentId: string,
      aggregate: ReturnType<typeof d1AppointmentAggregate>,
    ) => {
      statements.push(
        d1Statement(
          database,
          `UPDATE appointments
           SET status = ?, service_id = ?, service_name_snapshot = ?, duration_min_snapshot = ?, service_count = ?, primary_staff_id = ?, completed_at = CASE WHEN ? = ? THEN NULL ELSE completed_at END
           WHERE id = ? AND business_date = ?`,
          aggregate.status,
          aggregate.serviceId,
          aggregate.serviceNameSnapshot,
          aggregate.durationMinSnapshot,
          aggregate.serviceCount,
          aggregate.primaryStaffId,
          aggregate.status,
          AppointmentStatus.PAYMENT_PENDING,
          appointmentId,
          d1DateTimeValue(businessDate),
        ),
      );
    };

    if (input.action === 'CHECK_IN' || input.action === 'CHECK_OUT') {
      if (input.action === 'CHECK_OUT') {
        const blockingService = await db.appointmentService.findFirst({
          where: {
            appointment: { businessDate },
            status: { in: manualCheckoutBlockingAppointmentStatuses },
            primaryStaffId: input.staffId,
          },
          select: { appointment: { select: { code: true } } },
        });
        const blockingAppointment =
          blockingService ??
          (await db.appointmentSupportingStaff.findFirst({
            where: {
              staffId: input.staffId,
              releasedAt: null,
              appointment: {
                businessDate,
                status: { in: manualCheckoutBlockingAppointmentStatuses },
              },
            },
            select: { appointment: { select: { code: true } } },
          }));
        if (blockingAppointment)
          throw new Error('Staff cannot check out while assigned to an active turn');
      }
      const existing = await db.attendance.findUnique({
        where: { staffId_businessDate: { staffId: input.staffId, businessDate } },
      });
      let remainingAppointments: number | undefined;
      if (input.action === 'CHECK_IN') {
        statements.push(
          d1Statement(
            database,
            `INSERT INTO attendance (id, staff_id, business_date, check_in_at, check_out_at, status, closed_by)
             VALUES (?, ?, ?, ?, NULL, ?, NULL)
             ON CONFLICT(staff_id, business_date) DO UPDATE SET status = excluded.status, check_in_at = COALESCE(attendance.check_in_at, excluded.check_in_at), check_out_at = NULL, closed_by = NULL`,
            existing?.id ?? randomId(),
            input.staffId,
            d1DateTimeValue(businessDate),
            existing?.checkInAt ? d1DateTimeValue(existing.checkInAt) : nowIso,
            AttendanceStatus.PRESENT,
          ),
        );
        statements.push(
          d1Statement(
            database,
            `INSERT INTO staff_service_state (staff_id, availability)
             VALUES (?, ?)
             ON CONFLICT(staff_id) DO UPDATE SET availability = excluded.availability`,
            input.staffId,
            Availability.AVAILABLE,
          ),
        );
      } else if (existing) {
        statements.push(
          d1Statement(
            database,
            `UPDATE attendance SET status = ?, check_out_at = ?, closed_by = ? WHERE id = ? AND status = ?`,
            AttendanceStatus.CHECKED_OUT,
            nowIso,
            AttendanceClosedBy.STAFF,
            existing.id,
            AttendanceStatus.PRESENT,
          ),
        );
        statements.push(
          d1Statement(
            database,
            `UPDATE staff_service_state SET availability = ? WHERE staff_id = ?`,
            Availability.AVAILABLE,
            input.staffId,
          ),
        );
      }

      if (input.action === 'CHECK_IN') {
        const [routingConfig, routingStaff] = await Promise.all([
          db.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } }),
          staffForBusinessDate(db, businessDate),
        ]);
        const candidates = routingStaff.map(mapStaff);
        const checkedInCandidate = candidates.find((candidate) => candidate.id === input.staffId);
        if (checkedInCandidate) {
          checkedInCandidate.isPresent = true;
          checkedInCandidate.availability = Availability.AVAILABLE;
        }
        const routingSnapshot = {
          candidates,
          roundRobinEnabled: routingConfig?.roundRobinEnabled ?? true,
        };
        const waitingWhere = {
          businessDate,
          status: {
            in: [
              AppointmentStatus.CREATED,
              AppointmentStatus.WAITING,
              AppointmentStatus.ASSIGNED,
            ],
          },
        };
        const waitingAppointmentCount = await db.appointment.count({ where: waitingWhere });
        const waitingAppointments = await db.appointment.findMany({
          where: waitingWhere,
          orderBy: { createdAt: 'asc' },
          take: MAX_ROUTING_APPOINTMENTS_PER_BATCH,
          select: { id: true },
        });
        remainingAppointments = Math.max(0, waitingAppointmentCount - waitingAppointments.length);
        for (const waitingAppointment of waitingAppointments) {
          const appointment = await db.appointment.findUnique({
            where: { id: waitingAppointment.id },
            include: appointmentInclude,
          });
          if (!appointment) continue;
          const before = {
            primaryStaffId: appointment.primaryStaffId,
            status: appointment.status,
          };
          const services = appointment.services.map((service) => ({
            ...service,
            turns: [...service.turns],
            turnExclusions: [...service.turnExclusions],
          })) as D1RouteService[];
          const routePlan = await d1RouteAppointmentPlan(
            database,
            appointment as unknown as D1RouteAppointment,
            services,
            businessDate,
            { routingSnapshot },
          );
          const aggregate = d1AppointmentAggregate(appointment, routePlan.services);
          statements.push(...routePlan.statements);
          appendAggregate(appointment.id, aggregate);
          if (
            aggregate.primaryStaffId &&
            (aggregate.primaryStaffId !== before.primaryStaffId ||
              before.status === AppointmentStatus.WAITING)
          )
            statements.push(
              d1AuditEvent(
                database,
                {
                  action: 'appointment.reassigned_after_check_in',
                  entity: 'Appointment',
                  entityId: appointment.id,
                  metadata: { staffId: aggregate.primaryStaffId },
                },
                nowIso,
              ),
            );
        }
      }
      statements.push(
        d1AuditEvent(
          database,
          {
            actorType: trustedAdmin ? ActorType.ADMIN : ActorType.STAFF,
            actorId: trustedAdmin ? stationUserId : input.staffId,
            action: 'attendance.' + input.action.toLowerCase(),
            entity: 'Attendance',
            entityId: input.staffId,
            metadata: { businessDate: formatBusinessDate(businessDate) },
          },
          nowIso,
        ),
      );
      appendReceipt();
      statements.push(d1BumpBoardVersion(database, nowIso));
      await database.batch(statements);
      return {
        ok: true,
        staffId: input.staffId,
        action: input.action,
        ...(remainingAppointments === undefined ? {} : { remainingAppointments }),
        ...sessionResponse,
      };
    }

    if (!input.appointmentId) throw new Error('Appointment is required');
    const appointment = await db.appointment.findUnique({
      where: { id: input.appointmentId },
      include: appointmentInclude,
    });
    if (!appointment) throw new Error('Appointment not found');
    if (['ACCEPT', 'FINISH', 'ADD_SUPPORT', 'CONTINUE_WITH_ME'].includes(input.action)) {
      const attendance = await db.attendance.findUnique({
        where: { staffId_businessDate: { staffId: input.staffId, businessDate } },
        select: { status: true },
      });
      if (attendance?.status !== AttendanceStatus.PRESENT)
        throw new Error('Staff must be active and clocked in for this action');
    }

    const copyServices = () =>
      appointment.services.map((service) => ({
        ...service,
        turns: [...service.turns],
        turnExclusions: [...service.turnExclusions],
      })) as D1RouteService[];

    if (input.action === 'CONTINUE_WITH_ME') {
      if (!input.appointmentServiceId) throw new Error('Choose the next service to continue');
      const currentService = appointment.services.find(
        (service) =>
          service.status === AppointmentStatus.IN_SERVICE &&
          service.primaryStaffId === input.staffId,
      );
      if (!currentService)
        throw new Error(
          'Only the specialist currently serving this guest can continue the next service',
        );
      const pendingStatuses: AppointmentStatus[] = [
        AppointmentStatus.CREATED,
        AppointmentStatus.WAITING,
        AppointmentStatus.ASSIGNED,
      ];
      const nextService = [...appointment.services]
        .filter(
          (service) =>
            service.sequence > currentService.sequence && pendingStatuses.includes(service.status),
        )
        .sort((left, right) => left.sequence - right.sequence)[0];
      if (!nextService || nextService.id !== input.appointmentServiceId)
        throw new Error('Only the next pending service can be continued');
      if (nextService.primaryStaffId === input.staffId)
        throw new Error('This service is already assigned to you');
      if (nextService.turnExclusions.some((exclusion) => exclusion.staffId === input.staffId))
        throw new Error(
          'You were explicitly skipped for this service; a manager must override that exclusion first',
        );
      const continuingStaff = await db.staff.findUnique({
        where: { id: input.staffId },
        select: {
          id: true,
          name: true,
          skills: { select: { skill: { select: { name: true } } } },
        },
      });
      if (!continuingStaff) throw new Error('Staff verification failed');
      const requiredSkills = nextService.service.requiredSkills.map((item) => item.skill.name);
      const staffSkills = continuingStaff.skills.map((item) => item.skill.name);
      if (!requiredSkills.every((skill) => staffSkills.includes(skill)))
        throw new Error('You do not have the required skills for the next service');
      const activeNextTurn = [...nextService.turns]
        .reverse()
        .find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
      if (
        activeNextTurn?.status === TurnStatus.ACCEPTED ||
        nextService.status === AppointmentStatus.IN_SERVICE
      )
        throw new Error(
          'The next service has already been accepted; use manager reassignment instead',
        );
      const previousStaffId = nextService.primaryStaffId;
      const services = copyServices();
      const nextServiceCopy = services.find((service) => service.id === nextService.id);
      if (!nextServiceCopy) throw new Error('Appointment service not found');
      if (activeNextTurn) {
        statements.push(
          d1Statement(
            database,
            `UPDATE turns SET status = ?, reason = ?, ended_at = ? WHERE id = ? AND status = ?`,
            TurnStatus.SKIPPED,
            input.reason?.trim() || 'Customer requested to continue with the current specialist',
            nowIso,
            activeNextTurn.id,
            activeNextTurn.status,
          ),
        );
        statements.push(
          d1TurnEvent(
            database,
            {
              appointmentId: appointment.id,
              appointmentServiceId: nextService.id,
              turnId: activeNextTurn.id,
              eventType: TurnEventType.SKIPPED,
              assignedStaffId: activeNextTurn.assignedStaffId,
              assignedStaffName: nextService.primaryStaff?.name ?? null,
              actorType: ActorType.STAFF,
              actorId: input.staffId,
              actorName: continuingStaff.name,
              reason:
                input.reason || 'Customer requested to continue with the current specialist',
            },
            nowIso,
          ),
        );
      }
      const serviceUpdateIndex = statements.length;
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_services SET status = ?, primary_staff_id = ? WHERE id = ? AND status IN (?, ?, ?)`,
          AppointmentStatus.ASSIGNED,
          input.staffId,
          nextService.id,
          AppointmentStatus.CREATED,
          AppointmentStatus.WAITING,
          AppointmentStatus.ASSIGNED,
        ),
      );
      const continuedTurnId = randomId();
      statements.push(
        d1Statement(
          database,
          `INSERT INTO turns (id, appointment_id, appointment_service_id, assigned_staff_id, status, reason, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          continuedTurnId,
          appointment.id,
          nextService.id,
          input.staffId,
          TurnStatus.ASSIGNED,
          'Customer requested the same specialist',
          nowIso,
        ),
      );
      statements.push(
        d1TurnEvent(
          database,
          {
            appointmentId: appointment.id,
            appointmentServiceId: nextService.id,
            turnId: continuedTurnId,
            eventType: TurnEventType.CONTINUED_WITH_ME,
            assignedStaffId: input.staffId,
            assignedStaffName: continuingStaff.name,
            actorType: ActorType.STAFF,
            actorId: input.staffId,
            actorName: continuingStaff.name,
            reason: input.reason || 'Customer requested the same specialist',
          },
          nowIso,
        ),
      );
      statements.push(
        d1Statement(
          database,
          `INSERT INTO staff_service_state (staff_id, availability, last_assigned_at)
           VALUES (?, ?, ?)
           ON CONFLICT(staff_id) DO UPDATE SET availability = excluded.availability, last_assigned_at = excluded.last_assigned_at`,
          input.staffId,
          Availability.BUSY,
          nowIso,
        ),
      );
      if (previousStaffId && previousStaffId !== input.staffId)
        statements.push(...d1ReleaseStaffStatements(database, businessDate, [previousStaffId]));
      nextServiceCopy.status = AppointmentStatus.ASSIGNED;
      nextServiceCopy.primaryStaffId = input.staffId;
      appendAggregate(appointment.id, d1AppointmentAggregate(appointment, services));
      statements.push(
        d1AuditEvent(
          database,
          {
            actorType: ActorType.STAFF,
            actorId: input.staffId,
            action: 'appointment_service.continued_with_staff',
            entity: 'AppointmentService',
            entityId: nextService.id,
            metadata: {
              appointmentId: appointment.id,
              previousStaffId,
              staffId: input.staffId,
              reason: input.reason?.trim() || 'Customer requested the same specialist',
            },
          },
          nowIso,
        ),
      );
      statements.push(d1BumpBoardVersion(database, nowIso));
      appendReceipt(appointment.id);
      const results = (await database.batch(statements)) as D1BatchResult[];
      if (d1BatchChanges(results[serviceUpdateIndex]) !== 1)
        throw new Error('The next service changed before it could be continued; retry the command');
      const updated = await db.appointment.findUnique({
        where: { id: appointment.id },
        select: { code: true },
      });
      return {
        ok: true,
        action: input.action,
        staffId: input.staffId,
        appointment: updated,
        ...sessionResponse,
      };
    }

    const currentService = input.appointmentServiceId
      ? appointment.services.find((service) => service.id === input.appointmentServiceId)
      : (appointment.services.find((service) => service.status === AppointmentStatus.IN_SERVICE) ??
        appointment.services.find((service) => service.status === AppointmentStatus.ASSIGNED) ??
        appointment.services.find(
          (service) =>
            service.status === AppointmentStatus.WAITING ||
            service.status === AppointmentStatus.CREATED,
        ));
    if (!currentService) throw new Error('Appointment service not found');
    const activeTurn = [...currentService.turns]
      .reverse()
      .find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
    if (!activeTurn) throw new Error('No active turn');
    if (
      ['ACCEPT', 'SKIP', 'FINISH'].includes(input.action) &&
      activeTurn.assignedStaffId !== input.staffId
    )
      throw new Error('This turn is assigned to another staff member');
    if (input.action === 'ACCEPT' && activeTurn.status !== TurnStatus.ASSIGNED)
      throw new Error('This turn has already been accepted');
    if (input.action === 'FINISH' && activeTurn.status !== TurnStatus.ACCEPTED)
      throw new Error('Accept the turn before completing service');
    if (
      input.action === 'SKIP' &&
      !([TurnStatus.ASSIGNED, TurnStatus.ACCEPTED] as TurnStatus[]).includes(activeTurn.status)
    )
      throw new Error('This turn cannot be skipped');

    if (input.action === 'ADD_SUPPORT') {
      if (appointment.status !== AppointmentStatus.IN_SERVICE)
        throw new Error('Supporting staff can only be added during service');
      const supportRows = await staffForBusinessDate(prisma, businessDate);
      const supportingStaff = supportRows
        .map(mapStaff)
        .find((candidate) => candidate.id === input.staffId);
      if (!supportingStaff?.isPresent || supportingStaff.availability !== Availability.AVAILABLE)
        throw new Error('Supporting staff must be present and available');
      statements.push(
        d1Statement(
          database,
          `INSERT INTO appointment_supporting_staff (appointment_id, staff_id, added_at, released_at)
           VALUES (?, ?, ?, NULL)
           ON CONFLICT(appointment_id, staff_id) DO UPDATE SET added_at = excluded.added_at, released_at = NULL`,
          appointment.id,
          input.staffId,
          nowIso,
        ),
      );
      statements.push(
        d1Statement(
          database,
          `INSERT INTO staff_service_state (staff_id, availability, last_assigned_at)
           VALUES (?, ?, ?)
           ON CONFLICT(staff_id) DO UPDATE SET availability = excluded.availability, last_assigned_at = excluded.last_assigned_at`,
          input.staffId,
          Availability.BUSY,
          nowIso,
        ),
      );
      statements.push(
        d1TurnEvent(
          database,
          {
            appointmentId: appointment.id,
            appointmentServiceId: currentService.id,
            turnId: activeTurn.id,
            eventType: TurnEventType.SUPPORT_ADDED,
            assignedStaffId: input.staffId,
            assignedStaffName: supportingStaff.name,
            actorType: ActorType.STAFF,
            actorId: input.staffId,
            actorName: supportingStaff.name,
            reason: input.reason || 'Support added to the current service',
          },
          nowIso,
        ),
      );
    }

    const services = copyServices();
    const currentServiceCopy = services.find((service) => service.id === currentService.id);
    if (!currentServiceCopy) throw new Error('Appointment service not found');
    const guardedIndexes: number[] = [];
    if (input.action === 'ACCEPT') {
      guardedIndexes.push(statements.length);
      statements.push(
        d1Statement(
          database,
          `UPDATE turns SET status = ? WHERE id = ? AND status = ?`,
          TurnStatus.ACCEPTED,
          activeTurn.id,
          TurnStatus.ASSIGNED,
        ),
      );
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_services SET status = ? WHERE id = ? AND status = ?`,
          AppointmentStatus.IN_SERVICE,
          currentService.id,
          AppointmentStatus.ASSIGNED,
        ),
      );
      statements.push(
        d1TurnEvent(
          database,
          {
            appointmentId: appointment.id,
            appointmentServiceId: currentService.id,
            turnId: activeTurn.id,
            eventType: TurnEventType.ACCEPTED,
            assignedStaffId: input.staffId,
            assignedStaffName: currentService.primaryStaff?.name ?? staff.name,
            actorType: ActorType.STAFF,
            actorId: input.staffId,
            actorName: staff.name,
          },
          nowIso,
        ),
      );
      currentServiceCopy.status = AppointmentStatus.IN_SERVICE;
      appendAggregate(appointment.id, d1AppointmentAggregate(appointment, services));
    }

    if (input.action === 'FINISH') {
      guardedIndexes.push(statements.length);
      statements.push(
        d1Statement(
          database,
          `UPDATE turns SET status = ?, ended_at = ? WHERE id = ? AND status = ?`,
          TurnStatus.FINISHED,
          nowIso,
          activeTurn.id,
          TurnStatus.ACCEPTED,
        ),
      );
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_services SET status = ?, completed_at = ? WHERE id = ? AND status = ?`,
          AppointmentStatus.COMPLETED,
          nowIso,
          currentService.id,
          AppointmentStatus.IN_SERVICE,
        ),
      );
      statements.push(
        d1TurnEvent(
          database,
          {
            appointmentId: appointment.id,
            appointmentServiceId: currentService.id,
            turnId: activeTurn.id,
            eventType: TurnEventType.FINISHED,
            assignedStaffId: input.staffId,
            assignedStaffName: currentService.primaryStaff?.name ?? staff.name,
            actorType: ActorType.STAFF,
            actorId: input.staffId,
            actorName: staff.name,
          },
          nowIso,
        ),
      );
      currentServiceCopy.status = AppointmentStatus.COMPLETED;
      currentServiceCopy.completedAt = now;
      const participatingStaffIds = [
        ...new Set([input.staffId, ...appointment.supportingStaff.map((member) => member.staffId)]),
      ];
      for (const participatingStaffId of participatingStaffIds)
        statements.push(
          d1Statement(
            database,
            `INSERT INTO staff_service_state (staff_id, last_service_finished_at, availability)
             VALUES (?, ?, ?)
             ON CONFLICT(staff_id) DO UPDATE SET last_service_finished_at = excluded.last_service_finished_at`,
            participatingStaffId,
            nowIso,
            Availability.AVAILABLE,
          ),
        );
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_supporting_staff SET released_at = ? WHERE appointment_id = ? AND released_at IS NULL`,
          nowIso,
          appointment.id,
        ),
      );
      for (const support of appointment.supportingStaff.filter((member) => !member.releasedAt))
        statements.push(
          d1TurnEvent(
            database,
            {
              appointmentId: appointment.id,
              appointmentServiceId: currentService.id,
              turnId: activeTurn.id,
              eventType: TurnEventType.SUPPORT_RELEASED,
              assignedStaffId: support.staffId,
              actorType: ActorType.STAFF,
              actorId: input.staffId,
              actorName: staff.name,
              reason: 'Support released after the service finished',
            },
            nowIso,
          ),
        );
      statements.push(...d1ReleaseStaffStatements(database, businessDate, participatingStaffIds));
      const [routingConfig, routingStaff] = await Promise.all([
        db.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } }),
        staffForBusinessDate(db, businessDate),
      ]);
      const routePlan = await d1RouteAppointmentPlan(
        database,
        appointment as unknown as D1RouteAppointment,
        services,
        businessDate,
        {
          releasedStaffIds: participatingStaffIds,
          routingSnapshot: {
            candidates: routingStaff.map(mapStaff),
            roundRobinEnabled: routingConfig?.roundRobinEnabled ?? true,
          },
        },
      );
      statements.push(...routePlan.statements);
      appendAggregate(appointment.id, d1AppointmentAggregate(appointment, routePlan.services));
    }

    if (input.action === 'SKIP') {
      const skipReason = input.skipReasonId
        ? await db.skipReason.findFirst({
            where: { id: input.skipReasonId, isActive: true },
            select: { id: true, name: true },
          })
        : null;
      if (!skipReason) throw new Error('Choose an active skip reason');
      const skipNote = input.reason?.trim() || skipReason.name;
      guardedIndexes.push(statements.length);
      statements.push(
        d1Statement(
          database,
          `UPDATE turns SET status = ?, reason = ?, skip_reason_id = ?, skip_reason_name_snapshot = ?, ended_at = ? WHERE id = ? AND status IN (?, ?)`,
          TurnStatus.SKIPPED,
          skipNote,
          skipReason.id,
          skipReason.name,
          nowIso,
          activeTurn.id,
          TurnStatus.ASSIGNED,
          TurnStatus.ACCEPTED,
        ),
      );
      statements.push(
        d1Statement(
          database,
          `UPDATE appointment_services SET status = ?, primary_staff_id = NULL WHERE id = ? AND status IN (?, ?, ?)`,
          AppointmentStatus.WAITING,
          currentService.id,
          AppointmentStatus.ASSIGNED,
          AppointmentStatus.IN_SERVICE,
          AppointmentStatus.WAITING,
        ),
      );
      statements.push(
        d1TurnEvent(
          database,
          {
            appointmentId: appointment.id,
            appointmentServiceId: currentService.id,
            turnId: activeTurn.id,
            eventType: TurnEventType.SKIPPED,
            assignedStaffId: activeTurn.assignedStaffId,
            assignedStaffName: currentService.primaryStaff?.name ?? staff.name,
            actorType: ActorType.STAFF,
            actorId: input.staffId,
            actorName: staff.name,
            reason: skipNote,
          },
          nowIso,
        ),
      );
      statements.push(
        d1Statement(
          database,
          `INSERT INTO turn_exclusions (id, appointment_service_id, staff_id, reason, created_at, overridden_at, override_reason, overridden_by_id)
           VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
           ON CONFLICT(appointment_service_id, staff_id) DO UPDATE SET reason = excluded.reason, overridden_at = NULL, override_reason = NULL, overridden_by_id = NULL`,
          randomId(),
          currentService.id,
          input.staffId,
          skipReason.name,
          nowIso,
        ),
      );
      currentServiceCopy.status = AppointmentStatus.WAITING;
      currentServiceCopy.primaryStaffId = null;
      const [routingConfig, routingStaff] = await Promise.all([
        db.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } }),
        staffForBusinessDate(db, businessDate),
      ]);
      const routePlan = await d1RouteAppointmentPlan(
        database,
        appointment as unknown as D1RouteAppointment,
        services,
        businessDate,
        {
          excludedServiceId: currentService.id,
          excludedStaffId: input.staffId,
          releasedStaffIds: [input.staffId],
          routingSnapshot: {
            candidates: routingStaff.map(mapStaff),
            roundRobinEnabled: routingConfig?.roundRobinEnabled ?? true,
          },
        },
      );
      statements.push(...routePlan.statements);
      appendAggregate(appointment.id, d1AppointmentAggregate(appointment, routePlan.services));
    }

    statements.push(
      d1AuditEvent(
        database,
        {
          actorType: ActorType.STAFF,
          actorId: input.staffId,
          action: 'turn.' + input.action.toLowerCase(),
          entity: 'Appointment',
          entityId: appointment.id,
          metadata: { reason: input.reason ?? null, skipReasonId: input.skipReasonId ?? null },
        },
        nowIso,
      ),
    );
    statements.push(d1BumpBoardVersion(database, nowIso));
    appendReceipt(appointment.id);
    const results = (await database.batch(statements)) as D1BatchResult[];
    for (const statementIndex of guardedIndexes) {
      if (d1BatchChanges(results[statementIndex]) !== 1)
        throw new Error('The turn changed before the action could be recorded; retry the command');
    }
    const updated = await prisma.appointment.findUnique({
      where: { id: appointment.id },
      select: { code: true },
    });
    return {
      ok: true,
      appointment: updated,
      ...sessionResponse,
    };
  };
  return databaseOverride ? run(databaseOverride) : withD1Lease(run);
}

export async function staffActionDb(
  input: StaffActionInput,
  stationUserId: string,
  verifiedSessionId?: string,
  trustedAdmin = false,
) {
  const pin = input.pin?.trim() || undefined;
  const normalizedRequestHash = await requestHash({
    action: input.action,
    appointmentId: input.appointmentId ?? null,
    appointmentServiceId: input.appointmentServiceId ?? null,
    staffId: input.staffId,
    reason: input.reason ?? null,
    skipReasonId: input.skipReasonId ?? null,
  });
  const staff = await prisma.staff.findUnique({
    where: { id: input.staffId },
    include: { serviceState: true },
  });
  if (!staff || !staff.isActive) throw new Error('Staff verification failed');
  if (trustedAdmin) {
    // Admin attendance actions are already protected by the admin route guard.
  } else if (pin) {
    await assertDbPinNotLocked(input.staffId);
    if (!(await verifySecret(staff.pinHash, pin))) {
      await recordDbPinAttempt(input.staffId, false);
      throw new Error('Incorrect PIN. Please try again.');
    }
    await recordDbPinAttempt(input.staffId, true);
  } else {
    const verifiedSession = verifiedSessionId
      ? await prisma.verifiedStaffSession.findFirst({
          where: {
            id: verifiedSessionId,
            staffId: input.staffId,
            stationUserId,
            expiresAt: { gt: new Date() },
            revokedAt: null,
          },
        })
      : null;
    if (!verifiedSession) throw new Error('Staff verification required');
  }
  const businessDate = await currentDbBusinessDate();
  const scope = 'staff:' + stationUserId + ':' + input.staffId;
  if (await isD1Runtime())
    return withD1PrismaLease(({ client, database }) =>
      staffActionD1(
        {
          input,
          stationUserId,
          verifiedSessionId,
          trustedAdmin,
          pin,
          normalizedRequestHash,
          businessDate,
          scope,
          staff,
        },
        database,
        client,
      ),
    );
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({
        where: { scope_key: { scope, key: input.idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash)
          throw new Error('This action key was already used for different action details');
        const stored = prior.response as Prisma.JsonObject;
        const appointmentId =
          typeof stored.appointmentId === 'string' ? stored.appointmentId : null;
        const savedAppointment = appointmentId
          ? await tx.appointment.findUnique({
              where: { id: appointmentId },
              include: appointmentInclude,
            })
          : null;
        return {
          ok: true,
          action: input.action,
          staffId: input.staffId,
          appointment: savedAppointment ? mapAppointment(savedAppointment) : null,
          idempotent: true,
          verifiedStaffSessionId: null,
          verifiedStaffSessionExpiresAt: null,
        };
      }
    }
    const config = await tx.shopConfig.findUnique({ where: { id: 1 } });
    const session = pin
      ? await tx.verifiedStaffSession.create({
          data: {
            staffId: input.staffId,
            stationUserId,
            expiresAt: verifiedStaffSessionExpiry(new Date(), config?.verifiedSessionTtlMin ?? 3),
          },
        })
      : null;
    if (input.action === 'CHECK_IN' || input.action === 'CHECK_OUT') {
      if (input.action === 'CHECK_OUT') {
        const blockingService = await tx.appointmentService.findFirst({
          where: {
            appointment: { businessDate },
            status: { in: manualCheckoutBlockingAppointmentStatuses },
            primaryStaffId: input.staffId,
          },
          select: { appointment: { select: { code: true } } },
        });
        const blockingAppointment =
          blockingService ??
          (await tx.appointmentSupportingStaff.findFirst({
            where: {
              staffId: input.staffId,
              releasedAt: null,
              appointment: {
                businessDate,
                status: { in: manualCheckoutBlockingAppointmentStatuses },
              },
            },
            select: { appointment: { select: { code: true } } },
          }));
        if (blockingAppointment)
          throw new Error('Staff cannot check out while assigned to an active turn');
      }
      const existing = await tx.attendance.findUnique({
        where: { staffId_businessDate: { staffId: input.staffId, businessDate } },
      });
      const now = new Date();
      if (input.action === 'CHECK_IN')
        await tx.attendance.upsert({
          where: { staffId_businessDate: { staffId: input.staffId, businessDate } },
          update: {
            status: AttendanceStatus.PRESENT,
            checkInAt: existing?.checkInAt ?? now,
            checkOutAt: null,
            closedBy: null,
          },
          create: {
            staffId: input.staffId,
            businessDate,
            status: AttendanceStatus.PRESENT,
            checkInAt: now,
          },
        });
      else if (existing)
        await tx.attendance.update({
          where: { id: existing.id },
          data: {
            status: AttendanceStatus.CHECKED_OUT,
            checkOutAt: now,
            closedBy: AttendanceClosedBy.STAFF,
          },
        });
      if (input.action === 'CHECK_IN')
        await tx.staffServiceState.upsert({
          where: { staffId: input.staffId },
          update: { availability: Availability.AVAILABLE },
          create: { staffId: input.staffId, availability: Availability.AVAILABLE },
        });
      if (input.action === 'CHECK_OUT')
        await tx.staffServiceState.updateMany({
          where: { staffId: input.staffId },
          data: { availability: Availability.AVAILABLE },
        });
      let remainingAppointments: number | undefined;
      if (input.action === 'CHECK_IN') {
        const [routingConfig, routingStaff] = await Promise.all([
          tx.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } }),
          staffForBusinessDate(tx, businessDate),
        ]);
        const routingSnapshot = {
          candidates: routingStaff.map(mapStaff),
          roundRobinEnabled: routingConfig?.roundRobinEnabled ?? true,
        };
        const waitingWhere = {
          businessDate,
          status: {
            in: [
              AppointmentStatus.CREATED,
              AppointmentStatus.WAITING,
              AppointmentStatus.ASSIGNED,
            ],
          },
        };
        const waitingAppointmentCount = await tx.appointment.count({ where: waitingWhere });
        const waitingAppointments = await tx.appointment.findMany({
          where: waitingWhere,
          orderBy: { createdAt: 'asc' },
          take: MAX_ROUTING_APPOINTMENTS_PER_BATCH,
          select: { id: true },
        });
        remainingAppointments = Math.max(0, waitingAppointmentCount - waitingAppointments.length);
        for (const waitingAppointment of waitingAppointments) {
          const before = await tx.appointment.findUnique({
            where: { id: waitingAppointment.id },
            select: { primaryStaffId: true, status: true },
          });
          const updated = await routeAppointmentServices(
            tx,
            waitingAppointment.id,
            businessDate,
            undefined,
            undefined,
            routingSnapshot,
          );
          if (
            updated.primaryStaffId &&
            (updated.primaryStaffId !== before?.primaryStaffId ||
              before?.status === AppointmentStatus.WAITING)
          ) {
            await tx.auditEvent.create({
              data: {
                actorType: 'SYSTEM',
                action: 'appointment.reassigned_after_check_in',
                entity: 'Appointment',
                entityId: waitingAppointment.id,
                metadata: { staffId: updated.primaryStaffId },
              },
            });
          }
        }
      }
      await tx.auditEvent.create({
        data: {
          actorType: trustedAdmin ? 'ADMIN' : 'STAFF',
          actorId: trustedAdmin ? stationUserId : input.staffId,
          action: 'attendance.' + input.action.toLowerCase(),
          entity: 'Attendance',
          entityId: input.staffId,
          metadata: { businessDate: businessDate.toISOString().slice(0, 10) },
        },
      });
      const result = {
        ok: true,
        staffId: input.staffId,
        action: input.action,
        ...(remainingAppointments === undefined ? {} : { remainingAppointments }),
        verifiedStaffSessionId: session?.id ?? null,
        verifiedStaffSessionExpiresAt: session?.expiresAt ?? null,
      };
      if (input.idempotencyKey)
        await tx.commandReceipt.create({
          data: {
            scope,
            key: input.idempotencyKey,
            requestHash: normalizedRequestHash,
            response: { ok: true, staffId: input.staffId, action: input.action },
          },
        });
      await bumpBoardVersion(tx);
      return result;
    }
    if (!input.appointmentId) throw new Error('Appointment is required');
    const appointment = await tx.appointment.findUnique({
      where: { id: input.appointmentId },
      include: appointmentInclude,
    });
    if (!appointment) throw new Error('Appointment not found');
    if (['ACCEPT', 'FINISH', 'ADD_SUPPORT', 'CONTINUE_WITH_ME'].includes(input.action)) {
      const transactionalStaff = await tx.staff.findUnique({
        where: { id: input.staffId },
        select: { isActive: true },
      });
      const attendance = await tx.attendance.findUnique({
        where: { staffId_businessDate: { staffId: input.staffId, businessDate } },
        select: { status: true },
      });
      if (!transactionalStaff?.isActive || attendance?.status !== AttendanceStatus.PRESENT)
        throw new Error('Staff must be active and clocked in for this action');
    }
    if (input.action === 'CONTINUE_WITH_ME') {
      if (!input.appointmentServiceId) throw new Error('Choose the next service to continue');
      const currentService = appointment.services.find(
        (service) =>
          service.status === AppointmentStatus.IN_SERVICE &&
          service.primaryStaffId === input.staffId,
      );
      if (!currentService)
        throw new Error(
          'Only the specialist currently serving this guest can continue the next service',
        );
      const pendingStatuses: AppointmentStatus[] = [
        AppointmentStatus.CREATED,
        AppointmentStatus.WAITING,
        AppointmentStatus.ASSIGNED,
      ];
      const nextService = [...appointment.services]
        .filter(
          (service) =>
            service.sequence > currentService.sequence && pendingStatuses.includes(service.status),
        )
        .sort((left, right) => left.sequence - right.sequence)[0];
      if (!nextService || nextService.id !== input.appointmentServiceId)
        throw new Error('Only the next pending service can be continued');
      if (nextService.primaryStaffId === input.staffId)
        throw new Error('This service is already assigned to you');
      if (nextService.turnExclusions.some((exclusion) => exclusion.staffId === input.staffId))
        throw new Error(
          'You were explicitly skipped for this service; a manager must override that exclusion first',
        );

      const continuingStaff = await tx.staff.findUnique({
        where: { id: input.staffId },
        select: { id: true, name: true, skills: { select: { skill: { select: { name: true } } } } },
      });
      if (!continuingStaff) throw new Error('Staff verification failed');
      const requiredSkills = nextService.service.requiredSkills.map((item) => item.skill.name);
      const staffSkills = continuingStaff.skills.map((item) => item.skill.name);
      if (!requiredSkills.every((skill) => staffSkills.includes(skill)))
        throw new Error('You do not have the required skills for the next service');

      const activeNextTurn = [...nextService.turns]
        .reverse()
        .find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
      if (
        activeNextTurn?.status === TurnStatus.ACCEPTED ||
        nextService.status === AppointmentStatus.IN_SERVICE
      )
        throw new Error(
          'The next service has already been accepted; use manager reassignment instead',
        );
      const previousStaffId = nextService.primaryStaffId;
      if (activeNextTurn) {
        await tx.turn.update({
          where: { id: activeNextTurn.id },
          data: {
            status: transitionTurn(activeNextTurn.status, TurnStatus.SKIPPED),
            reason:
              input.reason?.trim() || 'Customer requested to continue with the current specialist',
            endedAt: new Date(),
          },
        });
        await recordTurnEvent(tx, {
          appointmentId: appointment.id,
          appointmentServiceId: nextService.id,
          turnId: activeNextTurn.id,
          eventType: TurnEventType.SKIPPED,
          assignedStaffId: activeNextTurn.assignedStaffId,
          assignedStaffName: nextService.primaryStaff?.name ?? null,
          actorType: ActorType.STAFF,
          actorId: input.staffId,
          actorName: continuingStaff.name,
          reason: input.reason || 'Customer requested to continue with the current specialist',
        });
      }
      await tx.appointmentService.update({
        where: { id: nextService.id },
        data: { status: AppointmentStatus.ASSIGNED, primaryStaffId: input.staffId },
      });
      const continuedTurn = await tx.turn.create({
        data: {
          appointmentId: appointment.id,
          appointmentServiceId: nextService.id,
          assignedStaffId: input.staffId,
          status: TurnStatus.ASSIGNED,
          reason: 'Customer requested the same specialist',
        },
      });
      await recordTurnEvent(tx, {
        appointmentId: appointment.id,
        appointmentServiceId: nextService.id,
        turnId: continuedTurn.id,
        eventType: TurnEventType.CONTINUED_WITH_ME,
        assignedStaffId: input.staffId,
        assignedStaffName: continuingStaff.name,
        actorType: ActorType.STAFF,
        actorId: input.staffId,
        actorName: continuingStaff.name,
        reason: input.reason || 'Customer requested the same specialist',
      });
      await tx.staffServiceState.upsert({
        where: { staffId: input.staffId },
        update: { availability: Availability.BUSY, lastAssignedAt: new Date() },
        create: {
          staffId: input.staffId,
          availability: Availability.BUSY,
          lastAssignedAt: new Date(),
        },
      });
      if (previousStaffId && previousStaffId !== input.staffId)
        await releaseCompletedAppointmentStaff(tx, businessDate, [previousStaffId]);
      await syncAppointmentAggregate(tx, appointment.id);
      await tx.auditEvent.create({
        data: {
          actorType: 'STAFF',
          actorId: input.staffId,
          action: 'appointment_service.continued_with_staff',
          entity: 'AppointmentService',
          entityId: nextService.id,
          metadata: {
            appointmentId: appointment.id,
            previousStaffId,
            staffId: input.staffId,
            reason: input.reason?.trim() || 'Customer requested the same specialist',
          },
        },
      });
      await bumpBoardVersion(tx);
      const updated = await tx.appointment.findUnique({
        where: { id: appointment.id },
        include: appointmentInclude,
      });
      const result = {
        ok: true,
        action: input.action,
        staffId: input.staffId,
        appointment: updated ? mapAppointment(updated) : null,
        verifiedStaffSessionId: session?.id ?? null,
        verifiedStaffSessionExpiresAt: session?.expiresAt ?? null,
      };
      if (input.idempotencyKey)
        await tx.commandReceipt.create({
          data: {
            scope,
            key: input.idempotencyKey,
            requestHash: normalizedRequestHash,
            response: { ok: true, appointmentId: appointment.id, action: input.action },
          },
        });
      return result;
    }
    const currentService = input.appointmentServiceId
      ? appointment.services.find((service) => service.id === input.appointmentServiceId)
      : (appointment.services.find((service) => service.status === AppointmentStatus.IN_SERVICE) ??
        appointment.services.find((service) => service.status === AppointmentStatus.ASSIGNED) ??
        appointment.services.find(
          (service) =>
            service.status === AppointmentStatus.WAITING ||
            service.status === AppointmentStatus.CREATED,
        ));
    if (!currentService) throw new Error('Appointment service not found');
    const activeTurn = [...(currentService?.turns ?? [])]
      .reverse()
      .find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
    if (!activeTurn) throw new Error('No active turn');
    if (
      ['ACCEPT', 'SKIP', 'FINISH'].includes(input.action) &&
      activeTurn.assignedStaffId !== input.staffId
    )
      throw new Error('This turn is assigned to another staff member');
    const acceptingTurnStatuses: TurnStatus[] = [TurnStatus.ASSIGNED];
    const skippableTurnStatuses: TurnStatus[] = [TurnStatus.ASSIGNED, TurnStatus.ACCEPTED];
    if (input.action === 'ACCEPT' && !acceptingTurnStatuses.includes(activeTurn.status))
      throw new Error('This turn has already been accepted');
    if (input.action === 'FINISH' && activeTurn.status !== TurnStatus.ACCEPTED)
      throw new Error('Accept the turn before completing service');
    if (input.action === 'SKIP' && !skippableTurnStatuses.includes(activeTurn.status))
      throw new Error('This turn cannot be skipped');
    if (input.action === 'ADD_SUPPORT') {
      if (appointment.status !== AppointmentStatus.IN_SERVICE)
        throw new Error('Supporting staff can only be added during service');
      const staffRows = await staffForBusinessDate(tx, businessDate);
      const supportingStaff = staffRows
        .map(mapStaff)
        .find((candidate) => candidate.id === input.staffId);
      if (!supportingStaff?.isPresent || supportingStaff.availability !== Availability.AVAILABLE)
        throw new Error('Supporting staff must be present and available');
      await tx.appointmentSupportingStaff.upsert({
        where: { appointmentId_staffId: { appointmentId: appointment.id, staffId: input.staffId } },
        update: { addedAt: new Date(), releasedAt: null },
        create: { appointmentId: appointment.id, staffId: input.staffId },
      });
      await tx.staffServiceState.update({
        where: { staffId: input.staffId },
        data: { availability: Availability.BUSY, lastAssignedAt: new Date() },
      });
      await recordTurnEvent(tx, {
        appointmentId: appointment.id,
        appointmentServiceId: currentService.id,
        turnId: activeTurn.id,
        eventType: TurnEventType.SUPPORT_ADDED,
        assignedStaffId: input.staffId,
        assignedStaffName: supportingStaff.name,
        actorType: ActorType.STAFF,
        actorId: input.staffId,
        actorName: supportingStaff.name,
        reason: input.reason || 'Support added to the current service',
      });
    }
    if (input.action === 'ACCEPT') {
      await tx.turn.update({
        where: { id: activeTurn.id },
        data: { status: transitionTurn(activeTurn.status, TurnStatus.ACCEPTED) },
      });
      await tx.appointmentService.update({
        where: { id: currentService.id },
        data: { status: AppointmentStatus.IN_SERVICE },
      });
      await recordTurnEvent(tx, {
        appointmentId: appointment.id,
        appointmentServiceId: currentService.id,
        turnId: activeTurn.id,
        eventType: TurnEventType.ACCEPTED,
        assignedStaffId: input.staffId,
        assignedStaffName: currentService.primaryStaff?.name ?? staff.name,
        actorType: ActorType.STAFF,
        actorId: input.staffId,
        actorName: staff.name,
      });
      await syncAppointmentAggregate(tx, appointment.id);
    }
    if (input.action === 'FINISH') {
      const finishedAt = new Date();
      await tx.turn.update({
        where: { id: activeTurn.id },
        data: {
          status: transitionTurn(activeTurn.status, TurnStatus.FINISHED),
          endedAt: finishedAt,
        },
      });
      await tx.appointmentService.update({
        where: { id: currentService.id },
        data: { status: AppointmentStatus.COMPLETED, completedAt: finishedAt },
      });
      await recordTurnEvent(tx, {
        appointmentId: appointment.id,
        appointmentServiceId: currentService.id,
        turnId: activeTurn.id,
        eventType: TurnEventType.FINISHED,
        assignedStaffId: input.staffId,
        assignedStaffName: currentService.primaryStaff?.name ?? staff.name,
        actorType: ActorType.STAFF,
        actorId: input.staffId,
        actorName: staff.name,
      });
      const participatingStaffIds = [
        ...new Set([input.staffId, ...appointment.supportingStaff.map((member) => member.staffId)]),
      ];
      await tx.staffServiceState.updateMany({
        where: { staffId: { in: participatingStaffIds } },
        data: { lastServiceFinishedAt: finishedAt },
      });
      await tx.appointmentSupportingStaff.updateMany({
        where: { appointmentId: appointment.id, releasedAt: null },
        data: { releasedAt: finishedAt },
      });
      for (const support of appointment.supportingStaff.filter((member) => !member.releasedAt))
        await recordTurnEvent(tx, {
          appointmentId: appointment.id,
          appointmentServiceId: currentService.id,
          turnId: activeTurn.id,
          eventType: TurnEventType.SUPPORT_RELEASED,
          assignedStaffId: support.staffId,
          actorType: ActorType.STAFF,
          actorId: input.staffId,
          actorName: staff.name,
          reason: 'Support released after the service finished',
        });
      await releaseCompletedAppointmentStaff(tx, businessDate, participatingStaffIds);
      await routeAppointmentServices(tx, appointment.id, businessDate);
    }
    if (input.action === 'SKIP') {
      const skipReason = input.skipReasonId
        ? await tx.skipReason.findFirst({
            where: { id: input.skipReasonId, isActive: true },
            select: { id: true, name: true },
          })
        : null;
      if (!skipReason) throw new Error('Choose an active skip reason');
      const skipNote = input.reason?.trim() || skipReason.name;
      await tx.turn.update({
        where: { id: activeTurn.id },
        data: {
          status: transitionTurn(activeTurn.status, TurnStatus.SKIPPED),
          reason: skipNote,
          skipReasonId: skipReason.id,
          skipReasonNameSnapshot: skipReason.name,
          endedAt: new Date(),
        },
      });
      await tx.appointmentService.update({
        where: { id: currentService.id },
        data: { status: AppointmentStatus.WAITING, primaryStaffId: null },
      });
      await recordTurnEvent(tx, {
        appointmentId: appointment.id,
        appointmentServiceId: currentService.id,
        turnId: activeTurn.id,
        eventType: TurnEventType.SKIPPED,
        assignedStaffId: activeTurn.assignedStaffId,
        assignedStaffName: currentService.primaryStaff?.name ?? staff.name,
        actorType: ActorType.STAFF,
        actorId: input.staffId,
        actorName: staff.name,
        reason: skipNote,
      });
      await tx.turnExclusion.upsert({
        where: {
          appointmentServiceId_staffId: {
            appointmentServiceId: currentService.id,
            staffId: input.staffId,
          },
        },
        update: {
          reason: skipReason.name,
          overriddenAt: null,
          overrideReason: null,
          overriddenById: null,
        },
        create: {
          appointmentServiceId: currentService.id,
          staffId: input.staffId,
          reason: skipReason.name,
        },
      });
      await releaseCompletedAppointmentStaff(tx, businessDate, [input.staffId]);
      await routeAppointmentServices(
        tx,
        appointment.id,
        businessDate,
        currentService.id,
        input.staffId,
      );
    }
    await tx.auditEvent.create({
      data: {
        actorType: 'STAFF',
        actorId: input.staffId,
        action: 'turn.' + input.action.toLowerCase(),
        entity: 'Appointment',
        entityId: appointment.id,
        metadata: { reason: input.reason ?? null, skipReasonId: input.skipReasonId ?? null },
      },
    });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({
      where: { id: appointment.id },
      include: appointmentInclude,
    });
    const result = {
      ok: true,
      appointment: updated ? mapAppointment(updated) : null,
      verifiedStaffSessionId: session?.id ?? null,
      verifiedStaffSessionExpiresAt: session?.expiresAt ?? null,
    };
    if (input.idempotencyKey)
      await tx.commandReceipt.create({
        data: {
          scope,
          key: input.idempotencyKey,
          requestHash: normalizedRequestHash,
          response: { ok: true, appointmentId: appointment.id, action: input.action },
        },
      });
    return result;
  });
}
