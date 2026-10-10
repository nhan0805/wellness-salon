import { createHash } from 'node:crypto';
import { AppointmentStatus, Availability, AttendanceClosedBy, AttendanceStatus, Prisma, TurnStatus } from '@prisma/client';
import { routeNextTurn } from '@/src/domain/turn-routing';
import { transitionAppointment, transitionAttendance, transitionTurn } from '@/src/domain/state-machines';
import type { AppointmentServiceSnapshot, AppointmentSnapshot, DailyReport, MonthlyReport, PaymentMethod, ReportTrendPoint, ServiceCandidate, StaffCandidate } from '@/src/domain/types';
import { normalizeServiceIconKey } from '@/src/domain/service-icons';
import { normalizePhoneNumber } from '@/src/domain/phone';
import { prisma } from '@/src/server/db';
import { lockShopBusinessDate } from '@/src/server/services/turn-engine';
import { hashSecret, recordDbPinAttempt, assertDbPinNotLocked, verifySecret } from '@/src/server/security';

const SHOP_TIMEZONE = process.env.SHOP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function currentBusinessDate(now = new Date(), timeZone = SHOP_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

export async function currentDbBusinessDate(now = new Date()) {
  const config = await prisma.shopConfig.findUnique({ where: { id: 1 }, select: { timezone: true } });
  return currentBusinessDate(now, config?.timezone ?? SHOP_TIMEZONE);
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

function minutesInTimezone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function configuredTimeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
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

export function getAppointmentClosingBlocker(input: { appointmentId: string; code: string; customerName: string; status: AppointmentStatus; amount: number; hasPayment: boolean; unfinishedServiceCount: number }): ClosingBlocker | null {
  if (input.status === AppointmentStatus.CANCELLED) return null;
  if (input.status === AppointmentStatus.COMPLETED && input.hasPayment && input.unfinishedServiceCount === 0) return null;

  const requiresPayment = input.status === AppointmentStatus.PAYMENT_PENDING
    || (input.status === AppointmentStatus.COMPLETED && !input.hasPayment);
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

  constructor(readonly businessDate: string, readonly blockers: ClosingBlocker[]) {
    const preview = blockers.slice(0, 5).map((blocker) => `${blocker.code} (${blocker.status.replace('_', ' ')})`).join(', ');
    const suffix = blockers.length > 5 ? `, and ${blockers.length - 5} more` : '';
    super(`Cannot close shift. ${blockers.length} appointment${blockers.length === 1 ? '' : 's'} still require resolution: ${preview}${suffix}. Confirm payment for served visits or cancel unserved visits first.`);
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
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
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
  id: string; name: string; initials: string; isActive: boolean;
  skills: Array<{ skill: { name: string } }>;
  attendance: Array<{ status: AttendanceStatus }>;
  serviceState: { availability: Availability; lastServiceFinishedAt: Date | null; lastAssignedAt: Date | null } | null;
  appointments: Array<{ id: string }>;
  serviceAppointments: Array<{ id: string }>;
  supportingAppointments: Array<{ appointmentId: string }>;
}): StaffCandidate {
  const isPresent = row.attendance[0]?.status === AttendanceStatus.PRESENT;
  const hasActiveAssignment = row.appointments.length > 0 || row.serviceAppointments.length > 0 || row.supportingAppointments.length > 0;
  return { id: row.id, name: row.name, initials: row.initials, skills: row.skills.map((item) => item.skill.name), isActive: row.isActive, isPresent, availability: isPresent && hasActiveAssignment ? Availability.BUSY : Availability.AVAILABLE, lastServiceFinishedAt: row.serviceState?.lastServiceFinishedAt ?? null, lastAssignedAt: row.serviceState?.lastAssignedAt ?? null };
}

function mapAppointment(row: {
  id: string; code: string; customer: { name: string; phone: string }; service: { id: string; name: string; durationMin: number };
  serviceNameSnapshot: string; durationMinSnapshot: number;
  amount: Prisma.Decimal; status: AppointmentStatus; primaryStaffId: string | null; createdAt: Date; completedAt: Date | null;
  primaryStaff: { id: string; name: string; initials: string } | null;
  turns: Array<{ id: string; appointmentId: string; appointmentServiceId: string | null; assignedStaffId: string | null; status: TurnStatus; reason: string | null; skipReasonId: string | null; skipReasonNameSnapshot: string | null; createdAt: Date; endedAt: Date | null }>;
  supportingStaff: Array<{ staffId: string }>;
  payment: { method: PaymentMethod; confirmedAt: Date | null } | null;
  services: Array<{
    id: string; serviceId: string; sequence: number; serviceNameSnapshot: string; durationMinSnapshot: number;
    amount: Prisma.Decimal; status: AppointmentStatus; primaryStaffId: string | null; completedAt: Date | null;
    primaryStaff: { id: string; name: string; initials: string } | null;
    turns: Array<{ id: string; appointmentId: string; appointmentServiceId: string | null; assignedStaffId: string | null; status: TurnStatus; reason: string | null; skipReasonId: string | null; skipReasonNameSnapshot: string | null; createdAt: Date; endedAt: Date | null }>;
    turnExclusions: Array<{ staffId: string; reason: string; createdAt: Date; staff: { id: string; name: string } }>;
  }>;
}): AppointmentSnapshot {
  const serviceSnapshots: AppointmentServiceSnapshot[] = row.services.map((service) => ({
    id: service.id, serviceId: service.serviceId, sequence: service.sequence, serviceName: service.serviceNameSnapshot,
    durationMin: service.durationMinSnapshot, amount: Number(service.amount), status: service.status,
    primaryStaffId: service.primaryStaffId,
    primaryStaff: service.primaryStaff ? { id: service.primaryStaff.id, name: service.primaryStaff.name, initials: service.primaryStaff.initials } : null,
    completedAt: service.completedAt, turns: service.turns,
    turnExclusions: service.turnExclusions.map((exclusion) => ({ staffId: exclusion.staffId, staffName: exclusion.staff.name, reason: exclusion.reason, createdAt: exclusion.createdAt })),
  }));
  const currentService = serviceSnapshots.find((service) => service.status === AppointmentStatus.IN_SERVICE)
    ?? serviceSnapshots.find((service) => service.status === AppointmentStatus.ASSIGNED)
    ?? serviceSnapshots.find((service) => service.status === AppointmentStatus.WAITING || service.status === AppointmentStatus.CREATED)
    ?? serviceSnapshots[serviceSnapshots.length - 1];
  return { id: row.id, code: row.code, customerName: row.customer.name, phone: row.customer.phone, serviceId: currentService?.serviceId ?? row.service.id, serviceName: currentService?.serviceName ?? row.serviceNameSnapshot, durationMin: currentService?.durationMin ?? row.durationMinSnapshot, amount: Number(row.amount), status: row.status, primaryStaffId: currentService?.primaryStaffId ?? row.primaryStaffId, primaryStaff: currentService?.primaryStaff ?? (row.primaryStaff ? { id: row.primaryStaff.id, name: row.primaryStaff.name, initials: row.primaryStaff.initials } : null), createdAt: row.createdAt, completedAt: row.completedAt, turns: row.turns, services: serviceSnapshots, supportingStaffIds: row.supportingStaff.map((item) => item.staffId), payment: row.payment?.confirmedAt ? { method: row.payment.method, confirmedAt: row.payment.confirmedAt } : null };
}

const appointmentInclude = {
  customer: true,
  service: true,
  primaryStaff: true,
  turns: { orderBy: { createdAt: 'asc' as const } },
  services: { orderBy: { sequence: 'asc' as const }, include: { service: { include: { requiredSkills: { include: { skill: true } } } }, primaryStaff: true, turns: { orderBy: { createdAt: 'asc' as const } }, turnExclusions: { where: { overriddenAt: null }, orderBy: { createdAt: 'asc' as const }, include: { staff: { select: { id: true, name: true } } } } } },
  supportingStaff: true,
  payment: true,
};

// The board polls frequently from every shared tablet. Keep its read payload
// limited to fields that mapAppointment and the board UI actually consume.
const boardAppointmentInclude = {
  customer: { select: { name: true, phone: true } },
  service: { select: { id: true, name: true, durationMin: true } },
  primaryStaff: { select: { id: true, name: true, initials: true } },
  turns: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, appointmentId: true, appointmentServiceId: true, assignedStaffId: true, status: true, reason: true, skipReasonId: true, skipReasonNameSnapshot: true, createdAt: true, endedAt: true },
  },
  services: {
    orderBy: { sequence: 'asc' as const },
    include: {
      primaryStaff: { select: { id: true, name: true, initials: true } },
      turns: {
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, appointmentId: true, appointmentServiceId: true, assignedStaffId: true, status: true, reason: true, skipReasonId: true, skipReasonNameSnapshot: true, createdAt: true, endedAt: true },
      },
      turnExclusions: { where: { overriddenAt: null }, orderBy: { createdAt: 'asc' as const }, include: { staff: { select: { id: true, name: true } } } },
    },
  },
  supportingStaff: { select: { staffId: true } },
  payment: { select: { method: true, confirmedAt: true } },
} as const;

