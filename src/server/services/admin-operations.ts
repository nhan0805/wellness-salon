import { AppointmentStatus, AttendanceClosedBy as PrismaAttendanceClosedBy, AttendanceStatus, Availability, AuthRole, Prisma } from '@prisma/client';
import type { AdminAccountSnapshot, AdminAttendanceSnapshot, AdminCustomerHistorySnapshot, AdminCustomerSnapshot, AdminServiceSnapshot, AdminSkillManagementSnapshot, AdminSkillSnapshot, AdminStaffSnapshot } from '@/src/domain/types';
import { deriveStaffInitials } from '@/src/domain/staff';
import { normalizeServiceIconKey, type ServiceIconKey } from '@/src/domain/service-icons';
import { normalizePhoneNumber } from '@/src/domain/phone';
import { currentBusinessDate, formatBusinessDate, staffBusyAppointmentStatuses } from '@/src/server/services/prisma-operations';
import { prisma } from '@/src/server/db';
import { hashSecret } from '@/src/server/security';

function mapAttendance(row: {
  id: string;
  name: string;
  initials: string;
  isActive: boolean;
  attendance: Array<{ status: AttendanceStatus; checkInAt: Date | null; checkOutAt: Date | null; closedBy: PrismaAttendanceClosedBy | null }>;
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
    appointments: { where: { businessDate, status: { in: staffBusyAppointmentStatuses } }, select: { id: true } },
    supportingAppointments: { where: { appointment: { businessDate, status: { in: staffBusyAppointmentStatuses } } }, select: { appointmentId: true } },
  };
}

function attendanceInclude(businessDate: Date) {
  return {
    attendance: { where: { businessDate } },
    serviceState: true,
    appointments: { where: { businessDate, status: { in: staffBusyAppointmentStatuses } }, select: { id: true } },
    supportingAppointments: { where: { appointment: { businessDate, status: { in: staffBusyAppointmentStatuses } } }, select: { appointmentId: true } },
  };
}

function adminStaffInclude(businessDate: Date) {
  return {
    ...staffInclude(businessDate),
  };
}

async function assertSkillIds(tx: Prisma.TransactionClient, skillIds: string[]) {
  const uniqueIds = [...new Set(skillIds)];
  const skills = await tx.skill.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } });
  if (skills.length !== uniqueIds.length) throw new Error('One or more selected skills do not exist');
  return uniqueIds;
}

export async function getDbAdminSkills() {
  return (await prisma.skill.findMany({ orderBy: { name: 'asc' } })).map(mapSkill);
}

function mapSkillManagement(row: { id: string; name: string; createdAt: Date; _count: { staff: number; serviceSkills: number } }): AdminSkillManagementSnapshot {
  return { id: row.id, name: row.name, createdAt: row.createdAt, staffCount: row._count.staff, serviceCount: row._count.serviceSkills };
}

export async function getDbAdminSkillManagement(): Promise<AdminSkillManagementSnapshot[]> {
  const rows = await prisma.skill.findMany({ include: { _count: { select: { staff: true, serviceSkills: true } } }, orderBy: { name: 'asc' } });
  return rows.map(mapSkillManagement);
}

export async function createDbAdminSkill(input: { name: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.create({ data: { name: input.name } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'skill.created', entity: 'Skill', entityId: skill.id, metadata: { name: skill.name } } });
    return skill;
  });
}

export async function updateDbAdminSkill(input: { id: string; name: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.update({ where: { id: input.id }, data: { name: input.name } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'skill.updated', entity: 'Skill', entityId: skill.id, metadata: { name: skill.name } } });
    return skill;
  });
}

export async function deleteDbAdminSkill(input: { id: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const skill = await tx.skill.findUnique({ where: { id: input.id }, include: { _count: { select: { staff: true, serviceSkills: true } } } });
    if (!skill) throw new Error('Skill not found');
    if (skill._count.staff > 0 || skill._count.serviceSkills > 0) throw new Error('This skill is still assigned to staff or services; rename it instead of deleting it');
    await tx.skill.delete({ where: { id: input.id } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'skill.deleted', entity: 'Skill', entityId: input.id, metadata: { name: skill.name } } });
    return { ok: true, id: input.id };
  });
}

