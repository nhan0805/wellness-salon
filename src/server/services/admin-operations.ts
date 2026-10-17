import {
  AppointmentStatus,
  AttendanceClosedBy as PrismaAttendanceClosedBy,
  AttendanceStatus,
  Availability,
  AuthRole,
  Prisma,
} from '@prisma/d1-client';
import { randomId } from '@/src/server/web-crypto';
import type {
  AdminAccountSnapshot,
  AdminAttendanceSnapshot,
  AdminCustomerHistorySnapshot,
  AdminCustomerSnapshot,
  AdminServiceCategorySnapshot,
  AdminServiceSnapshot,
  AdminSkipReasonSnapshot,
  AdminSkillManagementSnapshot,
  AdminSkillSnapshot,
  AdminStaffSnapshot,
  ServiceCategorySnapshot,
} from '@/src/domain/types';
import { deriveStaffInitials } from '@/src/domain/staff';
import { moneyFromMinorUnits, toMinorUnits } from '@/src/domain/money';
import { normalizeServiceIconKey, type ServiceIconKey } from '@/src/domain/service-icons';
import { normalizePhoneNumber } from '@/src/domain/phone';
import {
  currentDbBusinessDate,
  formatBusinessDate,
  staffBusyAppointmentStatuses,
  type ShopOperationalConfig,
} from '@/src/server/services/prisma-operations';
import {
  getD1Database,
  isD1Runtime,
  prisma,
  withD1Lease,
  type D1DatabaseLike,
} from '@/src/server/db';
import { hashSecret } from '@/src/server/security';

function mapAttendance(row: {
  id: string;
  name: string;
  initials: string;
  isActive: boolean;
  attendance: Array<{
    status: AttendanceStatus;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    closedBy: PrismaAttendanceClosedBy | null;
  }>;
  serviceState: { availability: Availability } | null;
  appointments: Array<{ id: string }>;
  supportingAppointments: Array<{ appointmentId: string }>;
}): AdminAttendanceSnapshot {
  const attendance = row.attendance[0];
  const isPresent = attendance?.status === AttendanceStatus.PRESENT;
  const hasActiveAssignment = row.appointments.length > 0 || row.supportingAppointments.length > 0;
  return {
    staffId: row.id,
    staffName: row.name,
    initials: row.initials,
    isActive: row.isActive,
    status: attendance?.status ?? AttendanceStatus.ABSENT,
    availability: isPresent && hasActiveAssignment ? Availability.BUSY : Availability.AVAILABLE,
    checkInAt: attendance?.checkInAt ?? null,
    checkOutAt: attendance?.checkOutAt ?? null,
    closedBy: attendance?.closedBy ?? null,
  };
}

function mapSkill(row: { id: string; name: string }): AdminSkillSnapshot {
  return { id: row.id, name: row.name };
}

function mapStaff(row: {
  id: string;
  name: string;
  initials: string;
  isActive: boolean;
  skills: Array<{ skill: { id: string; name: string } }>;
  attendance: Array<{ status: AttendanceStatus; checkInAt: Date | null; checkOutAt: Date | null }>;
  serviceState: { availability: Availability } | null;
  appointments: Array<{ id: string }>;
  supportingAppointments: Array<{ appointmentId: string }>;
}): AdminStaffSnapshot {
  const attendance = row.attendance[0];
  const isPresent = attendance?.status === AttendanceStatus.PRESENT;
  const hasActiveAssignment = row.appointments.length > 0 || row.supportingAppointments.length > 0;
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    skills: row.skills.map((item) => mapSkill(item.skill)),
    isActive: row.isActive,
    status: attendance?.status ?? AttendanceStatus.ABSENT,
    availability: isPresent && hasActiveAssignment ? Availability.BUSY : Availability.AVAILABLE,
    checkInAt: attendance?.checkInAt ?? null,
    checkOutAt: attendance?.checkOutAt ?? null,
  };
}

function staffInclude(businessDate: Date) {
  return {
    skills: { include: { skill: true }, orderBy: { skill: { name: 'asc' as const } } },
    attendance: { where: { businessDate } },
    serviceState: true,
    appointments: {
      where: { businessDate, status: { in: staffBusyAppointmentStatuses } },
      select: { id: true },
    },
    supportingAppointments: {
      where: {
        releasedAt: null,
        appointment: { businessDate, status: { in: staffBusyAppointmentStatuses } },
      },
      select: { appointmentId: true },
    },
  };
}

function attendanceInclude(businessDate: Date) {
  return {
    attendance: { where: { businessDate } },
    serviceState: true,
    appointments: {
      where: { businessDate, status: { in: staffBusyAppointmentStatuses } },
      select: { id: true },
    },
    supportingAppointments: {
      where: {
        releasedAt: null,
        appointment: { businessDate, status: { in: staffBusyAppointmentStatuses } },
      },
      select: { appointmentId: true },
    },
  };
}

function adminStaffInclude(businessDate: Date) {
  return {
    ...staffInclude(businessDate),
  };
}

function d1Statement(database: D1DatabaseLike, query: string, ...values: unknown[]) {
  return database.prepare(query).bind(...values);
}

function d1DateTimeValue(date: Date) {
  return date.toISOString().replace('Z', '+00:00');
}