// A staff member is busy only while actively handling a turn. Payment pending is
// deliberately excluded: the service is finished, so the staff member may take
// another turn while the front desk completes payment.
export const staffBusyAppointmentStatuses: AppointmentStatus[] = [AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE];
const checkoutBlockingAppointmentStatuses: AppointmentStatus[] = [AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, AppointmentStatus.PAYMENT_PENDING];
const manualCheckoutBlockingAppointmentStatuses: AppointmentStatus[] = [AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE, AppointmentStatus.PAYMENT_PENDING];

async function staffForBusinessDate(tx: typeof prisma | Prisma.TransactionClient, date: Date) {
  return tx.staff.findMany({
    where: { isActive: true },
    include: {
      skills: { include: { skill: true } },
      attendance: { where: { businessDate: date } },
      serviceState: true,
      appointments: { where: { businessDate: date, status: { in: staffBusyAppointmentStatuses } }, select: { id: true } },
      serviceAppointments: { where: { status: { in: staffBusyAppointmentStatuses }, appointment: { businessDate: date } }, select: { id: true } },
      supportingAppointments: { where: { releasedAt: null, appointment: { businessDate: date, status: { in: staffBusyAppointmentStatuses } } }, select: { appointmentId: true } },
    },
  });
}

function ticket(appointment: AppointmentSnapshot, staff: StaffCandidate[]) {
  const assigned = staff.find((member) => member.id === appointment.primaryStaffId);
  const services = appointment.services.map((service) => ({ id: service.id, sequence: service.sequence, name: service.serviceName, durationMin: service.durationMin, amount: service.amount, status: service.status }));
  const totalDuration = services.reduce((total, service) => total + service.durationMin, 0) || appointment.durationMin;
  return { code: appointment.code, appointmentId: appointment.id, status: appointment.status, serviceName: appointment.serviceName, durationMin: totalDuration, amount: appointment.amount, assignedStaffName: assigned?.name ?? appointment.primaryStaff?.name ?? null, services, message: assigned || appointment.primaryStaff ? `Assigned to ${assigned?.name ?? appointment.primaryStaff?.name}` : 'Waiting for the next available specialist' };
}

function requestHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

async function bumpBoardVersion(tx: Prisma.TransactionClient) {
  await tx.shopConfig.upsert({
    where: { id: 1 },
    update: { stateVersion: { increment: 1 } },
    create: { id: 1, stateVersion: 1 },
  });
}