function mapAccount(row: { id: string; email: string; role: AuthRole; isActive: boolean; createdAt: Date; updatedAt: Date }, currentId: string): AdminAccountSnapshot {
  return { id: row.id, email: row.email, role: row.role, isActive: row.isActive, isCurrent: row.id === currentId, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function getDbAdminAccounts(currentId: string): Promise<AdminAccountSnapshot[]> {
  const rows = await prisma.authUser.findMany({ orderBy: [{ role: 'asc' }, { email: 'asc' }] });
  return rows.map((row) => mapAccount(row, currentId));
}

export async function createDbAdminAccount(input: { email: string; password: string; role: 'ADMIN' | 'STATION'; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.authUser.create({ data: { email: input.email.toLowerCase(), passwordHash: await hashSecret(input.password), role: input.role } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'account.created', entity: 'AuthUser', entityId: account.id, metadata: { email: account.email, role: account.role } } });
    return mapAccount(account, input.adminId ?? '');
  });
}

export async function updateDbAdminAccount(input: { id: string; email: string; password?: string; role: 'ADMIN' | 'STATION'; isActive: boolean; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.authUser.findUnique({ where: { id: input.id } });
    if (!current) throw new Error('Account not found');
    if (input.id === input.adminId && (!input.isActive || input.role !== 'ADMIN')) throw new Error('You cannot deactivate or change the role of the account you are using');
    if (current.role === 'ADMIN' && current.isActive && (input.role !== 'ADMIN' || !input.isActive)) {
      const activeAdminCount = await tx.authUser.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdminCount <= 1) throw new Error('Keep at least one active admin account');
    }
    const data: Prisma.AuthUserUpdateInput = { email: input.email.toLowerCase(), role: input.role, isActive: input.isActive };
    if (input.password) data.passwordHash = await hashSecret(input.password);
    const account = await tx.authUser.update({ where: { id: input.id }, data });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'account.updated', entity: 'AuthUser', entityId: account.id, metadata: { email: account.email, role: account.role, isActive: account.isActive, passwordChanged: Boolean(input.password) } } });
    return mapAccount(account, input.adminId ?? '');
  });
}

export async function deleteDbAdminAccount(input: { id: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.authUser.findUnique({ where: { id: input.id }, include: { _count: { select: { confirmedPayments: true } } } });
    if (!account) throw new Error('Account not found');
    if (input.id === input.adminId) throw new Error('You cannot delete the account you are using');

    if (account.role === AuthRole.ADMIN) {
      const adminCount = await tx.authUser.count({ where: { role: AuthRole.ADMIN } });
      const activeAdminCount = await tx.authUser.count({ where: { role: AuthRole.ADMIN, isActive: true } });
      if (adminCount <= 1 || (account.isActive && activeAdminCount <= 1)) throw new Error('Keep at least one active admin account');
    }

    await tx.verifiedStaffSession.deleteMany({ where: { stationUserId: input.id } });
    await tx.authUser.delete({ where: { id: input.id } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'account.deleted', entity: 'AuthUser', entityId: input.id, metadata: { email: account.email, role: account.role, paymentHistoryCount: account._count.confirmedPayments } } });
    return { ok: true, id: input.id };
  });
}

export async function getDbAdminAttendance(): Promise<AdminAttendanceSnapshot[]> {
  const businessDate = currentBusinessDate();
  const rows = await prisma.staff.findMany({ where: {}, include: attendanceInclude(businessDate), orderBy: { name: 'asc' } });
  return rows.map(mapAttendance);
}

export async function getDbAdminCustomers(): Promise<AdminCustomerSnapshot[]> {
  const rows = await prisma.customer.findMany({
    include: { _count: { select: { appointments: true } }, appointments: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, phone: row.phone, appointmentCount: row._count.appointments, lastVisitAt: row.appointments[0]?.createdAt ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt }));
}