function d1AuditEvent(
  database: D1DatabaseLike,
  input: {
    id?: string;
    action: string;
    entity: string;
    entityId?: string;
    actorId?: string;
    metadata?: unknown;
  },
  nowIso: string,
) {
  return d1Statement(
    database,
    `INSERT INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id ?? randomId(),
    nowIso,
    'ADMIN',
    input.actorId ?? null,
    input.action,
    input.entity,
    input.entityId ?? null,
    input.metadata === undefined ? null : JSON.stringify(input.metadata),
  );
}

async function d1Batch(database: D1DatabaseLike, statements: ReturnType<typeof d1Statement>[]) {
  return database.batch(statements);
}

async function assertSkillIds(tx: Prisma.TransactionClient, skillIds: string[]) {
  const uniqueIds = [...new Set(skillIds)];
  const skills = await tx.skill.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true },
  });
  if (skills.length !== uniqueIds.length)
    throw new Error('One or more selected skills do not exist');
  return uniqueIds;
}

async function createDbAdminSkillD1(input: { name: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const id = randomId();
    const nowIso = d1DateTimeValue(new Date());
    await d1Batch(database, [
      d1Statement(
        database,
        'INSERT INTO skills (id, name, created_at) VALUES (?, ?, ?)',
        id,
        input.name,
        nowIso,
      ),
      d1AuditEvent(
        database,
        {
          action: 'skill.created',
          entity: 'Skill',
          entityId: id,
          actorId: input.adminId,
          metadata: { name: input.name },
        },
        nowIso,
      ),
    ]);
    return prisma.skill.findUniqueOrThrow({ where: { id } });
  });
}

async function updateDbAdminSkillD1(input: { id: string; name: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const current = await prisma.skill.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Skill not found');
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(database, 'UPDATE skills SET name = ? WHERE id = ?', input.name, input.id),
      d1AuditEvent(
        database,
        {
          action: 'skill.updated',
          entity: 'Skill',
          entityId: input.id,
          actorId: input.adminId,
          metadata: { name: input.name },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Skill was changed before the update could be recorded; retry the command');
    return prisma.skill.findUniqueOrThrow({ where: { id: input.id } });
  });
}

async function deleteDbAdminSkillD1(input: { id: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const skill = await prisma.skill.findUnique({
      where: { id: input.id },
      include: { _count: { select: { staff: true, serviceSkills: true } } },
    });
    if (!skill) throw new Error('Skill not found');
    if (skill._count.staff > 0 || skill._count.serviceSkills > 0)
      throw new Error(
        'This skill is still assigned to staff or services; rename it instead of deleting it',
      );
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(database, 'DELETE FROM skills WHERE id = ?', input.id),
      d1AuditEvent(
        database,
        {
          action: 'skill.deleted',
          entity: 'Skill',
          entityId: input.id,
          actorId: input.adminId,
          metadata: { name: skill.name },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Skill was changed before it could be deleted; retry the command');
    return { ok: true, id: input.id };
  });
}

async function createDbAdminSkipReasonD1(input: {
  name: string;
  sortOrder?: number;
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const id = randomId();
    const now = new Date();
    const nowIso = d1DateTimeValue(now);
    await d1Batch(database, [
      d1Statement(
        database,
        'INSERT INTO skip_reasons (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
        id,
        input.name.trim(),
        input.sortOrder ?? 0,
        nowIso,
        nowIso,
      ),
      d1AuditEvent(
        database,
        {
          action: 'skip_reason.created',
          entity: 'SkipReason',
          entityId: id,
          actorId: input.adminId,
          metadata: { name: input.name.trim(), sortOrder: input.sortOrder ?? 0 },
        },
        nowIso,
      ),
    ]);
    const reason = await prisma.skipReason.findUniqueOrThrow({ where: { id } });
    return mapSkipReason(reason);
  });
}

async function updateDbAdminSkipReasonD1(input: {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const current = await prisma.skipReason.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Skip reason not found');
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(
        database,
        'UPDATE skip_reasons SET name = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ?',
        input.name.trim(),
        input.sortOrder,
        input.isActive ? 1 : 0,
        nowIso,
        input.id,
      ),
      d1AuditEvent(
        database,
        {
          action: 'skip_reason.updated',
          entity: 'SkipReason',
          entityId: input.id,
          actorId: input.adminId,
          metadata: {
            name: input.name.trim(),
            sortOrder: input.sortOrder,
            isActive: input.isActive,
          },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error(
        'Skip reason was changed before the update could be recorded; retry the command',
      );
    return mapSkipReason(await prisma.skipReason.findUniqueOrThrow({ where: { id: input.id } }));
  });
}

async function deleteDbAdminSkipReasonD1(input: { id: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const reason = await prisma.skipReason.findUnique({
      where: { id: input.id },
      include: { _count: { select: { turns: true } } },
    });
    if (!reason) throw new Error('Skip reason not found');
    if (reason._count.turns > 0)
      throw new Error('Skip reasons used in history cannot be deleted; deactivate them instead');
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(database, 'DELETE FROM skip_reasons WHERE id = ?', input.id),
      d1AuditEvent(
        database,
        {
          action: 'skip_reason.deleted',
          entity: 'SkipReason',
          entityId: input.id,
          actorId: input.adminId,
          metadata: { name: reason.name },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Skip reason was changed before it could be deleted; retry the command');
    return { ok: true, id: input.id };
  });
}

async function updateDbShopConfigD1(input: ShopOperationalConfig & { adminId?: string }) {
  return withD1Lease(async (database) => {
    const nowIso = d1DateTimeValue(new Date());
    const configId = 1;
    const currentConfig = await prisma.shopConfig.findUnique({ where: { id: configId }, select: { currency: true } });
    if (currentConfig && currentConfig.currency !== input.currency) {
      const existingAppointment = await database
        .prepare('SELECT id FROM appointments LIMIT 1')
        .first<{ id: string }>();
      if (existingAppointment) {
        throw new Error('Currency cannot be changed after visits exist; create a new shop configuration instead.');
      }
    }
    await d1Batch(database, [
      d1Statement(
        database,
        `INSERT INTO shop_config (id, timezone, opening_time, closing_time, verified_session_ttl_min, currency, round_robin_enabled, state_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          timezone = excluded.timezone,
          opening_time = excluded.opening_time,
          closing_time = excluded.closing_time,
          verified_session_ttl_min = excluded.verified_session_ttl_min,
          currency = excluded.currency,
          round_robin_enabled = excluded.round_robin_enabled,
          state_version = shop_config.state_version + 1,
          updated_at = excluded.updated_at`,
        configId,
        input.timezone,
        input.openingTime,
        input.closingTime,
        input.verifiedSessionTtlMin,
        input.currency,
        input.roundRobinEnabled ? 1 : 0,
        nowIso,
        nowIso,
      ),
      d1AuditEvent(
        database,
        {
          action: 'shop_config.updated',
          entity: 'ShopConfig',
          entityId: String(configId),
          actorId: input.adminId,
          metadata: {
            timezone: input.timezone,
            openingTime: input.openingTime,
            closingTime: input.closingTime,
            currency: input.currency,
            verifiedSessionTtlMin: input.verifiedSessionTtlMin,
            roundRobinEnabled: input.roundRobinEnabled,
          },
        },
        nowIso,
      ),
    ]);
    const config = await prisma.shopConfig.findUniqueOrThrow({ where: { id: configId } });
    return {
      timezone: config.timezone,
      openingTime: config.openingTime,
      closingTime: config.closingTime,
      currency: config.currency,
      verifiedSessionTtlMin: config.verifiedSessionTtlMin,
      roundRobinEnabled: config.roundRobinEnabled,
      stateVersion: config.stateVersion,
    };
  });
}

async function createDbAdminAccountD1(input: {
  email: string;
  displayName?: string;
  password: string;
  role: 'ADMIN' | 'STATION';
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const id = randomId();
    const email = input.email.toLowerCase();
    const displayName =
      input.displayName?.trim() || (input.role === 'ADMIN' ? 'Administrator' : 'Station account');
    const passwordHash = await hashSecret(input.password);
    const nowIso = d1DateTimeValue(new Date());
    await d1Batch(database, [
      d1Statement(
        database,
        `INSERT INTO auth_users (id, email, display_name, password_hash, role, is_active, session_version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
        id,
        email,
        displayName,
        passwordHash,
        input.role,
        nowIso,
        nowIso,
      ),
      d1AuditEvent(
        database,
        {
          action: 'account.created',
          entity: 'AuthUser',
          entityId: id,
          actorId: input.adminId,
          metadata: { email, displayName, role: input.role },
        },
        nowIso,
      ),
    ]);
    const account = await prisma.authUser.findUniqueOrThrow({ where: { id } });
    return mapAccount(account, input.adminId ?? '');
  });
}