export async function getDbServices(): Promise<ServiceCandidate[]> {
  const rows = await prisma.service.findMany({ where: { isActive: true }, include: { requiredSkills: { select: { skillId: true } } }, orderBy: { name: 'asc' } });
  return rows.map((row) => ({ id: row.id, name: row.name, iconKey: normalizeServiceIconKey(row.iconKey), durationMin: row.durationMin, price: Number(row.price), requiredSkillIds: row.requiredSkills.map((item) => item.skillId), isActive: row.isActive }));
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

export async function getDbShopConfig(): Promise<ShopOperationalConfig> {
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
  const customer = await prisma.customer.findUnique({ where: { phoneNormalized: normalizePhoneNumber(phone) }, select: { name: true } });
  return { found: Boolean(customer), name: customer?.name ?? null };
}

export async function getDbBoardState({ publicView = false }: { publicView?: boolean } = {}) {
  const config = await getDbShopConfig();
  const businessDate = currentBusinessDate(new Date(), config.timezone);
  const [rows, staffRows, skipReasons] = await Promise.all([
    prisma.appointment.findMany({ where: { businessDate, status: { in: [AppointmentStatus.ASSIGNED, AppointmentStatus.WAITING, AppointmentStatus.IN_SERVICE, AppointmentStatus.PAYMENT_PENDING] } }, include: boardAppointmentInclude, orderBy: { createdAt: 'asc' } }),
    staffForBusinessDate(prisma, businessDate),
    prisma.skipReason.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
  ]);
  const staff = staffRows.map(mapStaff);
  const appointments = rows.map(mapAppointment).map((appointment) => {
    if (!publicView) return appointment;
    const redactTurns = <T extends { reason: string | null; skipReasonId?: string | null; skipReasonNameSnapshot?: string | null }>(turns: T[]) => turns.map((turn) => ({ ...turn, reason: null, skipReasonId: null, skipReasonNameSnapshot: null }));
    return {
      ...appointment,
      customerName: `Guest ${appointment.code}`,
      phone: '',
      turns: redactTurns(appointment.turns),
      services: appointment.services.map((service) => ({ ...service, turns: redactTurns(service.turns), turnExclusions: [] })),
    };
  });
  const currentTurns = appointments.filter((appointment) => appointment.status === AppointmentStatus.IN_SERVICE || appointment.status === AppointmentStatus.PAYMENT_PENDING);
  const current = currentTurns[0] ?? null;
  const upNext = appointments.filter((appointment) =>
    appointment.status === AppointmentStatus.ASSIGNED
    || appointment.status === AppointmentStatus.WAITING
    || appointment.services.some((service) => service.status === AppointmentStatus.ASSIGNED || service.status === AppointmentStatus.WAITING || service.status === AppointmentStatus.CREATED),
  ).slice(0, 4);
  const now = new Date();
  return {
    current,
    currentTurns,
    upNext,
    staff,
    skipReasons: publicView ? [] : skipReasons,
    shop: { timezone: config.timezone, openingTime: config.openingTime, closingTime: config.closingTime, currency: config.currency },
    version: config.stateVersion,
    at: now.toISOString(),
  };
}

function serviceSkillNames(service: { requiredSkills: Array<{ skill: { name: string } }> }) {
  return service.requiredSkills.map((item) => item.skill.name);
}

async function nextAppointmentCode(tx: typeof prisma | Prisma.TransactionClient, businessDate: Date) {
  const appointments = await tx.appointment.findMany({ where: { businessDate }, select: { code: true } });
  const highestSequence = appointments.reduce((highest, appointment) => {
    const match = /^A(\d+)$/.exec(appointment.code);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `A${String(highestSequence + 1).padStart(3, '0')}`;
}

export async function getDbAppointments(businessDate?: Date) {
  const date = businessDate ?? await currentDbBusinessDate();
  const rows = await prisma.appointment.findMany({ where: { businessDate: date }, include: appointmentInclude, orderBy: { createdAt: 'desc' } });
  return rows.map(mapAppointment);
}

export async function getDbAppointmentsInRange(start: Date, end: Date) {
  const rows = await prisma.appointment.findMany({ where: { businessDate: { gte: start, lt: end } }, include: appointmentInclude, orderBy: { createdAt: 'desc' } });
  return rows.map(mapAppointment);
}

export type AdminAppointmentFilters = {
  start: Date;
  end: Date;
  search?: string;
  status?: string;
  payment?: 'PAID' | 'UNPAID';
  staffId?: string;
  serviceId?: string;
  serviceStatus?: string;
  serviceCount?: 'ALL' | 'SINGLE' | 'MULTI';
  sort?: 'NEWEST' | 'OLDEST' | 'AMOUNT_DESC' | 'DURATION_DESC';
};

export async function getDbAppointmentsFiltered(filters: AdminAppointmentFilters) {
  const validStatuses = Object.values(AppointmentStatus) as string[];
  const where: Prisma.AppointmentWhereInput = { businessDate: { gte: filters.start, lt: filters.end } };
  if (filters.status && filters.status !== 'ALL' && validStatuses.includes(filters.status)) where.status = filters.status as AppointmentStatus;
  if (filters.payment === 'PAID') where.payment = { isNot: null };
  if (filters.payment === 'UNPAID') where.payment = { is: null };
  if (filters.search?.trim()) {
    const search = filters.search.trim();
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customer: { phone: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const serviceWhere: Prisma.AppointmentServiceWhereInput = {};
  if (filters.serviceId) serviceWhere.serviceId = filters.serviceId;
  if (filters.serviceStatus && filters.serviceStatus !== 'ALL' && validStatuses.includes(filters.serviceStatus)) {
    serviceWhere.status = filters.serviceStatus as AppointmentStatus;
  }
  if (Object.keys(serviceWhere).length) where.services = { some: serviceWhere };
  if (filters.staffId && filters.staffId !== 'ALL') {
    const staffCondition = filters.staffId === 'UNASSIGNED'
      ? { primaryStaffId: null, services: { none: { primaryStaffId: { not: null } } } }
      : { OR: [{ primaryStaffId: filters.staffId }, { services: { some: { primaryStaffId: filters.staffId } } }, { supportingStaff: { some: { staffId: filters.staffId } } }] };
    Object.assign(where, staffCondition);
  }
  const rows = await prisma.appointment.findMany({
    where,
    include: appointmentInclude,
    orderBy: { createdAt: 'desc' },
  });
  const needle = filters.search?.trim().toLocaleLowerCase();
  const filtered = rows.map(mapAppointment).filter((appointment) => {
    const services = appointment.services.length ? appointment.services : [{ serviceId: appointment.serviceId, status: appointment.status, primaryStaffId: appointment.primaryStaffId }];
    const staffIds = new Set([
      appointment.primaryStaffId,
      ...appointment.services.map((service) => service.primaryStaffId),
      ...appointment.supportingStaffIds,
    ].filter((staffId): staffId is string => Boolean(staffId)));
    const matchesSearch = !needle || [appointment.code, appointment.customerName, appointment.phone].some((value) => value.toLocaleLowerCase().includes(needle));
    const matchesStatus = !filters.status || filters.status === 'ALL' || appointment.status === filters.status;
    const matchesPayment = !filters.payment || (filters.payment === 'PAID' ? Boolean(appointment.payment) : !appointment.payment);
    const matchesStaff = !filters.staffId || (filters.staffId === 'UNASSIGNED' ? staffIds.size === 0 : staffIds.has(filters.staffId));
    const matchesService = !filters.serviceId || services.some((service) => service.serviceId === filters.serviceId);
    const matchesServiceStatus = !filters.serviceStatus || filters.serviceStatus === 'ALL' || services.some((service) => service.status === filters.serviceStatus);
    const matchesServiceCount = !filters.serviceCount || filters.serviceCount === 'ALL' || (filters.serviceCount === 'MULTI' ? services.length > 1 : services.length === 1);
    return matchesSearch && matchesStatus && matchesPayment && matchesStaff && matchesService && matchesServiceStatus && matchesServiceCount;
  });
  const sort = filters.sort ?? 'NEWEST';
  return filtered.sort((left, right) => {
    if (sort === 'OLDEST') return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (sort === 'AMOUNT_DESC') return right.amount - left.amount || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (sort === 'DURATION_DESC') {
      const leftDuration = left.services.reduce((total, service) => total + service.durationMin, 0) || left.durationMin;
      const rightDuration = right.services.reduce((total, service) => total + service.durationMin, 0) || right.durationMin;
      return rightDuration - leftDuration || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

export async function createDbCheckIn(input: { serviceId?: string; serviceIds?: string[]; phone: string; name: string; idempotencyKey?: string }) {
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const idempotencyScope = `kiosk:${formatBusinessDate(businessDate)}`;
    const normalizedRequestHash = requestHash({ serviceId: input.serviceId ?? null, serviceIds: input.serviceIds ?? null, phone: normalizePhoneNumber(input.phone), name: input.name.trim() });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({ where: { scope_key: { scope: idempotencyScope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This check-in key was already used for different details');
        return prior.response as unknown as ReturnType<typeof ticket>;
      }
    }
    const requestedServiceIds = [...new Set(input.serviceIds?.length ? input.serviceIds : input.serviceId ? [input.serviceId] : [])];
    if (!requestedServiceIds.length) throw new Error('Choose at least one service');
    const services = await tx.service.findMany({ where: { id: { in: requestedServiceIds }, isActive: true }, include: { requiredSkills: { include: { skill: true } } } });
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const orderedServices = requestedServiceIds.map((serviceId) => serviceById.get(serviceId)).filter((service): service is NonNullable<typeof service> => Boolean(service));
    if (orderedServices.length !== requestedServiceIds.length) throw new Error('One or more selected services are unavailable');
    const phoneNormalized = normalizePhoneNumber(input.phone);
    const customer = await tx.customer.upsert({ where: { phoneNormalized }, update: { name: input.name, phone: input.phone, phoneNormalized }, create: { phone: input.phone, phoneNormalized, name: input.name } });
    const code = await nextAppointmentCode(tx, businessDate);
    const totalAmount = orderedServices.reduce((total, service) => total + Number(service.price), 0);
    const appointment = await tx.appointment.create({ data: { code, customerId: customer.id, serviceId: orderedServices[0].id, serviceNameSnapshot: orderedServices[0].name, durationMinSnapshot: orderedServices[0].durationMin, status: AppointmentStatus.CREATED, primaryStaffId: null, amount: totalAmount, businessDate } });
    for (const [index, service] of orderedServices.entries()) {
      await tx.appointmentService.create({ data: { appointmentId: appointment.id, serviceId: service.id, sequence: index + 1, serviceNameSnapshot: service.name, durationMinSnapshot: service.durationMin, amount: service.price, status: AppointmentStatus.CREATED, primaryStaffId: null } });
    }
    await routeAppointmentServices(tx, appointment.id, businessDate);
    await tx.auditEvent.create({ data: { actorType: 'SYSTEM', action: 'appointment.checked_in', entity: 'Appointment', entityId: appointment.id, metadata: { code: appointment.code, serviceIds: orderedServices.map((service) => service.id) } } });
    const saved = await tx.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: appointmentInclude });
    const staffRows = await staffForBusinessDate(tx, businessDate);
    const response = ticket(mapAppointment(saved), staffRows.map(mapStaff));
    if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope: idempotencyScope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response } });
    await bumpBoardVersion(tx);
    return response;
  });
}

export async function confirmDbPayment(input: { appointmentId: string; method: PaymentMethod; tip?: number; idempotencyKey?: string; adminId?: string }) {
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const appointment = await tx.appointment.findFirst({ where: { id: input.appointmentId, businessDate }, include: appointmentInclude });
    if (!appointment) throw new Error('Appointment not found');
    const idempotencyScope = `payment:${appointment.id}`;
    const normalizedRequestHash = requestHash({ appointmentId: input.appointmentId, method: input.method, tip: input.tip ?? 0 });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({ where: { scope_key: { scope: idempotencyScope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This payment key was already used for different payment details');
        const stored = prior.response as Prisma.JsonObject;
        const savedAppointment = await tx.appointment.findUnique({ where: { id: appointment.id }, include: appointmentInclude });
        return { ok: true, appointment: savedAppointment ? mapAppointment(savedAppointment) : null, message: typeof stored.message === 'string' ? stored.message : 'Payment already confirmed', idempotent: true };
      }
    }
    const appointmentStaffIds = [...new Set([
      appointment.primaryStaffId,
      ...appointment.services.map((service) => service.primaryStaffId),
      ...appointment.supportingStaff.map((staff) => staff.staffId),
    ].filter((staffId): staffId is string => Boolean(staffId)))];
    if (appointment.payment) {
      await releaseCompletedAppointmentStaff(tx, businessDate, appointmentStaffIds);
      const response = { ok: true, appointment: mapAppointment(appointment), message: 'Payment already confirmed' };
      if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope: idempotencyScope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, appointmentId: appointment.id, message: response.message } } });
      return response;
    }
    const payableServices = appointment.services.filter((service) => service.status === AppointmentStatus.COMPLETED);
    const hasUnfinishedServices = appointment.services.some((service) => !([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]).includes(service.status));
    if (appointment.status !== AppointmentStatus.PAYMENT_PENDING || !payableServices.length || hasUnfinishedServices) throw new Error('Appointment is not ready for payment');
    const admin = input.adminId ? await tx.authUser.findUnique({ where: { id: input.adminId } }) : await tx.authUser.findFirst({ where: { role: 'ADMIN', isActive: true } });
    if (!admin) throw new Error('Admin account not found');
    await tx.payment.create({ data: { appointmentId: appointment.id, amount: appointment.amount, tip: input.tip ?? 0, method: input.method, serviceNameSnapshot: payableServices.map((service) => service.serviceNameSnapshot).join(' + '), staffNameSnapshot: payableServices.map((service) => service.primaryStaff?.name).filter(Boolean).join(', ') || null, confirmedByAdminId: admin.id, confirmedAt: new Date(), items: { create: payableServices.map((service) => ({ appointmentServiceId: service.id, serviceNameSnapshot: service.serviceNameSnapshot, staffNameSnapshot: service.primaryStaff?.name ?? null, amount: service.amount })) } } });
    const updated = await tx.appointment.update({ where: { id: appointment.id }, data: { status: AppointmentStatus.COMPLETED, completedAt: new Date() }, include: appointmentInclude });
    await releaseCompletedAppointmentStaff(tx, businessDate, appointmentStaffIds);
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: admin.id, action: 'payment.confirmed', entity: 'Payment', entityId: updated.id, metadata: { method: input.method, amount: Number(updated.amount), tip: Number(input.tip ?? 0) } } });
    const response = { ok: true, appointment: mapAppointment(updated), message: `Payment confirmed via ${input.method}` };
    if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope: idempotencyScope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, appointmentId: updated.id, message: response.message } } });
    await bumpBoardVersion(tx);
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