export async function getDbAdminCustomerHistory(customerId: string, filters: { from?: Date; to?: Date; status?: AppointmentStatus } = {}): Promise<AdminCustomerHistorySnapshot> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, phone: true } });
  if (!customer) throw new Error('Customer not found');

  const rows = await prisma.appointment.findMany({
    where: {
      customerId,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to ? { businessDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
    },
    include: { primaryStaff: true, payment: { include: { items: true } }, services: { orderBy: { sequence: 'asc' }, include: { primaryStaff: true } } },
    orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
  });

  const history = rows.map((row) => {
    const payment = row.payment?.confirmedAt ? {
      amount: Number(row.payment.amount),
      tip: Number(row.payment.tip),
      total: Number(row.payment.amount) + Number(row.payment.tip),
      method: row.payment.method,
      confirmedAt: row.payment.confirmedAt,
    } : null;
    const paymentItems = new Map((row.payment?.items ?? []).map((item) => [item.appointmentServiceId, item]));
    const services = row.services.map((service) => {
      const paymentItem = paymentItems.get(service.id);
      return {
        id: service.id,
        sequence: service.sequence,
        serviceName: service.serviceNameSnapshot,
        durationMin: service.durationMinSnapshot,
        amount: Number(service.amount),
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
      serviceName: services.map((service) => service.serviceName).join(' + ') || row.serviceNameSnapshot,
      durationMin: services.reduce((total, service) => total + service.durationMin, 0) || row.durationMinSnapshot,
      staffName: services.map((service) => service.staffName).filter(Boolean).join(', ') || row.payment?.staffNameSnapshot || row.primaryStaff?.name || null,
      status: row.status,
      amount: Number(row.amount),
      services,
      payment,
    };
  });

  return {
    customer,
    summary: {
      visitCount: history.length,
      completedCount: history.filter((item) => item.status === AppointmentStatus.COMPLETED).length,
      paidTotal: history.reduce((total, item) => total + (item.payment?.amount ?? 0), 0),
      tipTotal: history.reduce((total, item) => total + (item.payment?.tip ?? 0), 0),
    },
    history,
  };
}

export async function createDbAdminCustomer(input: { name: string; phone: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({ data: { name: input.name, phone: input.phone, phoneNormalized: normalizePhoneNumber(input.phone) } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'customer.created', entity: 'Customer', entityId: customer.id, metadata: { name: customer.name, phone: customer.phone } } });
    return customer;
  });
}

export async function updateDbAdminCustomer(input: { id: string; name: string; phone: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.update({ where: { id: input.id }, data: { name: input.name, phone: input.phone, phoneNormalized: normalizePhoneNumber(input.phone) } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'customer.updated', entity: 'Customer', entityId: customer.id, metadata: { name: customer.name, phone: customer.phone } } });
    return customer;
  });
}

export async function deleteDbAdminCustomer(input: { id: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.id }, include: { _count: { select: { appointments: true } } } });
    if (!customer) throw new Error('Customer not found');
    if (customer._count.appointments > 0) throw new Error('Customers with appointment history cannot be deleted; update the profile instead');
    await tx.customer.delete({ where: { id: input.id } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'customer.deleted', entity: 'Customer', entityId: input.id } });
    return { ok: true, id: input.id };
  });
}

export async function getDbAdminStaff(): Promise<{ staff: AdminStaffSnapshot[]; skills: AdminSkillSnapshot[] }> {
  const businessDate = currentBusinessDate();
  const [rows, skills] = await Promise.all([
    prisma.staff.findMany({ where: {}, include: adminStaffInclude(businessDate), orderBy: { name: 'asc' } }),
    getDbAdminSkills(),
  ]);
  return { staff: rows.map(mapStaff), skills };
}

export async function createDbAdminStaff(input: { name: string; pin: string; skillIds: string[]; adminId?: string }) {
  const businessDate = currentBusinessDate();
  return prisma.$transaction(async (tx) => {
    const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
    const staff = await tx.staff.create({ data: { name: input.name, initials: deriveStaffInitials(input.name), pinHash: await hashSecret(input.pin), isActive: true } });
    await tx.staffSkill.createMany({ data: selectedSkillIds.map((skillId) => ({ staffId: staff.id, skillId })) });
    await tx.staffServiceState.create({ data: { staffId: staff.id } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'staff.created', entity: 'Staff', entityId: staff.id, metadata: { name: staff.name, skillIds: selectedSkillIds } } });
    return tx.staff.findUniqueOrThrow({ where: { id: staff.id }, include: adminStaffInclude(businessDate) });
  }).then(mapStaff);
}