async function updateDbAdminAccountD1(input: {
  id: string;
  email: string;
  displayName?: string;
  password?: string;
  role: 'ADMIN' | 'STATION';
  isActive: boolean;
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const current = await prisma.authUser.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Account not found');
    if (input.id === input.adminId && (!input.isActive || input.role !== 'ADMIN'))
      throw new Error('You cannot deactivate or change the role of the account you are using');
    if (
      current.role === 'ADMIN' &&
      current.isActive &&
      (input.role !== 'ADMIN' || !input.isActive)
    ) {
      const activeAdminCount = await prisma.authUser.count({
        where: { role: 'ADMIN', isActive: true },
      });
      if (activeAdminCount <= 1) throw new Error('Keep at least one active admin account');
    }
    const displayName =
      input.displayName?.trim() ||
      current.displayName?.trim() ||
      (input.role === 'ADMIN' ? 'Administrator' : 'Station account');
    const email = input.email.toLowerCase();
    const now = new Date();
    const nowIso = d1DateTimeValue(now);
    const passwordHash = input.password ? await hashSecret(input.password) : null;
    const accountUpdate = passwordHash
      ? d1Statement(
          database,
          `UPDATE auth_users SET email = ?, display_name = ?, password_hash = ?, role = ?, is_active = ?, session_version = session_version + 1, updated_at = ?
          WHERE id = ? AND session_version = ?`,
          email,
          displayName,
          passwordHash,
          input.role,
          input.isActive ? 1 : 0,
          nowIso,
          input.id,
          current.sessionVersion,
        )
      : d1Statement(
          database,
          `UPDATE auth_users SET email = ?, display_name = ?, role = ?, is_active = ?, session_version = session_version + 1, updated_at = ?
          WHERE id = ? AND session_version = ?`,
          email,
          displayName,
          input.role,
          input.isActive ? 1 : 0,
          nowIso,
          input.id,
          current.sessionVersion,
        );
    const result = await d1Batch(database, [
      accountUpdate,
      d1Statement(
        database,
        `UPDATE verified_staff_sessions SET revoked_at = ?, revoked_reason = ? WHERE station_user_id = ? AND revoked_at IS NULL`,
        nowIso,
        'Account settings changed',
        input.id,
      ),
      d1AuditEvent(
        database,
        {
          action: 'account.updated',
          entity: 'AuthUser',
          entityId: input.id,
          actorId: input.adminId,
          metadata: {
            email,
            displayName,
            role: input.role,
            isActive: input.isActive,
            passwordChanged: Boolean(input.password),
          },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Account was changed before the update could be recorded; retry the command');
    const account = await prisma.authUser.findUniqueOrThrow({ where: { id: input.id } });
    return mapAccount(account, input.adminId ?? '');
  });
}

async function deleteDbAdminAccountD1(input: { id: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const account = await prisma.authUser.findUnique({
      where: { id: input.id },
      include: { _count: { select: { confirmedPayments: true } } },
    });
    if (!account) throw new Error('Account not found');
    if (input.id === input.adminId) throw new Error('You cannot delete the account you are using');
    if (account.role === AuthRole.ADMIN) {
      const adminCount = await prisma.authUser.count({ where: { role: AuthRole.ADMIN } });
      const activeAdminCount = await prisma.authUser.count({
        where: { role: AuthRole.ADMIN, isActive: true },
      });
      if (adminCount <= 1 || (account.isActive && activeAdminCount <= 1))
        throw new Error('Keep at least one active admin account');
    }
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(
        database,
        'DELETE FROM verified_staff_sessions WHERE station_user_id = ?',
        input.id,
      ),
      d1Statement(database, 'DELETE FROM auth_users WHERE id = ?', input.id),
      d1AuditEvent(
        database,
        {
          action: 'account.deleted',
          entity: 'AuthUser',
          entityId: input.id,
          actorId: input.adminId,
          metadata: {
            email: account.email,
            role: account.role,
            paymentHistoryCount: account._count.confirmedPayments,
          },
        },
        nowIso,
      ),
    ]);
    if (Number((result[1] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Account was changed before it could be deleted; retry the command');
    return { ok: true, id: input.id };
  });
}

async function createDbAdminCustomerD1(input: { name: string; phone: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const id = randomId();
    const phoneNormalized = normalizePhoneNumber(input.phone);
    const nowIso = d1DateTimeValue(new Date());
    await d1Batch(database, [
      d1Statement(
        database,
        `INSERT INTO customers (id, phone, phone_normalized, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        input.phone,
        phoneNormalized,
        input.name,
        nowIso,
        nowIso,
      ),
      d1AuditEvent(
        database,
        {
          action: 'customer.created',
          entity: 'Customer',
          entityId: id,
          actorId: input.adminId,
          metadata: { name: input.name, phone: input.phone },
        },
        nowIso,
      ),
    ]);
    return prisma.customer.findUniqueOrThrow({ where: { id } });
  });
}

async function updateDbAdminCustomerD1(input: {
  id: string;
  name: string;
  phone: string;
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const current = await prisma.customer.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Customer not found');
    const phoneNormalized = normalizePhoneNumber(input.phone);
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(
        database,
        `UPDATE customers SET name = ?, phone = ?, phone_normalized = ?, updated_at = ? WHERE id = ? AND updated_at = ?`,
        input.name,
        input.phone,
        phoneNormalized,
        nowIso,
        input.id,
        d1DateTimeValue(current.updatedAt),
      ),
      d1AuditEvent(
        database,
        {
          action: 'customer.updated',
          entity: 'Customer',
          entityId: input.id,
          actorId: input.adminId,
          metadata: { name: input.name, phone: input.phone },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error(
        'Customer was changed before the update could be recorded; retry the command',
      );
    return prisma.customer.findUniqueOrThrow({ where: { id: input.id } });
  });
}

async function deleteDbAdminCustomerD1(input: { id: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const customer = await prisma.customer.findUnique({
      where: { id: input.id },
      include: { _count: { select: { appointments: true } } },
    });
    if (!customer) throw new Error('Customer not found');
    if (customer._count.appointments > 0)
      throw new Error(
        'Customers with appointment history cannot be deleted; update the profile instead',
      );
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(database, 'DELETE FROM customers WHERE id = ?', input.id),
      d1AuditEvent(
        database,
        {
          action: 'customer.deleted',
          entity: 'Customer',
          entityId: input.id,
          actorId: input.adminId,
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Customer was changed before it could be deleted; retry the command');
    return { ok: true, id: input.id };
  });
}

async function createDbAdminStaffD1(input: {
  name: string;
  pin: string;
  skillIds: string[];
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const selectedSkillIds = [...new Set(input.skillIds)];
    const skills = await prisma.skill.findMany({
      where: { id: { in: selectedSkillIds } },
      select: { id: true },
    });
    if (skills.length !== selectedSkillIds.length)
      throw new Error('One or more selected skills do not exist');
    const id = randomId();
    const nowIso = d1DateTimeValue(new Date());
    const statements = [
      d1Statement(
        database,
        `INSERT INTO staff (id, name, initials, pin_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
        id,
        input.name,
        deriveStaffInitials(input.name),
        await hashSecret(input.pin),
        nowIso,
        nowIso,
      ),
      ...selectedSkillIds.map((skillId) =>
        d1Statement(
          database,
          'INSERT INTO staff_skills (staff_id, skill_id) VALUES (?, ?)',
          id,
          skillId,
        ),
      ),
      d1Statement(
        database,
        `INSERT INTO staff_service_state (staff_id, availability) VALUES (?, ?)`,
        id,
        Availability.AVAILABLE,
      ),
      d1AuditEvent(
        database,
        {
          action: 'staff.created',
          entity: 'Staff',
          entityId: id,
          actorId: input.adminId,
          metadata: { name: input.name, skillIds: selectedSkillIds },
        },
        nowIso,
      ),
    ];
    await d1Batch(database, statements);
    const businessDate = await currentDbBusinessDate();
    return prisma.staff
      .findUniqueOrThrow({ where: { id }, include: adminStaffInclude(businessDate) })
      .then(mapStaff);
  });
}

async function updateDbAdminStaffD1(input: {
  id: string;
  name: string;
  initials?: string;
  pin?: string;
  skillIds: string[];
  isActive: boolean;
  adminId?: string;
}) {
  const businessDate = await currentDbBusinessDate();
  return withD1Lease(async (database) => {
    const current = await prisma.staff.findUnique({
      where: { id: input.id },
      include: { skills: { select: { skillId: true } } },
    });
    if (!current) throw new Error('Staff not found');
    const selectedSkillIds = [...new Set(input.skillIds)];
    const skills = await prisma.skill.findMany({
      where: { id: { in: selectedSkillIds } },
      select: { id: true },
    });
    if (skills.length !== selectedSkillIds.length)
      throw new Error('One or more selected skills do not exist');
    if (!input.isActive) {
      const activePrimaryAssignment = await prisma.appointmentService.findFirst({
        where: {
          primaryStaffId: input.id,
          status: { in: staffBusyAppointmentStatuses },
          appointment: { businessDate },
        },
        select: { appointment: { select: { code: true } } },
      });
      const activeSupportAssignment = await prisma.appointmentSupportingStaff.findFirst({
        where: {
          staffId: input.id,
          releasedAt: null,
          appointment: { businessDate, status: { in: staffBusyAppointmentStatuses } },
        },
        select: { appointment: { select: { code: true } } },
      });
      if (activePrimaryAssignment || activeSupportAssignment)
        throw new Error(
          `Cannot deactivate staff while assigned to active turn ${activePrimaryAssignment?.appointment.code ?? activeSupportAssignment?.appointment.code}`,
        );
    }
    const initials = (input.initials ?? deriveStaffInitials(input.name)).toUpperCase();
    const pinHash = input.pin ? await hashSecret(input.pin) : current.pinHash;
    const now = new Date();
    const nowIso = d1DateTimeValue(now);
    const statements = [
      d1Statement(
        database,
        `UPDATE staff SET name = ?, initials = ?, pin_hash = ?, is_active = ?, updated_at = ? WHERE id = ? AND updated_at = ?`,
        input.name,
        initials,
        pinHash,
        input.isActive ? 1 : 0,
        nowIso,
        input.id,
        d1DateTimeValue(current.updatedAt),
      ),
      d1Statement(database, 'DELETE FROM staff_skills WHERE staff_id = ?', input.id),
      ...selectedSkillIds.map((skillId) =>
        d1Statement(
          database,
          'INSERT INTO staff_skills (staff_id, skill_id) VALUES (?, ?)',
          input.id,
          skillId,
        ),
      ),
      ...(input.isActive
        ? []
        : [
            d1Statement(
              database,
              'UPDATE staff_service_state SET availability = ? WHERE staff_id = ?',
              Availability.AVAILABLE,
              input.id,
            ),
            d1Statement(
              database,
              `UPDATE attendance SET status = ?, check_out_at = ?, closed_by = ? WHERE staff_id = ? AND business_date = ? AND status = ?`,
              AttendanceStatus.CHECKED_OUT,
              nowIso,
              PrismaAttendanceClosedBy.ADMIN,
              input.id,
              d1DateTimeValue(businessDate),
              AttendanceStatus.PRESENT,
            ),
          ]),
      d1AuditEvent(
        database,
        {
          action: 'staff.updated',
          entity: 'Staff',
          entityId: input.id,
          actorId: input.adminId,
          metadata: { name: input.name, skillIds: selectedSkillIds, isActive: input.isActive },
        },
        nowIso,
      ),
    ];
    const result = await d1Batch(database, statements);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Staff was changed before the update could be recorded; retry the command');
    return prisma.staff
      .findUniqueOrThrow({ where: { id: input.id }, include: adminStaffInclude(businessDate) })
      .then(mapStaff);
  });
}

async function createDbAdminServiceCategoryD1(input: {
  name: string;
  sortOrder: number;
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const id = `category-${randomId()}`;
    const name = input.name.trim();
    const slug = serviceCategorySlug(name);
    const nowIso = d1DateTimeValue(new Date());
    await d1Batch(database, [
      d1Statement(
        database,
        `INSERT INTO service_categories (id, name, slug, sort_order, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`,
        id,
        name,
        slug,
        input.sortOrder,
        nowIso,
        nowIso,
      ),
      d1AuditEvent(
        database,
        {
          action: 'service_category.created',
          entity: 'ServiceCategory',
          entityId: id,
          actorId: input.adminId,
          metadata: { name, slug, sortOrder: input.sortOrder },
        },
        nowIso,
      ),
    ]);
    const category = await prisma.serviceCategory.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { services: true } } },
    });
    return mapServiceCategory(category);
  });
}