export async function cancelDbAppointment(input: CancellationInput) {
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `cancel:${input.appointmentId}`;
    const normalizedRequestHash = requestHash({ appointmentId: input.appointmentId, appointmentServiceId: input.appointmentServiceId ?? null, scope: input.scope, reason: input.reason.trim(), confirmed: input.confirmed === true });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This cancellation key was already used for different details');
        const existing = await tx.appointment.findUnique({ where: { id: input.appointmentId }, include: appointmentInclude });
        return { ok: true, appointment: existing ? mapAppointment(existing) : null, idempotent: true };
      }
    }
    const appointment = await tx.appointment.findFirst({ where: { id: input.appointmentId, businessDate }, include: appointmentInclude });
    if (!appointment) throw new Error('Appointment not found');
    if (appointment.payment || appointment.status === AppointmentStatus.PAYMENT_PENDING || appointment.status === AppointmentStatus.COMPLETED) throw new Error('Paid or payment-pending appointments cannot be cancelled');
    if (input.scope === 'SERVICE' && !input.appointmentServiceId) throw new Error('Choose a service to cancel');
    if (input.scope === 'VISIT' && input.appointmentServiceId) throw new Error('Choose either a service or the whole visit');

    const targets = input.scope === 'VISIT'
      ? appointment.services
      : appointment.services.filter((service) => service.id === input.appointmentServiceId);
    if (!targets.length) throw new Error('Appointment service not found');
    if (targets.some((service) => service.status === AppointmentStatus.COMPLETED || service.status === AppointmentStatus.PAYMENT_PENDING || service.status === AppointmentStatus.CANCELLED)) throw new Error('Completed, paid, or already cancelled service cannot be cancelled');
    if (targets.some((service) => service.status === AppointmentStatus.IN_SERVICE) && input.confirmed !== true) throw new Error('In-service cancellation requires explicit confirmation');

    const participatingStaffIds = [...new Set([
      ...targets.map((service) => service.primaryStaffId),
      ...appointment.supportingStaff.map((member) => member.staffId),
    ].filter((staffId): staffId is string => Boolean(staffId)))];
    const cancelledAt = new Date();
    for (const service of targets) {
      const activeTurns = service.turns.filter((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
      for (const turn of activeTurns) {
        await tx.turn.update({ where: { id: turn.id }, data: { status: transitionTurn(turn.status, TurnStatus.SKIPPED), reason: input.reason.trim(), endedAt: cancelledAt } });
      }
      await tx.appointmentService.update({
        where: { id: service.id },
        data: { status: transitionAppointment(service.status, AppointmentStatus.CANCELLED), primaryStaffId: null, cancelledAt, cancelledReason: input.reason.trim(), cancelledByType: 'ADMIN', cancelledById: input.adminId },
      });
    }
    const totalAmount = appointment.services.filter((service) => !targets.some((target) => target.id === service.id) && service.status !== AppointmentStatus.CANCELLED).reduce((total, service) => total + Number(service.amount), 0);
    await tx.appointment.update({ where: { id: appointment.id }, data: { amount: totalAmount, ...(input.scope === 'VISIT' ? { cancelledAt, cancelledReason: input.reason.trim(), cancelledByType: 'ADMIN', cancelledById: input.adminId } : {}) } });
    const cancelsEntireVisit = input.scope === 'VISIT' || appointment.services.every((service) => targets.some((target) => target.id === service.id));
    if (cancelsEntireVisit) await tx.appointmentSupportingStaff.updateMany({ where: { appointmentId: appointment.id, releasedAt: null }, data: { releasedAt: cancelledAt } });
    await syncAppointmentAggregate(tx, appointment.id);
    await releaseCompletedAppointmentStaff(tx, businessDate, participatingStaffIds);
    await routeAppointmentServices(tx, appointment.id, businessDate);
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: input.scope === 'VISIT' ? 'appointment.cancelled' : 'appointment_service.cancelled', entity: input.scope === 'VISIT' ? 'Appointment' : 'AppointmentService', entityId: input.scope === 'VISIT' ? appointment.id : targets[0].id, metadata: { reason: input.reason.trim(), scope: input.scope, appointmentServiceIds: targets.map((service) => service.id) } } });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({ where: { id: appointment.id }, include: appointmentInclude });
    const response = { ok: true, appointment: updated ? mapAppointment(updated) : null, idempotent: false };
    if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, appointmentId: appointment.id, scope: input.scope } } });
    return response;
  });
}

export async function reassignDbAppointmentService(input: { appointmentServiceId: string; staffId: string; reason: string; idempotencyKey?: string; adminId: string }) {
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `reassign:${input.appointmentServiceId}`;
    const normalizedRequestHash = requestHash({ appointmentServiceId: input.appointmentServiceId, staffId: input.staffId, reason: input.reason.trim() });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This reassignment key was already used for different details');
        const service = await tx.appointmentService.findUnique({ where: { id: input.appointmentServiceId }, select: { appointmentId: true } });
        const existing = service ? await tx.appointment.findUnique({ where: { id: service.appointmentId }, include: appointmentInclude }) : null;
        return { ok: true, appointment: existing ? mapAppointment(existing) : null, idempotent: true };
      }
    }
    const service = await tx.appointmentService.findUnique({
      where: { id: input.appointmentServiceId },
      include: { appointment: { include: appointmentInclude }, service: { include: { requiredSkills: { include: { skill: true } } } }, primaryStaff: true, turns: { orderBy: { createdAt: 'asc' } }, turnExclusions: { where: { overriddenAt: null }, select: { staffId: true } } },
    });
    if (!service) throw new Error('Appointment service not found');
    if (!([AppointmentStatus.WAITING, AppointmentStatus.ASSIGNED] as AppointmentStatus[]).includes(service.status)) throw new Error('Only waiting or assigned services can be manually reassigned');
    if (service.turnExclusions.some((exclusion) => exclusion.staffId === input.staffId)) throw new Error('This technician was explicitly excluded from the service; override the exclusion first');
    const staffRows = await staffForBusinessDate(tx, businessDate);
    const candidate = staffRows.map(mapStaff).find((staff) => staff.id === input.staffId);
    if (!candidate || !candidate.isActive || !candidate.isPresent || candidate.availability !== Availability.AVAILABLE) throw new Error('Technician must be active, clocked in, and available');
    const requiredSkills = service.service.requiredSkills.map((item) => item.skill.name);
    if (!requiredSkills.every((skill) => candidate.skills.includes(skill))) throw new Error('Technician does not have the required skills');
    const activeTurn = [...service.turns].reverse().find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
    if (activeTurn) await tx.turn.update({ where: { id: activeTurn.id }, data: { status: transitionTurn(activeTurn.status, TurnStatus.SKIPPED), reason: `Manually reassigned: ${input.reason.trim()}`, endedAt: new Date() } });
    await tx.appointmentService.update({ where: { id: service.id }, data: { status: AppointmentStatus.ASSIGNED, primaryStaffId: input.staffId } });
    await tx.turn.create({ data: { appointmentId: service.appointmentId, appointmentServiceId: service.id, assignedStaffId: input.staffId, status: TurnStatus.ASSIGNED, reason: 'Manager reassignment' } });
    await tx.staffServiceState.upsert({ where: { staffId: input.staffId }, update: { availability: Availability.BUSY, lastAssignedAt: new Date() }, create: { staffId: input.staffId, availability: Availability.BUSY, lastAssignedAt: new Date() } });
    await syncAppointmentAggregate(tx, service.appointmentId);
    if (service.primaryStaffId && service.primaryStaffId !== input.staffId) await releaseCompletedAppointmentStaff(tx, businessDate, [service.primaryStaffId]);
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'appointment_service.reassigned', entity: 'AppointmentService', entityId: service.id, metadata: { staffId: input.staffId, reason: input.reason.trim() } } });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({ where: { id: service.appointmentId }, include: appointmentInclude });
    const response = { ok: true, appointment: updated ? mapAppointment(updated) : null, idempotent: false };
    if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, appointmentId: service.appointmentId } } });
    return response;
  });
}