export async function updateDbAdminStaff(input: { id: string; name: string; initials?: string; pin?: string; skillIds: string[]; isActive: boolean; adminId?: string }) {
  const businessDate = currentBusinessDate();
  return prisma.$transaction(async (tx) => {
    const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
    const data: Prisma.StaffUpdateInput = { name: input.name, initials: (input.initials ?? deriveStaffInitials(input.name)).toUpperCase(), isActive: input.isActive };
    if (input.pin) data.pinHash = await hashSecret(input.pin);
    await tx.staff.update({ where: { id: input.id }, data });
    await tx.staffSkill.deleteMany({ where: { staffId: input.id } });
    await tx.staffSkill.createMany({ data: selectedSkillIds.map((skillId) => ({ staffId: input.id, skillId })) });
    if (!input.isActive) {
      const activePrimaryAssignment = await tx.appointmentService.findFirst({ where: { primaryStaffId: input.id, status: { in: staffBusyAppointmentStatuses }, appointment: { businessDate } }, select: { appointment: { select: { code: true } } } });
      const activeSupportAssignment = await tx.appointmentSupportingStaff.findFirst({ where: { staffId: input.id, appointment: { businessDate, status: { in: staffBusyAppointmentStatuses } } }, select: { appointment: { select: { code: true } } } });
      if (activePrimaryAssignment || activeSupportAssignment) throw new Error(`Cannot deactivate staff while assigned to active turn ${activePrimaryAssignment?.appointment.code ?? activeSupportAssignment?.appointment.code}`);
      const closedAt = new Date();
      await tx.staffServiceState.updateMany({ where: { staffId: input.id }, data: { availability: Availability.AVAILABLE } });
      await tx.attendance.updateMany({ where: { staffId: input.id, businessDate, status: AttendanceStatus.PRESENT }, data: { status: AttendanceStatus.CHECKED_OUT, checkOutAt: closedAt, closedBy: PrismaAttendanceClosedBy.ADMIN } });
    }
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'staff.updated', entity: 'Staff', entityId: input.id, metadata: { name: input.name, skillIds: selectedSkillIds, isActive: input.isActive } } });
    return tx.staff.findUniqueOrThrow({ where: { id: input.id }, include: adminStaffInclude(businessDate) });
  }).then(mapStaff);
}

export async function deactivateDbAdminStaff(input: { id: string; adminId?: string }) {
  const staff = await prisma.staff.findUniqueOrThrow({ where: { id: input.id }, include: { skills: { select: { skillId: true } } } });
  return updateDbAdminStaff({ id: staff.id, name: staff.name, initials: staff.initials, skillIds: staff.skills.map((row) => row.skillId), isActive: false, adminId: input.adminId });
}

function serviceInclude() {
  return {
    requiredSkills: { include: { skill: true }, orderBy: { skill: { name: 'asc' as const } } },
    _count: { select: { appointments: true } },
  };
}

function mapService(row: {
  id: string;
  name: string;
  iconKey: string;
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
    iconKey: normalizeServiceIconKey(row.iconKey),
    durationMin: row.durationMin,
    price: Number(row.price),
    requiredSkills: row.requiredSkills.map((item) => mapSkill(item.skill)),
    isActive: row.isActive,
    appointmentCount: row._count.appointments,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getDbAdminServices(): Promise<{ services: AdminServiceSnapshot[]; skills: AdminSkillSnapshot[] }> {
  const [rows, skills] = await Promise.all([
    prisma.service.findMany({ include: serviceInclude(), orderBy: { name: 'asc' } }),
    getDbAdminSkills(),
  ]);
  return { services: rows.map(mapService), skills };
}

export async function createDbAdminService(input: { name: string; iconKey: ServiceIconKey; durationMin: number; price: number; skillIds: string[]; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
    const service = await tx.service.create({ data: { name: input.name, iconKey: input.iconKey, durationMin: input.durationMin, price: input.price, isActive: true } });
    await tx.serviceSkill.createMany({ data: selectedSkillIds.map((skillId) => ({ serviceId: service.id, skillId })) });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'service.created', entity: 'Service', entityId: service.id, metadata: { name: service.name, iconKey: service.iconKey, skillIds: selectedSkillIds } } });
    return tx.service.findUniqueOrThrow({ where: { id: service.id }, include: serviceInclude() });
  }).then(mapService);
}

export async function updateDbAdminService(input: { id: string; name: string; iconKey: ServiceIconKey; durationMin: number; price: number; skillIds: string[]; isActive: boolean; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const selectedSkillIds = await assertSkillIds(tx, input.skillIds);
    const service = await tx.service.update({ where: { id: input.id }, data: { name: input.name, iconKey: input.iconKey, durationMin: input.durationMin, price: input.price, isActive: input.isActive } });
    await tx.serviceSkill.deleteMany({ where: { serviceId: service.id } });
    await tx.serviceSkill.createMany({ data: selectedSkillIds.map((skillId) => ({ serviceId: service.id, skillId })) });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'service.updated', entity: 'Service', entityId: service.id, metadata: { name: service.name, iconKey: service.iconKey, skillIds: selectedSkillIds, isActive: service.isActive } } });
    return tx.service.findUniqueOrThrow({ where: { id: service.id }, include: serviceInclude() });
  }).then(mapService);
}

export async function deactivateDbAdminService(input: { id: string; adminId?: string }) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.update({ where: { id: input.id }, data: { isActive: false } });
    await tx.auditEvent.create({ data: { actorType: 'ADMIN', actorId: input.adminId, action: 'service.deactivated', entity: 'Service', entityId: service.id } });
    return { ok: true, id: service.id };
  });
}