async function updateDbAdminServiceCategoryD1(input: {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const current = await prisma.serviceCategory.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Service category not found');
    if (!input.isActive) {
      const activeServiceCount = await prisma.service.count({
        where: { categoryId: input.id, isActive: true },
      });
      if (activeServiceCount > 0)
        throw new Error('Move active services to another category before archiving this category');
    }
    const name = input.name.trim();
    const slug = serviceCategorySlug(name);
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(
        database,
        `UPDATE service_categories SET name = ?, slug = ?, sort_order = ?, is_active = ?, updated_at = ? WHERE id = ? AND updated_at = ?`,
        name,
        slug,
        input.sortOrder,
        input.isActive ? 1 : 0,
        nowIso,
        input.id,
        d1DateTimeValue(current.updatedAt),
      ),
      d1AuditEvent(
        database,
        {
          action: 'service_category.updated',
          entity: 'ServiceCategory',
          entityId: input.id,
          actorId: input.adminId,
          metadata: { name, slug, sortOrder: input.sortOrder, isActive: input.isActive },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error(
        'Service category was changed before the update could be recorded; retry the command',
      );
    const category = await prisma.serviceCategory.findUniqueOrThrow({
      where: { id: input.id },
      include: { _count: { select: { services: true } } },
    });
    return mapServiceCategory(category);
  });
}

async function deactivateDbAdminServiceCategoryD1(input: { id: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const category = await prisma.serviceCategory.findUnique({ where: { id: input.id } });
    if (!category) throw new Error('Service category not found');
    const activeServiceCount = await prisma.service.count({
      where: { categoryId: input.id, isActive: true },
    });
    if (activeServiceCount > 0)
      throw new Error('Move active services to another category before archiving this category');
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(
        database,
        `UPDATE service_categories SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1`,
        nowIso,
        input.id,
      ),
      d1AuditEvent(
        database,
        {
          action: 'service_category.archived',
          entity: 'ServiceCategory',
          entityId: input.id,
          actorId: input.adminId,
          metadata: { name: category.name },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error(
        'Service category was changed before it could be archived; retry the command',
      );
    return { ok: true, id: input.id };
  });
}

async function d1AssertServiceInputs(input: { categoryId: string; skillIds: string[] }) {
  const selectedSkillIds = [...new Set(input.skillIds)];
  const skills = await prisma.skill.findMany({
    where: { id: { in: selectedSkillIds } },
    select: { id: true },
  });
  if (skills.length !== selectedSkillIds.length)
    throw new Error('One or more selected skills do not exist');
  const category = await prisma.serviceCategory.findUnique({
    where: { id: input.categoryId },
    select: { id: true, isActive: true },
  });
  if (!category) throw new Error('Selected service category does not exist');
  if (!category.isActive) throw new Error('Selected service category is archived');
  return selectedSkillIds;
}

async function createDbAdminServiceD1(input: {
  name: string;
  description: string;
  iconKey: ServiceIconKey;
  categoryId: string;
  durationMin: number;
  price: number;
  skillIds: string[];
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const selectedSkillIds = await d1AssertServiceInputs(input);
    const id = randomId();
    const nowIso = d1DateTimeValue(new Date());
    await d1Batch(database, [
      d1Statement(
        database,
        `INSERT INTO services (id, name, description, icon_key, category_id, duration_min, price, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        id,
        input.name,
        input.description,
        input.iconKey,
        input.categoryId,
        input.durationMin,
        input.price,
        nowIso,
        nowIso,
      ),
      ...selectedSkillIds.map((skillId) =>
        d1Statement(
          database,
          'INSERT INTO service_skills (service_id, skill_id) VALUES (?, ?)',
          id,
          skillId,
        ),
      ),
      d1AuditEvent(
        database,
        {
          action: 'service.created',
          entity: 'Service',
          entityId: id,
          actorId: input.adminId,
          metadata: {
            name: input.name,
            description: input.description,
            iconKey: input.iconKey,
            skillIds: selectedSkillIds,
          },
        },
        nowIso,
      ),
    ]);
    return prisma.service
      .findUniqueOrThrow({ where: { id }, include: serviceInclude() })
      .then(mapService);
  });
}

async function updateDbAdminServiceD1(input: {
  id: string;
  name: string;
  description: string;
  iconKey: ServiceIconKey;
  categoryId: string;
  durationMin: number;
  price: number;
  skillIds: string[];
  isActive: boolean;
  adminId?: string;
}) {
  return withD1Lease(async (database) => {
    const current = await prisma.service.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Service not found');
    const selectedSkillIds = await d1AssertServiceInputs(input);
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(
        database,
        `UPDATE services SET name = ?, description = ?, icon_key = ?, category_id = ?, duration_min = ?, price = ?, is_active = ?, updated_at = ? WHERE id = ? AND updated_at = ?`,
        input.name,
        input.description,
        input.iconKey,
        input.categoryId,
        input.durationMin,
        input.price,
        input.isActive ? 1 : 0,
        nowIso,
        input.id,
        d1DateTimeValue(current.updatedAt),
      ),
      d1Statement(database, 'DELETE FROM service_skills WHERE service_id = ?', input.id),
      ...selectedSkillIds.map((skillId) =>
        d1Statement(
          database,
          'INSERT INTO service_skills (service_id, skill_id) VALUES (?, ?)',
          input.id,
          skillId,
        ),
      ),
      d1AuditEvent(
        database,
        {
          action: 'service.updated',
          entity: 'Service',
          entityId: input.id,
          actorId: input.adminId,
          metadata: {
            name: input.name,
            description: input.description,
            iconKey: input.iconKey,
            skillIds: selectedSkillIds,
            isActive: input.isActive,
          },
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Service was changed before the update could be recorded; retry the command');
    return prisma.service
      .findUniqueOrThrow({ where: { id: input.id }, include: serviceInclude() })
      .then(mapService);
  });
}

async function deactivateDbAdminServiceD1(input: { id: string; adminId?: string }) {
  return withD1Lease(async (database) => {
    const service = await prisma.service.findUnique({ where: { id: input.id } });
    if (!service) throw new Error('Service not found');
    const nowIso = d1DateTimeValue(new Date());
    const result = await d1Batch(database, [
      d1Statement(
        database,
        `UPDATE services SET is_active = 0, updated_at = ? WHERE id = ? AND is_active = 1`,
        nowIso,
        input.id,
      ),
      d1AuditEvent(
        database,
        {
          action: 'service.deactivated',
          entity: 'Service',
          entityId: input.id,
          actorId: input.adminId,
        },
        nowIso,
      ),
    ]);
    if (Number((result[0] as { meta?: { changes?: number } })?.meta?.changes ?? 0) !== 1)
      throw new Error('Service was changed before it could be deactivated; retry the command');
    return { ok: true, id: input.id };
  });
}

export async function getDbAdminSkills() {
  return (await prisma.skill.findMany({ orderBy: { name: 'asc' } })).map(mapSkill);
}

function mapSkillManagement(row: {
  id: string;
  name: string;
  createdAt: Date;
  _count: { staff: number; serviceSkills: number };
}): AdminSkillManagementSnapshot {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    staffCount: row._count.staff,
    serviceCount: row._count.serviceSkills,
  };
}

export async function getDbAdminSkillManagement(): Promise<AdminSkillManagementSnapshot[]> {
  const rows = await prisma.skill.findMany({
    include: { _count: { select: { staff: true, serviceSkills: true } } },
    orderBy: { name: 'asc' },
  });
  return rows.map(mapSkillManagement);
}

export async function createDbAdminSkill(input: { name: string; adminId?: string }) {
  if (await isD1Runtime()) return createDbAdminSkillD1(input);
  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.create({ data: { name: input.name } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'skill.created',
        entity: 'Skill',
        entityId: skill.id,
        metadata: { name: skill.name },
      },
    });
    return skill;
  });
}

export async function updateDbAdminSkill(input: { id: string; name: string; adminId?: string }) {
  if (await isD1Runtime()) return updateDbAdminSkillD1(input);
  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.update({ where: { id: input.id }, data: { name: input.name } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'skill.updated',
        entity: 'Skill',
        entityId: skill.id,
        metadata: { name: skill.name },
      },
    });
    return skill;
  });
}

export async function deleteDbAdminSkill(input: { id: string; adminId?: string }) {
  if (await isD1Runtime()) return deleteDbAdminSkillD1(input);
  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.findUnique({
      where: { id: input.id },
      include: { _count: { select: { staff: true, serviceSkills: true } } },
    });
    if (!skill) throw new Error('Skill not found');
    if (skill._count.staff > 0 || skill._count.serviceSkills > 0)
      throw new Error(
        'This skill is still assigned to staff or services; rename it instead of deleting it',
      );
    await tx.skill.delete({ where: { id: input.id } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'skill.deleted',
        entity: 'Skill',
        entityId: input.id,
        metadata: { name: skill.name },
      },
    });
    return { ok: true, id: input.id };
  });
}

function mapSkipReason(row: {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AdminSkipReasonSnapshot {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getDbAdminSkipReasons(): Promise<AdminSkipReasonSnapshot[]> {
  const rows = await prisma.skipReason.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(mapSkipReason);
}

export async function createDbAdminSkipReason(input: {
  name: string;
  sortOrder?: number;
  adminId?: string;
}) {
  if (await isD1Runtime()) return createDbAdminSkipReasonD1(input);
  return prisma.$transaction(async (tx) => {
    const reason = await tx.skipReason.create({
      data: { name: input.name.trim(), sortOrder: input.sortOrder ?? 0, isActive: true },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'skip_reason.created',
        entity: 'SkipReason',
        entityId: reason.id,
        metadata: { name: reason.name, sortOrder: reason.sortOrder },
      },
    });
    return mapSkipReason(reason);
  });
}

export async function updateDbAdminSkipReason(input: {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  adminId?: string;
}) {
  if (await isD1Runtime()) return updateDbAdminSkipReasonD1(input);
  return prisma.$transaction(async (tx) => {
    const reason = await tx.skipReason.update({
      where: { id: input.id },
      data: { name: input.name.trim(), sortOrder: input.sortOrder, isActive: input.isActive },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'skip_reason.updated',
        entity: 'SkipReason',
        entityId: reason.id,
        metadata: { name: reason.name, sortOrder: reason.sortOrder, isActive: reason.isActive },
      },
    });
    return mapSkipReason(reason);
  });
}

export async function deleteDbAdminSkipReason(input: { id: string; adminId?: string }) {
  if (await isD1Runtime()) return deleteDbAdminSkipReasonD1(input);
  return prisma.$transaction(async (tx) => {
    const reason = await tx.skipReason.findUnique({
      where: { id: input.id },
      include: { _count: { select: { turns: true } } },
    });
    if (!reason) throw new Error('Skip reason not found');
    if (reason._count.turns > 0)
      throw new Error('Skip reasons used in history cannot be deleted; deactivate them instead');
    await tx.skipReason.delete({ where: { id: input.id } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'skip_reason.deleted',
        entity: 'SkipReason',
        entityId: input.id,
        metadata: { name: reason.name },
      },
    });
    return { ok: true, id: input.id };
  });
}

export async function updateDbShopConfig(input: ShopOperationalConfig & { adminId?: string }) {
  if (await isD1Runtime()) return updateDbShopConfigD1(input);
  return prisma.$transaction(async (tx) => {
    const currentConfig = await tx.shopConfig.findUnique({ where: { id: 1 }, select: { currency: true } });
    if (currentConfig && currentConfig.currency !== input.currency) {
      const existingAppointment = await tx.appointment.findFirst({ select: { id: true } });
      if (existingAppointment) {
        throw new Error('Currency cannot be changed after visits exist; create a new shop configuration instead.');
      }
    }
    const config = await tx.shopConfig.upsert({
      where: { id: 1 },
      update: {
        timezone: input.timezone,
        openingTime: input.openingTime,
        closingTime: input.closingTime,
        currency: input.currency,
        verifiedSessionTtlMin: input.verifiedSessionTtlMin,
        roundRobinEnabled: input.roundRobinEnabled,
        stateVersion: { increment: 1 },
      },
      create: {
        id: 1,
        timezone: input.timezone,
        openingTime: input.openingTime,
        closingTime: input.closingTime,
        currency: input.currency,
        verifiedSessionTtlMin: input.verifiedSessionTtlMin,
        roundRobinEnabled: input.roundRobinEnabled,
        stateVersion: 1,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'shop_config.updated',
        entity: 'ShopConfig',
        entityId: String(config.id),
        metadata: {
          timezone: config.timezone,
          openingTime: config.openingTime,
          closingTime: config.closingTime,
          currency: config.currency,
          verifiedSessionTtlMin: config.verifiedSessionTtlMin,
          roundRobinEnabled: config.roundRobinEnabled,
        },
      },
    });
    return {
      timezone: config.timezone,
      openingTime: config.openingTime,
      closingTime: config.closingTime,
      currency: config.currency,
      verifiedSessionTtlMin: config.verifiedSessionTtlMin,
      roundRobinEnabled: config.roundRobinEnabled,
      stateVersion: config.stateVersion,
    };
  });
}

function mapAccount(
  row: {
    id: string;
    email: string;
    displayName: string | null;
    role: AuthRole;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  currentId: string,
): AdminAccountSnapshot {
  return {
    id: row.id,
    email: row.email,
    displayName:
      row.displayName?.trim() ||
      (row.role === AuthRole.ADMIN ? 'Administrator' : 'Station account'),
    role: row.role,
    isActive: row.isActive,
    isCurrent: row.id === currentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getDbAdminAccounts(currentId: string): Promise<AdminAccountSnapshot[]> {
  const rows = await prisma.authUser.findMany({ orderBy: [{ role: 'asc' }, { email: 'asc' }] });
  return rows.map((row) => mapAccount(row, currentId));
}

export async function createDbAdminAccount(input: {
  email: string;
  displayName?: string;
  password: string;
  role: 'ADMIN' | 'STATION';
  adminId?: string;
}) {
  if (await isD1Runtime()) return createDbAdminAccountD1(input);
  return prisma.$transaction(async (tx) => {
    const displayName =
      input.displayName?.trim() || (input.role === 'ADMIN' ? 'Administrator' : 'Station account');
    const account = await tx.authUser.create({
      data: {
        email: input.email.toLowerCase(),
        displayName,
        passwordHash: await hashSecret(input.password),
        role: input.role,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'account.created',
        entity: 'AuthUser',
        entityId: account.id,
        metadata: { email: account.email, displayName: account.displayName, role: account.role },
      },
    });
    return mapAccount(account, input.adminId ?? '');
  });
}

export async function updateDbAdminAccount(input: {
  id: string;
  email: string;
  displayName?: string;
  password?: string;
  role: 'ADMIN' | 'STATION';
  isActive: boolean;
  adminId?: string;
}) {
  if (await isD1Runtime()) return updateDbAdminAccountD1(input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.authUser.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Account not found');
    if (input.id === input.adminId && (!input.isActive || input.role !== 'ADMIN'))
      throw new Error('You cannot deactivate or change the role of the account you are using');
    if (
      current.role === 'ADMIN' &&
      current.isActive &&
      (input.role !== 'ADMIN' || !input.isActive)
    ) {
      const activeAdminCount = await tx.authUser.count({
        where: { role: 'ADMIN', isActive: true },
      });
      if (activeAdminCount <= 1) throw new Error('Keep at least one active admin account');
    }
    const displayName =
      input.displayName?.trim() ||
      current.displayName?.trim() ||
      (input.role === 'ADMIN' ? 'Administrator' : 'Station account');
    const data: Prisma.AuthUserUpdateInput = {
      email: input.email.toLowerCase(),
      displayName,
      role: input.role,
      isActive: input.isActive,
      sessionVersion: { increment: 1 },
    };
    if (input.password) data.passwordHash = await hashSecret(input.password);
    const account = await tx.authUser.update({ where: { id: input.id }, data });
    await tx.verifiedStaffSession.updateMany({
      where: { stationUserId: input.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'Account settings changed' },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'account.updated',
        entity: 'AuthUser',
        entityId: account.id,
        metadata: {
          email: account.email,
          displayName: account.displayName,
          role: account.role,
          isActive: account.isActive,
          passwordChanged: Boolean(input.password),
        },
      },
    });
    return mapAccount(account, input.adminId ?? '');
  });
}

export async function deleteDbAdminAccount(input: { id: string; adminId?: string }) {
  if (await isD1Runtime()) return deleteDbAdminAccountD1(input);
  return prisma.$transaction(async (tx) => {
    const account = await tx.authUser.findUnique({
      where: { id: input.id },
      include: { _count: { select: { confirmedPayments: true } } },
    });
    if (!account) throw new Error('Account not found');
    if (input.id === input.adminId) throw new Error('You cannot delete the account you are using');

    if (account.role === AuthRole.ADMIN) {
      const adminCount = await tx.authUser.count({ where: { role: AuthRole.ADMIN } });
      const activeAdminCount = await tx.authUser.count({
        where: { role: AuthRole.ADMIN, isActive: true },
      });
      if (adminCount <= 1 || (account.isActive && activeAdminCount <= 1))
        throw new Error('Keep at least one active admin account');
    }

    await tx.verifiedStaffSession.deleteMany({ where: { stationUserId: input.id } });
    await tx.authUser.delete({ where: { id: input.id } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'account.deleted',
        entity: 'AuthUser',
        entityId: input.id,
        metadata: {
          email: account.email,
          role: account.role,
          paymentHistoryCount: account._count.confirmedPayments,
        },
      },
    });
    return { ok: true, id: input.id };
  });
}

type D1AdminAttendanceRow = {
  staff_id: string;
  staff_name: string;
  initials: string;
  is_active: number | boolean;
  attendance_status: AttendanceStatus | null;
  check_in_at: string | null;
  check_out_at: string | null;
  closed_by: PrismaAttendanceClosedBy | null;
  has_active_assignment: number | boolean;
};

async function getDbAdminAttendanceD1(): Promise<AdminAttendanceSnapshot[]> {
  const database = await getD1Database();
  const businessDate = await currentDbBusinessDate();
  const businessDateValue = d1DateTimeValue(businessDate);
  const rows = await database
    .prepare(
      `SELECT
         s.id AS staff_id,
         s.name AS staff_name,
         s.initials,
         s.is_active,
         a.status AS attendance_status,
         a.check_in_at,
         a.check_out_at,
         a.closed_by,
         CASE WHEN EXISTS (
           SELECT 1
           FROM appointments primary_appointment
           WHERE primary_appointment.primary_staff_id = s.id
             AND primary_appointment.business_date = ?
             AND primary_appointment.status IN (?, ?)
         ) OR EXISTS (
           SELECT 1
           FROM appointment_supporting_staff support
           JOIN appointments support_appointment ON support_appointment.id = support.appointment_id
           WHERE support.staff_id = s.id
             AND support.released_at IS NULL
             AND support_appointment.business_date = ?
             AND support_appointment.status IN (?, ?)
         ) THEN 1 ELSE 0 END AS has_active_assignment
       FROM staff s
       LEFT JOIN attendance a
         ON a.staff_id = s.id
        AND a.business_date = ?
       ORDER BY s.name ASC`,
    )
    .bind(
      businessDateValue,
      ...staffBusyAppointmentStatuses,
      businessDateValue,
      ...staffBusyAppointmentStatuses,
      businessDateValue,
    )
    .all<D1AdminAttendanceRow>();

  return rows.results.map((row) => {
    const status = row.attendance_status ?? AttendanceStatus.ABSENT;
    const isPresent = status === AttendanceStatus.PRESENT;
    return {
      staffId: row.staff_id,
      staffName: row.staff_name,
      initials: row.initials,
      isActive: Boolean(row.is_active),
      status,
      availability:
        isPresent && Boolean(row.has_active_assignment)
          ? Availability.BUSY
          : Availability.AVAILABLE,
      checkInAt: row.check_in_at ? new Date(row.check_in_at) : null,
      checkOutAt: row.check_out_at ? new Date(row.check_out_at) : null,
      closedBy: row.closed_by,
    };
  });
}

export async function getDbAdminAttendance(): Promise<AdminAttendanceSnapshot[]> {
  if (await isD1Runtime()) return getDbAdminAttendanceD1();
  const businessDate = await currentDbBusinessDate();
  const rows = await prisma.staff.findMany({
    where: {},
    include: attendanceInclude(businessDate),
    orderBy: { name: 'asc' },
  });
  return rows.map(mapAttendance);
}

export async function getDbAdminCustomers(): Promise<AdminCustomerSnapshot[]> {
  return (await getDbAdminCustomersPage()).customers;
}

export async function getDbAdminCustomersPage(
  input: {
    search?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const pageSize = Math.min(Math.max(input.pageSize ?? 50, 1), 100);
  const page = Math.max(input.page ?? 1, 1);
  const search = input.search?.trim();
  const supportsInsensitiveMode = !(await isD1Runtime());
  const contains = search
    ? supportsInsensitiveMode
      ? { contains: search, mode: 'insensitive' as const }
      : { contains: search }
    : null;
  const where: Prisma.CustomerWhereInput = search
    ? {
        OR: [
          { name: contains ?? { contains: search } },
          { phone: contains ?? { contains: search } },
        ],
      }
    : {};
  const [total, rows] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      include: {
        _count: { select: { appointments: true } },
        appointments: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    customers: rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      appointmentCount: row._count.appointments,
      lastVisitAt: row.appointments[0]?.createdAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getDbAdminCustomerHistory(
  customerId: string,
  filters: {
    from?: Date;
    to?: Date;
    status?: AppointmentStatus;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<
  AdminCustomerHistorySnapshot & {
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }
> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, phone: true },
  });
  if (!customer) throw new Error('Customer not found');

  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 50);
  const page = Math.max(filters.page ?? 1, 1);
  const appointmentWhere: Prisma.AppointmentWhereInput = {
    customerId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from || filters.to
      ? {
          businessDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };
  const [total, completedCount, paymentSummary, rows] = await Promise.all([
    prisma.appointment.count({ where: appointmentWhere }),
    prisma.appointment.count({
      where: { ...appointmentWhere, status: AppointmentStatus.COMPLETED },
    }),
    prisma.payment.aggregate({
      where: { appointment: appointmentWhere },
      _sum: { amount: true, tip: true },
    }),
    prisma.appointment.findMany({
      where: appointmentWhere,
      include: {
        primaryStaff: true,
        payment: { include: { items: true } },
        services: { orderBy: { sequence: 'asc' }, include: { primaryStaff: true } },
      },
      orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const history = rows.map((row) => {
    const payment = row.payment?.confirmedAt
      ? {
          amount: moneyFromMinorUnits(toMinorUnits(row.payment.amount)),
          tip: moneyFromMinorUnits(toMinorUnits(row.payment.tip)),
          total: moneyFromMinorUnits(
            toMinorUnits(row.payment.amount) + toMinorUnits(row.payment.tip),
          ),
          method: row.payment.method,
          confirmedAt: row.payment.confirmedAt,
        }
      : null;
    const paymentItems = new Map(
      (row.payment?.items ?? []).map((item) => [item.appointmentServiceId, item]),
    );
    const services = row.services.map((service) => {
      const paymentItem = paymentItems.get(service.id);
      return {
        id: service.id,
        sequence: service.sequence,
        serviceName: service.serviceNameSnapshot,
        durationMin: service.durationMinSnapshot,
        amount: moneyFromMinorUnits(toMinorUnits(service.amount)),
        status: service.status,
        staffName: paymentItem?.staffNameSnapshot ?? service.primaryStaff?.name ?? null,
      };
    });
    return {
      id: row.id,
      code: row.code,
      businessDate: formatBusinessDate(row.businessDate),
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      serviceName:
        services.map((service) => service.serviceName).join(' + ') || row.serviceNameSnapshot,
      durationMin:
        services.reduce((total, service) => total + service.durationMin, 0) ||
        row.durationMinSnapshot,
      staffName:
        services
          .map((service) => service.staffName)
          .filter(Boolean)
          .join(', ') ||
        row.payment?.staffNameSnapshot ||
        row.primaryStaff?.name ||
        null,
      status: row.status,
      amount: moneyFromMinorUnits(toMinorUnits(row.amount)),
      services,
      payment,
    };
  });

  const paidTotal = moneyFromMinorUnits(toMinorUnits(paymentSummary._sum.amount ?? 0));
  const tipTotal = moneyFromMinorUnits(toMinorUnits(paymentSummary._sum.tip ?? 0));

  return {
    customer,
    summary: {
      visitCount: total,
      completedCount,
      paidTotal,
      tipTotal,
      totalCollected: paidTotal + tipTotal,
    },
    history,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function createDbAdminCustomer(input: {
  name: string;
  phone: string;
  adminId?: string;
}) {
  if (await isD1Runtime()) return createDbAdminCustomerD1(input);
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        name: input.name,
        phone: input.phone,
        phoneNormalized: normalizePhoneNumber(input.phone),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'customer.created',
        entity: 'Customer',
        entityId: customer.id,
        metadata: { name: customer.name, phone: customer.phone },
      },
    });
    return customer;
  });
}

export async function updateDbAdminCustomer(input: {
  id: string;
  name: string;
  phone: string;
  adminId?: string;
}) {
  if (await isD1Runtime()) return updateDbAdminCustomerD1(input);
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({
      where: { id: input.id },
      data: {
        name: input.name,
        phone: input.phone,
        phoneNormalized: normalizePhoneNumber(input.phone),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'customer.updated',
        entity: 'Customer',
        entityId: customer.id,
        metadata: { name: customer.name, phone: customer.phone },
      },
    });
    return customer;
  });
}

export async function deleteDbAdminCustomer(input: { id: string; adminId?: string }) {
  if (await isD1Runtime()) return deleteDbAdminCustomerD1(input);
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.id },
      include: { _count: { select: { appointments: true } } },
    });
    if (!customer) throw new Error('Customer not found');
    if (customer._count.appointments > 0)
      throw new Error(
        'Customers with appointment history cannot be deleted; update the profile instead',
      );
    await tx.customer.delete({ where: { id: input.id } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'customer.deleted',
        entity: 'Customer',
        entityId: input.id,
      },
    });
    return { ok: true, id: input.id };
  });
}

export async function getDbAdminStaff(): Promise<{
  staff: AdminStaffSnapshot[];
  skills: AdminSkillSnapshot[];
}> {
  const businessDate = await currentDbBusinessDate();
  const [rows, skills] = await Promise.all([
    prisma.staff.findMany({
      where: {},
      include: adminStaffInclude(businessDate),
      orderBy: { name: 'asc' },
    }),
    getDbAdminSkills(),
  ]);
  return { staff: rows.map(mapStaff), skills };
}

export async function createDbAdminStaff(input: {
  name: string;
  pin: string;
  skillIds: string[];
  adminId?: string;
}) {
  if (await isD1Runtime()) return createDbAdminStaffD1(input);
  const businessDate = await currentDbBusinessDate();
  return prisma
    .$transaction(async (tx) => {
      const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
      const staff = await tx.staff.create({
        data: {
          name: input.name,
          initials: deriveStaffInitials(input.name),
          pinHash: await hashSecret(input.pin),
          isActive: true,
        },
      });
      await tx.staffSkill.createMany({
        data: selectedSkillIds.map((skillId) => ({ staffId: staff.id, skillId })),
      });
      await tx.staffServiceState.create({ data: { staffId: staff.id } });
      await tx.auditEvent.create({
        data: {
          actorType: 'ADMIN',
          actorId: input.adminId,
          action: 'staff.created',
          entity: 'Staff',
          entityId: staff.id,
          metadata: { name: staff.name, skillIds: selectedSkillIds },
        },
      });
      return tx.staff.findUniqueOrThrow({
        where: { id: staff.id },
        include: adminStaffInclude(businessDate),
      });
    })
    .then(mapStaff);
}

export async function updateDbAdminStaff(input: {
  id: string;
  name: string;
  initials?: string;
  pin?: string;
  skillIds: string[];
  isActive: boolean;
  adminId?: string;
}) {
  if (await isD1Runtime()) return updateDbAdminStaffD1(input);
  const businessDate = await currentDbBusinessDate();
  return prisma
    .$transaction(async (tx) => {
      const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
      const data: Prisma.StaffUpdateInput = {
        name: input.name,
        initials: (input.initials ?? deriveStaffInitials(input.name)).toUpperCase(),
        isActive: input.isActive,
      };
      if (input.pin) data.pinHash = await hashSecret(input.pin);
      await tx.staff.update({ where: { id: input.id }, data });
      await tx.staffSkill.deleteMany({ where: { staffId: input.id } });
      await tx.staffSkill.createMany({
        data: selectedSkillIds.map((skillId) => ({ staffId: input.id, skillId })),
      });
      if (!input.isActive) {
        const activePrimaryAssignment = await tx.appointmentService.findFirst({
          where: {
            primaryStaffId: input.id,
            status: { in: staffBusyAppointmentStatuses },
            appointment: { businessDate },
          },
          select: { appointment: { select: { code: true } } },
        });
        const activeSupportAssignment = await tx.appointmentSupportingStaff.findFirst({
          where: {
            staffId: input.id,
            releasedAt: null,
            appointment: { businessDate, status: { in: staffBusyAppointmentStatuses } },
          },
          select: { appointment: { select: { code: true } } },
        });
        if (activePrimaryAssignment || activeSupportAssignment)
          throw new Error(
            `Cannot deactivate staff while assigned to active turn ${activePrimaryAssignment?.appointment.code ?? activeSupportAssignment?.appointment.code}`,
          );
        const closedAt = new Date();
        await tx.staffServiceState.updateMany({
          where: { staffId: input.id },
          data: { availability: Availability.AVAILABLE },
        });
        await tx.attendance.updateMany({
          where: { staffId: input.id, businessDate, status: AttendanceStatus.PRESENT },
          data: {
            status: AttendanceStatus.CHECKED_OUT,
            checkOutAt: closedAt,
            closedBy: PrismaAttendanceClosedBy.ADMIN,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          actorType: 'ADMIN',
          actorId: input.adminId,
          action: 'staff.updated',
          entity: 'Staff',
          entityId: input.id,
          metadata: { name: input.name, skillIds: selectedSkillIds, isActive: input.isActive },
        },
      });
      return tx.staff.findUniqueOrThrow({
        where: { id: input.id },
        include: adminStaffInclude(businessDate),
      });
    })
    .then(mapStaff);
}

export async function deactivateDbAdminStaff(input: { id: string; adminId?: string }) {
  const staff = await prisma.staff.findUniqueOrThrow({
    where: { id: input.id },
    include: { skills: { select: { skillId: true } } },
  });
  return updateDbAdminStaff({
    id: staff.id,
    name: staff.name,
    initials: staff.initials,
    skillIds: staff.skills.map((row) => row.skillId),
    isActive: false,
    adminId: input.adminId,
  });
}

function mapServiceCategory(row: {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  _count?: { services: number };
}): AdminServiceCategorySnapshot {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    isActive: row.isActive ?? true,
    serviceCount: row._count?.services ?? 0,
    createdAt: row.createdAt ?? new Date(0),
    updatedAt: row.updatedAt ?? new Date(0),
  };
}

function serviceCategorySlug(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `category-${Date.now()}`;
}

export async function getDbAdminServiceCategories(): Promise<AdminServiceCategorySnapshot[]> {
  const rows = await prisma.serviceCategory.findMany({
    include: { _count: { select: { services: true } } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(mapServiceCategory);
}

export async function createDbAdminServiceCategory(input: {
  name: string;
  sortOrder: number;
  adminId?: string;
}) {
  if (await isD1Runtime()) return createDbAdminServiceCategoryD1(input);
  return prisma.$transaction(async (tx) => {
    const category = await tx.serviceCategory.create({
      data: {
        id: `category-${randomId()}`,
        name: input.name.trim(),
        slug: serviceCategorySlug(input.name),
        sortOrder: input.sortOrder,
        isActive: true,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'service_category.created',
        entity: 'ServiceCategory',
        entityId: category.id,
        metadata: { name: category.name, slug: category.slug, sortOrder: category.sortOrder },
      },
    });
    return mapServiceCategory({ ...category, _count: { services: 0 } });
  });
}

export async function updateDbAdminServiceCategory(input: {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  adminId?: string;
}) {
  if (await isD1Runtime()) return updateDbAdminServiceCategoryD1(input);
  return prisma.$transaction(async (tx) => {
    const current = await tx.serviceCategory.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Service category not found');
    if (!input.isActive) {
      const activeServiceCount = await tx.service.count({
        where: { categoryId: input.id, isActive: true },
      });
      if (activeServiceCount > 0)
        throw new Error('Move active services to another category before archiving this category');
    }
    const category = await tx.serviceCategory.update({
      where: { id: input.id },
      data: {
        name: input.name.trim(),
        slug: serviceCategorySlug(input.name),
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
    const serviceCount = await tx.service.count({ where: { categoryId: category.id } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'service_category.updated',
        entity: 'ServiceCategory',
        entityId: category.id,
        metadata: {
          name: category.name,
          slug: category.slug,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
      },
    });
    return mapServiceCategory({ ...category, _count: { services: serviceCount } });
  });
}

export async function deactivateDbAdminServiceCategory(input: { id: string; adminId?: string }) {
  if (await isD1Runtime()) return deactivateDbAdminServiceCategoryD1(input);
  return prisma.$transaction(async (tx) => {
    const category = await tx.serviceCategory.findUnique({ where: { id: input.id } });
    if (!category) throw new Error('Service category not found');
    const activeServiceCount = await tx.service.count({
      where: { categoryId: input.id, isActive: true },
    });
    if (activeServiceCount > 0)
      throw new Error('Move active services to another category before archiving this category');
    await tx.serviceCategory.update({ where: { id: input.id }, data: { isActive: false } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'service_category.archived',
        entity: 'ServiceCategory',
        entityId: input.id,
        metadata: { name: category.name },
      },
    });
    return { ok: true, id: input.id };
  });
}

async function assertActiveServiceCategory(tx: Prisma.TransactionClient, categoryId: string) {
  const category = await tx.serviceCategory.findUnique({
    where: { id: categoryId },
    select: { id: true, isActive: true },
  });
  if (!category) throw new Error('Selected service category does not exist');
  if (!category.isActive) throw new Error('Selected service category is archived');
  return category;
}

function serviceInclude() {
  return {
    category: { select: { id: true, name: true, slug: true, sortOrder: true } },
    requiredSkills: { include: { skill: true }, orderBy: { skill: { name: 'asc' as const } } },
    _count: { select: { appointments: true } },
  };
}

function mapService(row: {
  id: string;
  name: string;
  description: string;
  iconKey: string;
  categoryId: string;
  category: ServiceCategorySnapshot;
  durationMin: number;
  price: Prisma.Decimal;
  isActive: boolean;
  requiredSkills: Array<{ skill: { id: string; name: string } }>;
  _count: { appointments: number };
  createdAt: Date;
  updatedAt: Date;
}): AdminServiceSnapshot {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconKey: normalizeServiceIconKey(row.iconKey),
    categoryId: row.categoryId,
    category: row.category,
    durationMin: row.durationMin,
    price: moneyFromMinorUnits(toMinorUnits(row.price)),
    requiredSkills: row.requiredSkills.map((item) => mapSkill(item.skill)),
    isActive: row.isActive,
    appointmentCount: row._count.appointments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getDbAdminServices(): Promise<{
  services: AdminServiceSnapshot[];
  skills: AdminSkillSnapshot[];
  categories: AdminServiceCategorySnapshot[];
}> {
  const [rows, skills, categories] = await Promise.all([
    prisma.service.findMany({ include: serviceInclude(), orderBy: { name: 'asc' } }),
    getDbAdminSkills(),
    getDbAdminServiceCategories(),
  ]);
  return { services: rows.map(mapService), skills, categories };
}

export async function createDbAdminService(input: {
  name: string;
  description: string;
  iconKey: ServiceIconKey;
  categoryId: string;
  durationMin: number;
  price: number;
  skillIds: string[];
  adminId?: string;
}) {
  if (await isD1Runtime()) return createDbAdminServiceD1(input);
  return prisma
    .$transaction(async (tx) => {
      const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
      await assertActiveServiceCategory(tx, input.categoryId);
      const service = await tx.service.create({
        data: {
          name: input.name,
          description: input.description,
          iconKey: input.iconKey,
          categoryId: input.categoryId,
          durationMin: input.durationMin,
          price: input.price,
          isActive: true,
        },
      });
      await tx.serviceSkill.createMany({
        data: selectedSkillIds.map((skillId) => ({ serviceId: service.id, skillId })),
      });
      await tx.auditEvent.create({
        data: {
          actorType: 'ADMIN',
          actorId: input.adminId,
          action: 'service.created',
          entity: 'Service',
          entityId: service.id,
          metadata: {
            name: service.name,
            description: service.description,
            iconKey: service.iconKey,
            skillIds: selectedSkillIds,
          },
        },
      });
      return tx.service.findUniqueOrThrow({ where: { id: service.id }, include: serviceInclude() });
    })
    .then(mapService);
}

export async function updateDbAdminService(input: {
  id: string;
  name: string;
  description: string;
  iconKey: ServiceIconKey;
  categoryId: string;
  durationMin: number;
  price: number;
  skillIds: string[];
  isActive: boolean;
  adminId?: string;
}) {
  if (await isD1Runtime()) return updateDbAdminServiceD1(input);
  return prisma
    .$transaction(async (tx) => {
      const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
      await assertActiveServiceCategory(tx, input.categoryId);
      const service = await tx.service.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          iconKey: input.iconKey,
          categoryId: input.categoryId,
          durationMin: input.durationMin,
          price: input.price,
          isActive: input.isActive,
        },
      });
      await tx.serviceSkill.deleteMany({ where: { serviceId: service.id } });
      await tx.serviceSkill.createMany({
        data: selectedSkillIds.map((skillId) => ({ serviceId: service.id, skillId })),
      });
      await tx.auditEvent.create({
        data: {
          actorType: 'ADMIN',
          actorId: input.adminId,
          action: 'service.updated',
          entity: 'Service',
          entityId: service.id,
          metadata: {
            name: service.name,
            description: service.description,
            iconKey: service.iconKey,
            skillIds: selectedSkillIds,
            isActive: service.isActive,
          },
        },
      });
      return tx.service.findUniqueOrThrow({ where: { id: service.id }, include: serviceInclude() });
    })
    .then(mapService);
}

export async function deactivateDbAdminService(input: { id: string; adminId?: string }) {
  if (await isD1Runtime()) return deactivateDbAdminServiceD1(input);
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.update({ where: { id: input.id }, data: { isActive: false } });
    await tx.auditEvent.create({
      data: {
        actorType: 'ADMIN',
        actorId: input.adminId,
        action: 'service.deactivated',
        entity: 'Service',
        entityId: service.id,
      },
    });
    return { ok: true, id: service.id };
  });
}