export async function overrideDbTurnExclusion(input: { appointmentServiceId: string; staffId: string; reason: string; idempotencyKey?: string; adminId: string }) {
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `override-exclusion:${input.appointmentServiceId}:${input.staffId}`;
    const normalizedRequestHash = requestHash({ appointmentServiceId: input.appointmentServiceId, staffId: input.staffId, reason: input.reason.trim() });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This override key was already used for different details');
        return { ok: true, exclusionId: typeof (prior.response as Prisma.JsonObject).exclusionId === 'string' ? (prior.response as Prisma.JsonObject).exclusionId : null, overriddenAt: typeof (prior.response as Prisma.JsonObject).overriddenAt === 'string' ? new Date((prior.response as Prisma.JsonObject).overriddenAt as string) : null, idempotent: true };
      }
    }
    const exclusion = await tx.turnExclusion.findUnique({ where: { appointmentServiceId_staffId: { appointmentServiceId: input.appointmentServiceId, staffId: input.staffId } } });
    if (!exclusion) throw new Error('Turn exclusion not found');
    const overriddenAt = new Date();
    await tx.turnExclusion.update({ where: { id: exclusion.id }, data: { overriddenAt, overrideReason: input.reason.trim(), overriddenById: input.adminId } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'turn_exclusion.overridden', entity: 'TurnExclusion', entityId: exclusion.id, metadata: { appointmentServiceId: input.appointmentServiceId, staffId: input.staffId, reason: input.reason.trim(), overriddenAt: overriddenAt.toISOString() } } });
    await bumpBoardVersion(tx);
    if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, exclusionId: exclusion.id, overriddenAt: overriddenAt.toISOString() } } });
    return { ok: true, exclusionId: exclusion.id, overriddenAt, idempotent: false };
  });
}

export async function changeDbAppointmentService(input: { appointmentServiceId: string; serviceId: string; reason: string; idempotencyKey?: string; adminId: string }) {
  const businessDate = await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    const scope = `service-change:${input.appointmentServiceId}`;
    const normalizedRequestHash = requestHash({ appointmentServiceId: input.appointmentServiceId, serviceId: input.serviceId, reason: input.reason.trim() });
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This service-change key was already used for different details');
        const existingService = await tx.appointmentService.findUnique({ where: { id: input.appointmentServiceId }, select: { appointmentId: true } });
        const existing = existingService ? await tx.appointment.findUnique({ where: { id: existingService.appointmentId }, include: appointmentInclude }) : null;
        return { ok: true, appointment: existing ? mapAppointment(existing) : null, idempotent: true };
      }
    }
    const current = await tx.appointmentService.findUnique({ where: { id: input.appointmentServiceId }, include: { appointment: { include: appointmentInclude }, service: { include: { requiredSkills: { include: { skill: true } } } }, primaryStaff: true, turns: { orderBy: { createdAt: 'asc' } } } });
    if (!current) throw new Error('Appointment service not found');
    if (([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.PAYMENT_PENDING] as AppointmentStatus[]).includes(current.status) || current.appointment.payment || current.appointment.status === AppointmentStatus.PAYMENT_PENDING || current.appointment.status === AppointmentStatus.COMPLETED) throw new Error('Completed or payment-confirmed service history cannot be changed');
    const nextService = await tx.service.findFirst({ where: { id: input.serviceId, isActive: true }, include: { requiredSkills: { include: { skill: true } } } });
    if (!nextService) throw new Error('Replacement service is unavailable');
    if (nextService.id === current.serviceId) throw new Error('Choose a different service');
    const requiredSkills = nextService.requiredSkills.map((item) => item.skill.name);
    if (current.primaryStaffId) {
      const staff = await tx.staff.findUnique({ where: { id: current.primaryStaffId }, include: { skills: { include: { skill: true } }, attendance: { where: { businessDate } } } });
      const qualified = Boolean(staff?.isActive && staff.attendance[0]?.status === AttendanceStatus.PRESENT && requiredSkills.every((skill) => staff.skills.some((item) => item.skill.name === skill)));
      if (current.status === AppointmentStatus.IN_SERVICE && !qualified) throw new Error('Current technician is not qualified for the replacement service; reassign before changing it');
      if (current.status !== AppointmentStatus.IN_SERVICE && !qualified) {
        const activeTurn = [...current.turns].reverse().find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
        if (activeTurn) await tx.turn.update({ where: { id: activeTurn.id }, data: { status: transitionTurn(activeTurn.status, TurnStatus.SKIPPED), reason: 'Service changed; routing revalidated', endedAt: new Date() } });
        await tx.appointmentService.update({ where: { id: current.id }, data: { serviceId: nextService.id, serviceNameSnapshot: nextService.name, durationMinSnapshot: nextService.durationMin, amount: nextService.price, status: AppointmentStatus.WAITING, primaryStaffId: null } });
      } else {
        await tx.appointmentService.update({ where: { id: current.id }, data: { serviceId: nextService.id, serviceNameSnapshot: nextService.name, durationMinSnapshot: nextService.durationMin, amount: nextService.price } });
      }
    } else {
      await tx.appointmentService.update({ where: { id: current.id }, data: { serviceId: nextService.id, serviceNameSnapshot: nextService.name, durationMinSnapshot: nextService.durationMin, amount: nextService.price } });
    }
    await tx.serviceChangeEvent.create({ data: { appointmentId: current.appointmentId, appointmentServiceId: current.id, oldServiceId: current.serviceId, oldServiceName: current.serviceNameSnapshot, oldDurationMin: current.durationMinSnapshot, oldAmount: current.amount, newServiceId: nextService.id, newServiceName: nextService.name, newDurationMin: nextService.durationMin, newAmount: nextService.price, reason: input.reason.trim(), actorId: input.adminId } });
    const allServices = await tx.appointmentService.findMany({ where: { appointmentId: current.appointmentId }, select: { amount: true, status: true } });
    await tx.appointment.update({ where: { id: current.appointmentId }, data: { amount: allServices.filter((service) => service.status !== AppointmentStatus.CANCELLED).reduce((total, service) => total + Number(service.amount), 0) } });
    await syncAppointmentAggregate(tx, current.appointmentId);
    await routeAppointmentServices(tx, current.appointmentId, businessDate);
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'appointment_service.changed', entity: 'AppointmentService', entityId: current.id, metadata: { oldServiceId: current.serviceId, newServiceId: nextService.id, reason: input.reason.trim() } } });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({ where: { id: current.appointmentId }, include: appointmentInclude });
    const response = { ok: true, appointment: updated ? mapAppointment(updated) : null, idempotent: false };
    if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, appointmentId: current.appointmentId } } });
    return response;
  });
}

async function releaseCompletedAppointmentStaff(tx: Prisma.TransactionClient, businessDate: Date, staffIds: string[]) {
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
      where: { staffId: { in: staffIds }, releasedAt: null, appointment: { businessDate, status: { in: checkoutBlockingAppointmentStatuses } } },
      select: { staffId: true },
    }),
  ]);
  const stillAssignedStaffIds = new Set<string>();
  for (const service of activeServiceAssignments) if (service.primaryStaffId) stillAssignedStaffIds.add(service.primaryStaffId);
  for (const supportingStaff of activeSupportingAssignments) stillAssignedStaffIds.add(supportingStaff.staffId);
  const releasableStaffIds = staffIds.filter((staffId) => !stillAssignedStaffIds.has(staffId));
  if (releasableStaffIds.length) await tx.staffServiceState.updateMany({ where: { staffId: { in: releasableStaffIds }, availability: Availability.BUSY }, data: { availability: Availability.AVAILABLE } });
}

async function syncAppointmentAggregate(tx: Prisma.TransactionClient, appointmentId: string) {
  const appointment = await tx.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    include: { services: { orderBy: { sequence: 'asc' } } },
  });
  const activeService = appointment.services.find((service) => service.status === AppointmentStatus.IN_SERVICE)
    ?? appointment.services.find((service) => service.status === AppointmentStatus.ASSIGNED)
    ?? appointment.services.find((service) => service.status === AppointmentStatus.WAITING || service.status === AppointmentStatus.CREATED)
    ?? appointment.services.find((service) => service.status === AppointmentStatus.COMPLETED);
  const status = appointment.services.some((service) => service.status === AppointmentStatus.IN_SERVICE)
    ? AppointmentStatus.IN_SERVICE
    : appointment.services.some((service) => service.status === AppointmentStatus.ASSIGNED)
      ? AppointmentStatus.ASSIGNED
      : appointment.services.some((service) => service.status === AppointmentStatus.CREATED || service.status === AppointmentStatus.WAITING)
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
      primaryStaffId: activeService?.primaryStaffId ?? null,
      completedAt: status === AppointmentStatus.PAYMENT_PENDING ? null : appointment.completedAt,
    },
  });
}

async function routeAppointmentServices(tx: Prisma.TransactionClient, appointmentId: string, businessDate: Date, excludedServiceId?: string, excludedStaffId?: string) {
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
  const routingConfig = await tx.shopConfig.findUnique({ where: { id: 1 }, select: { roundRobinEnabled: true } });
  const staffRows = await staffForBusinessDate(tx, businessDate);
  const candidates = staffRows.map(mapStaff);
  for (const appointmentService of appointment.services) {
    const excludedStaffIds = appointmentService.turnExclusions.map((exclusion) => exclusion.staffId);
    if (appointmentService.id === excludedServiceId && excludedStaffId) excludedStaffIds.push(excludedStaffId);
    const assignment = routeNextTurn(candidates, serviceSkillNames(appointmentService.service), [...new Set(excludedStaffIds)], routingConfig?.roundRobinEnabled ?? true);
    const status = assignment.staff ? AppointmentStatus.ASSIGNED : AppointmentStatus.WAITING;
    await tx.appointmentService.update({ where: { id: appointmentService.id }, data: { status, primaryStaffId: assignment.staff?.id ?? null } });
    const activeTurn = [...appointmentService.turns].reverse().find((turn) => turn.status === TurnStatus.ASSIGNED && !turn.assignedStaffId);
    if (activeTurn) {
      await tx.turn.update({ where: { id: activeTurn.id }, data: { assignedStaffId: assignment.staff?.id ?? null, reason: assignment.staff ? null : 'Waiting for eligible staff' } });
    } else {
      await tx.turn.create({ data: { appointmentId: appointment.id, appointmentServiceId: appointmentService.id, assignedStaffId: assignment.staff?.id ?? null, status: TurnStatus.ASSIGNED, reason: assignment.staff ? undefined : 'Waiting for eligible staff' } });
    }
    if (assignment.staff) {
      await tx.staffServiceState.upsert({ where: { staffId: assignment.staff.id }, update: { availability: Availability.BUSY, lastAssignedAt: new Date() }, create: { staffId: assignment.staff.id, availability: Availability.BUSY, lastAssignedAt: new Date() } });
      const candidate = candidates.find((item) => item.id === assignment.staff?.id);
      if (candidate) candidate.availability = Availability.BUSY;
    }
  }
  return syncAppointmentAggregate(tx, appointment.id);
}

export async function reconcileDbAssignments(businessDate?: Date, adminId?: string) {
  const date = businessDate ?? await currentDbBusinessDate();
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, date.toISOString());
    const appointments = await tx.appointment.findMany({
      where: {
        businessDate: date,
        status: { not: AppointmentStatus.COMPLETED },
        services: { some: { status: { in: [AppointmentStatus.CREATED, AppointmentStatus.WAITING] } } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    for (const appointment of appointments) await routeAppointmentServices(tx, appointment.id, date);
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: adminId, action: 'queue.assignments_reconciled', entity: 'Queue', metadata: { businessDate: formatBusinessDate(date), routedAppointments: appointments.length } } });
    if (appointments.length) await bumpBoardVersion(tx);
    return { routedAppointments: appointments.length };
  });
}

async function getDbReportForRange({ start, end, period, periodLabel }: { start: Date; end: Date; period: 'day' | 'month'; periodLabel: string }): Promise<DailyReport | MonthlyReport> {
  const [payments, appointments] = await Promise.all([
    prisma.payment.findMany({ where: { confirmedAt: { not: null }, appointment: { businessDate: { gte: start, lt: end } } }, include: { items: true, appointment: { select: { businessDate: true } } } }),
    prisma.appointment.findMany({ where: { businessDate: { gte: start, lt: end } }, select: { businessDate: true, status: true } }),
  ]);
  const byService = new Map<string, { revenue: number; count: number }>();
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
  for (const payment of payments) {
    const paymentDate = formatBusinessDate(payment.appointment.businessDate);
    const trendPoint = trend.get(paymentDate) ?? { date: paymentDate, revenue: 0, appointmentCount: 0, completedCount: 0 };
    trendPoint.revenue += Number(payment.amount);
    trend.set(paymentDate, trendPoint);
    const items = payment.items.length ? payment.items : [{ amount: payment.amount, serviceNameSnapshot: payment.serviceNameSnapshot, staffNameSnapshot: payment.staffNameSnapshot }];
    for (const item of items) {
      const amount = Number(item.amount);
      const serviceValue = byService.get(item.serviceNameSnapshot) ?? { revenue: 0, count: 0 };
      serviceValue.revenue += amount; serviceValue.count += 1; byService.set(item.serviceNameSnapshot, serviceValue);
      const staffName = item.staffNameSnapshot;
      if (staffName) { const staffValue = byStaff.get(staffName) ?? { revenue: 0, count: 0 }; staffValue.revenue += amount; staffValue.count += 1; byStaff.set(staffName, staffValue); }
    }
    if (payment.method === 'CARD') cardTotal += Number(payment.amount); else cashTotal += Number(payment.amount);
  }
  const dailyTrend = [...trend.values()].sort((left, right) => left.date.localeCompare(right.date)).map((point) => ({ ...point, revenue: Number(point.revenue.toFixed(2)) }));
  const common = { periodStart: formatBusinessDate(start), periodEnd: formatBusinessDate(new Date(end.getTime() - 24 * 60 * 60 * 1000)), periodLabel, appointmentCount: appointments.length, openCount: appointments.filter((appointment) => !([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]).includes(appointment.status)).length, pendingPaymentCount: appointments.filter((appointment) => appointment.status === AppointmentStatus.PAYMENT_PENDING).length, cancelledCount: appointments.filter((appointment) => appointment.status === AppointmentStatus.CANCELLED).length, revenue: Number((cardTotal + cashTotal).toFixed(2)), completedCount: payments.length, cardTotal, cashTotal, byService: [...byService].map(([serviceName, values]) => ({ serviceName, ...values })), byStaff: [...byStaff].map(([staffName, values]) => ({ staffName, ...values })), dailyTrend };
  if (period === 'month') return { period, businessMonth: formatBusinessMonth(start), ...common };
  return { period, businessDate: formatBusinessDate(start), ...common };
}

export async function getDbReport(date?: Date): Promise<DailyReport> {
  const start = date ?? await currentDbBusinessDate();
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return await getDbReportForRange({ start, end, period: 'day', periodLabel: formatBusinessDate(start) }) as DailyReport;
}

export async function getDbMonthlyReport(monthStart?: Date): Promise<MonthlyReport> {
  const current = monthStart ?? parseBusinessMonth(formatBusinessMonth(await currentDbBusinessDate()))!;
  const { start, end } = businessMonthRange(current);
  return await getDbReportForRange({ start, end, period: 'month', periodLabel: formatBusinessMonth(start) }) as MonthlyReport;
}

export async function autoCloseDbAttendance({ force = false }: { force?: boolean } = {}) {
  const businessDate = await currentDbBusinessDate();
  const shopConfig = await getDbShopConfig();
  const closingMinutes = configuredTimeToMinutes(shopConfig.closingTime);
  if (!force && closingMinutes !== null && minutesInTimezone(new Date(), shopConfig.timezone) < closingMinutes) {
    return { closedCount: 0, deferredCount: 0, businessDate: businessDate.toISOString().slice(0, 10), skipped: true, reason: 'Closing time has not been reached' };
  }
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
        customer: { select: { name: true } },
        payment: { select: { id: true, confirmedAt: true } },
        services: { select: { status: true } },
      },
    });
    const blockers = appointments.map((appointment) => getAppointmentClosingBlocker({
      appointmentId: appointment.id,
      code: appointment.code,
      customerName: appointment.customer.name,
      status: appointment.status,
      amount: Number(appointment.amount),
      hasPayment: Boolean(appointment.payment?.confirmedAt),
      unfinishedServiceCount: appointment.services.filter((service) => !([AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED] as AppointmentStatus[]).includes(service.status)).length,
    })).filter((blocker): blocker is ClosingBlocker => Boolean(blocker));
    if (blockers.length) throw new ShiftClosingBlockedError(businessDate.toISOString().slice(0, 10), blockers);

    const [activeServiceAssignments, activeSupportingAppointments] = await Promise.all([
      tx.appointmentService.findMany({
        where: { appointment: { businessDate }, status: { in: staffBusyAppointmentStatuses } },
        select: { primaryStaffId: true },
      }),
      tx.appointmentSupportingStaff.findMany({
        where: { releasedAt: null, appointment: { businessDate, status: { in: checkoutBlockingAppointmentStatuses } } },
        select: { staffId: true },
      }),
    ]);
    const checkoutBlockedStaffIds = new Set<string>();
    for (const service of activeServiceAssignments) if (service.primaryStaffId) checkoutBlockedStaffIds.add(service.primaryStaffId);
    for (const supportingStaff of activeSupportingAppointments) checkoutBlockedStaffIds.add(supportingStaff.staffId);
    const presentAttendance = await tx.attendance.findMany({ where: { businessDate, status: AttendanceStatus.PRESENT }, select: { id: true, staffId: true } });
    const deferredAttendance = presentAttendance.filter((attendance) => checkoutBlockedStaffIds.has(attendance.staffId));
    const openAttendance = presentAttendance.filter((attendance) => !checkoutBlockedStaffIds.has(attendance.staffId));
    const closedAt = new Date();
    for (const attendance of openAttendance) {
      await tx.attendance.update({ where: { id: attendance.id }, data: { status: transitionAttendance(AttendanceStatus.PRESENT, AttendanceStatus.CHECKED_OUT), checkOutAt: closedAt, closedBy: AttendanceClosedBy.AUTO } });
    }
    if (openAttendance.length || deferredAttendance.length) {
      if (openAttendance.length) await tx.staffServiceState.updateMany({ where: { staffId: { in: openAttendance.map((attendance) => attendance.staffId) }, availability: Availability.BUSY }, data: { availability: Availability.AVAILABLE } });
      await tx.auditEvent.create({ data: { actorType: 'SYSTEM', action: 'attendance.auto_closed', entity: 'Attendance', metadata: { businessDate: businessDate.toISOString().slice(0, 10), staffIds: openAttendance.map((attendance) => attendance.staffId), deferredStaffIds: deferredAttendance.map((attendance) => attendance.staffId), checkoutBlockedStaffIds: [...checkoutBlockedStaffIds], closedAt: closedAt.toISOString() } } });
      await bumpBoardVersion(tx);
    }
    return { closedCount: openAttendance.length, deferredCount: deferredAttendance.length, businessDate: businessDate.toISOString().slice(0, 10), skipped: false };
  });
}

export async function cleanupDbOperationalData(retentionDays = 90) {
  const safeRetentionDays = Math.min(3650, Math.max(30, Math.floor(retentionDays)));
  const cutoff = new Date(Date.now() - safeRetentionDays * 24 * 60 * 60 * 1000);
  const now = new Date();
  const [expiredSessions, oldReceipts, oldLockouts] = await prisma.$transaction([
    prisma.verifiedStaffSession.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    prisma.commandReceipt.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.staffPinLockout.deleteMany({ where: { updatedAt: { lt: cutoff }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] } }),
  ]);
  return {
    retentionDays: safeRetentionDays,
    cutoff: cutoff.toISOString(),
    expiredSessions: expiredSessions.count,
    oldReceipts: oldReceipts.count,
    oldLockouts: oldLockouts.count,
  };
}

type StaffActionInput = { action: 'ACCEPT' | 'SKIP' | 'FINISH' | 'CHECK_IN' | 'CHECK_OUT' | 'ADD_SUPPORT'; appointmentId?: string; appointmentServiceId?: string; staffId: string; pin?: string; reason?: string; skipReasonId?: string; idempotencyKey?: string };

export async function staffActionDb(input: StaffActionInput, stationUserId: string, verifiedSessionId?: string, trustedAdmin = false) {
  const pin = input.pin?.trim() || undefined;
  const normalizedRequestHash = requestHash({ action: input.action, appointmentId: input.appointmentId ?? null, appointmentServiceId: input.appointmentServiceId ?? null, staffId: input.staffId, reason: input.reason ?? null, skipReasonId: input.skipReasonId ?? null });
  const staff = await prisma.staff.findUnique({ where: { id: input.staffId }, include: { serviceState: true } });
  if (!staff || !staff.isActive) throw new Error('Staff verification failed');
  if (trustedAdmin) {
    // Admin attendance actions are already protected by the admin route guard.
  } else if (pin) {
    await assertDbPinNotLocked(input.staffId);
    if (!(await verifySecret(staff.pinHash, pin))) { await recordDbPinAttempt(input.staffId, false); throw new Error('Staff verification failed'); }
    await recordDbPinAttempt(input.staffId, true);
  } else {
    const verifiedSession = verifiedSessionId ? await prisma.verifiedStaffSession.findFirst({ where: { id: verifiedSessionId, staffId: input.staffId, stationUserId, expiresAt: { gt: new Date() }, revokedAt: null } }) : null;
    if (!verifiedSession) throw new Error('Staff verification required');
  }
  const businessDate = await currentDbBusinessDate();
  const scope = 'staff:' + stationUserId + ':' + input.staffId;
  return prisma.$transaction(async (tx) => {
    await lockShopBusinessDate(tx, businessDate.toISOString());
    if (input.idempotencyKey) {
      const prior = await tx.commandReceipt.findUnique({ where: { scope_key: { scope, key: input.idempotencyKey } } });
      if (prior) {
        if (prior.requestHash && prior.requestHash !== normalizedRequestHash) throw new Error('This action key was already used for different action details');
        const stored = prior.response as Prisma.JsonObject;
        const appointmentId = typeof stored.appointmentId === 'string' ? stored.appointmentId : null;
        const savedAppointment = appointmentId ? await tx.appointment.findUnique({ where: { id: appointmentId }, include: appointmentInclude }) : null;
        return { ok: true, action: input.action, staffId: input.staffId, appointment: savedAppointment ? mapAppointment(savedAppointment) : null, idempotent: true, verifiedStaffSessionId: null, verifiedStaffSessionExpiresAt: null };
      }
    }
    const config = await tx.shopConfig.findUnique({ where: { id: 1 } });
    const session = pin ? await tx.verifiedStaffSession.create({ data: { staffId: input.staffId, stationUserId, expiresAt: verifiedStaffSessionExpiry(new Date(), config?.verifiedSessionTtlMin ?? 3) } }) : null;
    if (input.action === 'CHECK_IN' || input.action === 'CHECK_OUT') {
      if (input.action === 'CHECK_OUT') {
        const blockingService = await tx.appointmentService.findFirst({
          where: { appointment: { businessDate }, status: { in: manualCheckoutBlockingAppointmentStatuses }, primaryStaffId: input.staffId },
          select: { appointment: { select: { code: true } } },
        });
        const blockingAppointment = blockingService ?? await tx.appointmentSupportingStaff.findFirst({
          where: {
            staffId: input.staffId,
            releasedAt: null,
            appointment: { businessDate, status: { in: manualCheckoutBlockingAppointmentStatuses } },
          },
          select: { appointment: { select: { code: true } } },
        });
        if (blockingAppointment) throw new Error('Staff cannot check out while assigned to an active turn');
      }
      const existing = await tx.attendance.findUnique({ where: { staffId_businessDate: { staffId: input.staffId, businessDate } } });
      const now = new Date();
      if (input.action === 'CHECK_IN') await tx.attendance.upsert({ where: { staffId_businessDate: { staffId: input.staffId, businessDate } }, update: { status: AttendanceStatus.PRESENT, checkInAt: existing?.checkInAt ?? now, checkOutAt: null, closedBy: null }, create: { staffId: input.staffId, businessDate, status: AttendanceStatus.PRESENT, checkInAt: now } });
      else if (existing) await tx.attendance.update({ where: { id: existing.id }, data: { status: AttendanceStatus.CHECKED_OUT, checkOutAt: now, closedBy: AttendanceClosedBy.STAFF } });
      if (input.action === 'CHECK_IN') await tx.staffServiceState.upsert({ where: { staffId: input.staffId }, update: { availability: Availability.AVAILABLE }, create: { staffId: input.staffId, availability: Availability.AVAILABLE } });
      if (input.action === 'CHECK_OUT') await tx.staffServiceState.updateMany({ where: { staffId: input.staffId }, data: { availability: Availability.AVAILABLE } });
      if (input.action === 'CHECK_IN') {
        const waitingAppointments = await tx.appointment.findMany({ where: { businessDate, status: { in: [AppointmentStatus.CREATED, AppointmentStatus.WAITING, AppointmentStatus.ASSIGNED] } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
        for (const waitingAppointment of waitingAppointments) {
          const before = await tx.appointment.findUnique({ where: { id: waitingAppointment.id }, select: { primaryStaffId: true, status: true } });
          const updated = await routeAppointmentServices(tx, waitingAppointment.id, businessDate);
          if (updated.primaryStaffId && (updated.primaryStaffId !== before?.primaryStaffId || before?.status === AppointmentStatus.WAITING)) {
            await tx.auditEvent.create({ data: { actorType: 'SYSTEM', action: 'appointment.reassigned_after_check_in', entity: 'Appointment', entityId: waitingAppointment.id, metadata: { staffId: updated.primaryStaffId } } });
          }
        }
      }
      await tx.auditEvent.create({ data: { actorType: trustedAdmin ? 'ADMIN' : 'STAFF', actorId: trustedAdmin ? stationUserId : input.staffId, action: 'attendance.' + input.action.toLowerCase(), entity: 'Attendance', entityId: input.staffId, metadata: { businessDate: businessDate.toISOString().slice(0, 10) } } });
      const result = { ok: true, staffId: input.staffId, action: input.action, verifiedStaffSessionId: session?.id ?? null, verifiedStaffSessionExpiresAt: session?.expiresAt ?? null };
      if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, staffId: input.staffId, action: input.action } } });
      await bumpBoardVersion(tx);
      return result;
    }
    if (!input.appointmentId) throw new Error('Appointment is required');
    const appointment = await tx.appointment.findUnique({ where: { id: input.appointmentId }, include: appointmentInclude });
    if (!appointment) throw new Error('Appointment not found');
    if (['ACCEPT', 'FINISH', 'ADD_SUPPORT'].includes(input.action)) {
      const transactionalStaff = await tx.staff.findUnique({ where: { id: input.staffId }, select: { isActive: true } });
      const attendance = await tx.attendance.findUnique({ where: { staffId_businessDate: { staffId: input.staffId, businessDate } }, select: { status: true } });
      if (!transactionalStaff?.isActive || attendance?.status !== AttendanceStatus.PRESENT) throw new Error('Staff must be active and clocked in for this action');
    }
    const currentService = input.appointmentServiceId
      ? appointment.services.find((service) => service.id === input.appointmentServiceId)
      : appointment.services.find((service) => service.status === AppointmentStatus.IN_SERVICE)
        ?? appointment.services.find((service) => service.status === AppointmentStatus.ASSIGNED)
        ?? appointment.services.find((service) => service.status === AppointmentStatus.WAITING || service.status === AppointmentStatus.CREATED);
    if (!currentService) throw new Error('Appointment service not found');
    const activeTurn = [...(currentService?.turns ?? [])].reverse().find((turn) => turn.status === TurnStatus.ASSIGNED || turn.status === TurnStatus.ACCEPTED);
    if (!activeTurn) throw new Error('No active turn');
    if (['ACCEPT', 'SKIP', 'FINISH'].includes(input.action) && activeTurn.assignedStaffId !== input.staffId) throw new Error('This turn is assigned to another staff member');
    const acceptingTurnStatuses: TurnStatus[] = [TurnStatus.ASSIGNED];
    const skippableTurnStatuses: TurnStatus[] = [TurnStatus.ASSIGNED, TurnStatus.ACCEPTED];
    if (input.action === 'ACCEPT' && !acceptingTurnStatuses.includes(activeTurn.status)) throw new Error('This turn has already been accepted');
    if (input.action === 'FINISH' && activeTurn.status !== TurnStatus.ACCEPTED) throw new Error('Accept the turn before completing service');
    if (input.action === 'SKIP' && !skippableTurnStatuses.includes(activeTurn.status)) throw new Error('This turn cannot be skipped');
    if (input.action === 'ADD_SUPPORT') {
      if (appointment.status !== AppointmentStatus.IN_SERVICE) throw new Error('Supporting staff can only be added during service');
      const staffRows = await staffForBusinessDate(tx, businessDate);
      const supportingStaff = staffRows.map(mapStaff).find((candidate) => candidate.id === input.staffId);
      if (!supportingStaff?.isPresent || supportingStaff.availability !== Availability.AVAILABLE) throw new Error('Supporting staff must be present and available');
      await tx.appointmentSupportingStaff.upsert({ where: { appointmentId_staffId: { appointmentId: appointment.id, staffId: input.staffId } }, update: { addedAt: new Date(), releasedAt: null }, create: { appointmentId: appointment.id, staffId: input.staffId } });
      await tx.staffServiceState.update({ where: { staffId: input.staffId }, data: { availability: Availability.BUSY, lastAssignedAt: new Date() } });
    }
    if (input.action === 'ACCEPT') {
      await tx.turn.update({ where: { id: activeTurn.id }, data: { status: transitionTurn(activeTurn.status, TurnStatus.ACCEPTED) } });
      await tx.appointmentService.update({ where: { id: currentService.id }, data: { status: AppointmentStatus.IN_SERVICE } });
      await syncAppointmentAggregate(tx, appointment.id);
    }
    if (input.action === 'FINISH') {
      const finishedAt = new Date();
      await tx.turn.update({ where: { id: activeTurn.id }, data: { status: transitionTurn(activeTurn.status, TurnStatus.FINISHED), endedAt: finishedAt } });
      await tx.appointmentService.update({ where: { id: currentService.id }, data: { status: AppointmentStatus.COMPLETED, completedAt: finishedAt } });
      const participatingStaffIds = [...new Set([input.staffId, ...appointment.supportingStaff.map((member) => member.staffId)])];
      await tx.staffServiceState.updateMany({ where: { staffId: { in: participatingStaffIds } }, data: { lastServiceFinishedAt: finishedAt } });
      await tx.appointmentSupportingStaff.updateMany({ where: { appointmentId: appointment.id, releasedAt: null }, data: { releasedAt: finishedAt } });
      await releaseCompletedAppointmentStaff(tx, businessDate, participatingStaffIds);
      await routeAppointmentServices(tx, appointment.id, businessDate);
    }
    if (input.action === 'SKIP') {
      const skipReason = input.skipReasonId
        ? await tx.skipReason.findFirst({ where: { id: input.skipReasonId, isActive: true }, select: { id: true, name: true } })
        : null;
      if (!skipReason) throw new Error('Choose an active skip reason');
      const skipNote = input.reason?.trim() || skipReason.name;
      await tx.turn.update({ where: { id: activeTurn.id }, data: { status: transitionTurn(activeTurn.status, TurnStatus.SKIPPED), reason: skipNote, skipReasonId: skipReason.id, skipReasonNameSnapshot: skipReason.name, endedAt: new Date() } });
      await tx.appointmentService.update({ where: { id: currentService.id }, data: { status: AppointmentStatus.WAITING, primaryStaffId: null } });
      await tx.turnExclusion.upsert({ where: { appointmentServiceId_staffId: { appointmentServiceId: currentService.id, staffId: input.staffId } }, update: { reason: skipReason.name, overriddenAt: null, overrideReason: null, overriddenById: null }, create: { appointmentServiceId: currentService.id, staffId: input.staffId, reason: skipReason.name } });
      await releaseCompletedAppointmentStaff(tx, businessDate, [input.staffId]);
      await routeAppointmentServices(tx, appointment.id, businessDate, currentService.id, input.staffId);
    }
    await tx.auditEvent.create({ data: { actorType: 'STAFF', actorId: input.staffId, action: 'turn.' + input.action.toLowerCase(), entity: 'Appointment', entityId: appointment.id, metadata: { reason: input.reason ?? null, skipReasonId: input.skipReasonId ?? null } } });
    await bumpBoardVersion(tx);
    const updated = await tx.appointment.findUnique({ where: { id: appointment.id }, include: appointmentInclude });
    const result = { ok: true, appointment: updated ? mapAppointment(updated) : null, verifiedStaffSessionId: session?.id ?? null, verifiedStaffSessionExpiresAt: session?.expiresAt ?? null };
    if (input.idempotencyKey) await tx.commandReceipt.create({ data: { scope, key: input.idempotencyKey, requestHash: normalizedRequestHash, response: { ok: true, appointmentId: appointment.id, action: input.action } } });
    return result;
  });
}
