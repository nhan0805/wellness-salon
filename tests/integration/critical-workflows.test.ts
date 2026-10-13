import { afterAll, describe, expect, it } from 'vitest';
import { AppointmentStatus, AttendanceStatus, Availability, TurnStatus } from '@prisma/client';
import { prisma } from '@/src/server/db';
import {
  currentDbBusinessDate,
  createDbCheckIn,
  cancelDbAppointment,
  overrideDbTurnExclusion,
  reconcileDbAssignments,
  staffActionDb,
  changeDbAppointmentService,
} from '@/src/server/services/prisma-operations';

const enabled =
  process.env.RUN_DB_TESTS === 'true' &&
  Boolean(process.env.TEST_DATABASE_URL) &&
  process.env.TEST_DATABASE_URL !== process.env.APPLICATION_DATABASE_URL;

type Fixture = { staffIds: string[]; appointmentIds: string[]; customerIds: string[] };

let sequence = 0;

function uniqueLabel(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function uniquePhone() {
  return `+1 415 777 ${Date.now()}${sequence}`;
}

async function createPresentStaff(fixture: Fixture, skillId: string, namePrefix: string) {
  const businessDate = await currentDbBusinessDate();
  const seedStaff = await prisma.staff.findFirstOrThrow({
    where: { id: { startsWith: 'seed-staff-' } },
  });
  const staff = await prisma.staff.create({
    data: { name: uniqueLabel(namePrefix), initials: 'IT', pinHash: seedStaff.pinHash },
  });
  fixture.staffIds.push(staff.id);
  await prisma.staffSkill.create({ data: { staffId: staff.id, skillId } });
  await prisma.staffServiceState.create({
    data: { staffId: staff.id, availability: Availability.AVAILABLE },
  });
  await prisma.attendance.create({
    data: {
      staffId: staff.id,
      businessDate,
      status: AttendanceStatus.PRESENT,
      checkInAt: new Date(),
    },
  });
  return staff;
}

async function createAssignedAppointment(fixture: Fixture, staffCount = 1) {
  const service = await prisma.service.findUniqueOrThrow({
    where: { id: 'seed-basic-manicure' },
    include: { requiredSkills: true },
  });
  const skillId = service.requiredSkills[0]?.skillId;
  if (!skillId) throw new Error('Seed manicure skill is missing');
  for (let index = 0; index < staffCount; index += 1)
    await createPresentStaff(fixture, skillId, `Workflow staff ${index + 1}`);
  const result = await createDbCheckIn({
    serviceId: service.id,
    phone: uniquePhone(),
    name: uniqueLabel('Workflow guest'),
    idempotencyKey: uniqueLabel('check-in'),
  });
  fixture.appointmentIds.push(result.appointmentId);
  const appointment = await prisma.appointment.findUniqueOrThrow({
    where: { id: result.appointmentId },
    include: { customer: true, services: true },
  });
  fixture.customerIds.push(appointment.customerId);
  const appointmentService = appointment.services[0];
  if (!appointmentService?.primaryStaffId) throw new Error('Fixture appointment was not assigned');
  return { appointment, appointmentService, service };
}

async function cleanup(fixture: Fixture) {
  if (fixture.appointmentIds.length)
    await prisma.appointment.deleteMany({ where: { id: { in: fixture.appointmentIds } } });
  if (fixture.customerIds.length)
    await prisma.customer.deleteMany({ where: { id: { in: fixture.customerIds } } });
  if (fixture.staffIds.length) {
    await prisma.attendance.deleteMany({ where: { staffId: { in: fixture.staffIds } } });
    await prisma.staffSkill.deleteMany({ where: { staffId: { in: fixture.staffIds } } });
    await prisma.staffServiceState.deleteMany({ where: { staffId: { in: fixture.staffIds } } });
    await prisma.staff.deleteMany({ where: { id: { in: fixture.staffIds } } });
  }
}

async function suspendSeedAttendanceForRoutingTest() {
  const businessDate = await currentDbBusinessDate();
  const seededStaff = await prisma.staff.findMany({
    where: { id: { startsWith: 'seed-staff-' } },
    select: { id: true },
  });
  const seededAttendance = await prisma.attendance.findMany({
    where: { staffId: { in: seededStaff.map((staff) => staff.id) }, businessDate },
    select: { staffId: true, status: true, checkInAt: true, checkOutAt: true, closedBy: true },
  });
  await prisma.attendance.updateMany({
    where: { staffId: { in: seededStaff.map((staff) => staff.id) }, businessDate },
    data: { status: AttendanceStatus.ABSENT, checkInAt: null, checkOutAt: null, closedBy: null },
  });
  return async () => {
    await Promise.all(
      seededAttendance.map((attendance) =>
        prisma.attendance.update({
          where: { staffId_businessDate: { staffId: attendance.staffId, businessDate } },
          data: {
            status: attendance.status,
            checkInAt: attendance.checkInAt,
            checkOutAt: attendance.checkOutAt,
            closedBy: attendance.closedBy,
          },
        }),
      ),
    );
  };
}

describe.skipIf(!enabled)('critical PostgreSQL workflow safety', () => {
  it('persists an exact skip exclusion across reconciliation and permits only an audited override', async () => {
    const fixture: Fixture = { staffIds: [], appointmentIds: [], customerIds: [] };
    const restoreSeedAttendance = await suspendSeedAttendanceForRoutingTest();
    try {
      const admin = await prisma.authUser.findFirstOrThrow({
        where: { role: 'ADMIN', isActive: true },
      });
      const { appointment, appointmentService } = await createAssignedAppointment(fixture);
      const assignedStaffId = appointmentService.primaryStaffId!;
      const skipReason = await prisma.skipReason.findFirstOrThrow({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      await staffActionDb(
        {
          action: 'SKIP',
          appointmentId: appointment.id,
          appointmentServiceId: appointmentService.id,
          staffId: assignedStaffId,
          skipReasonId: skipReason.id,
          idempotencyKey: uniqueLabel('skip'),
        },
        admin.id,
        undefined,
        true,
      );
      const skipped = await prisma.appointmentService.findUniqueOrThrow({
        where: { id: appointmentService.id },
        include: { turnExclusions: true },
      });
      expect(skipped.status).toBe(AppointmentStatus.WAITING);
      expect(skipped.primaryStaffId).toBeNull();
      expect(skipped.turnExclusions).toHaveLength(1);

      await reconcileDbAssignments(undefined, admin.id);
      const stillWaiting = await prisma.appointmentService.findUniqueOrThrow({
        where: { id: appointmentService.id },
      });
      expect(stillWaiting.status).toBe(AppointmentStatus.WAITING);
      expect(stillWaiting.primaryStaffId).toBeNull();

      const override = await overrideDbTurnExclusion({
        appointmentServiceId: appointmentService.id,
        staffId: assignedStaffId,
        reason: 'Manager confirmed the technician is appropriate',
        idempotencyKey: uniqueLabel('override'),
        adminId: admin.id,
      });
      expect(override.idempotent).toBe(false);
      const overridden = await prisma.turnExclusion.findUniqueOrThrow({
        where: {
          appointmentServiceId_staffId: {
            appointmentServiceId: appointmentService.id,
            staffId: assignedStaffId,
          },
        },
      });
      expect(overridden.overriddenAt).not.toBeNull();
      expect(overridden.overriddenById).toBe(admin.id);

      await reconcileDbAssignments(undefined, admin.id);
      const rerouted = await prisma.appointmentService.findUniqueOrThrow({
        where: { id: appointmentService.id },
      });
      expect(rerouted.status).toBe(AppointmentStatus.ASSIGNED);
      expect(rerouted.primaryStaffId).toBe(assignedStaffId);
    } finally {
      await cleanup(fixture);
      await restoreSeedAttendance();
    }
  });

  it('rejects concurrent accepts so exactly one tablet wins', async () => {
    const fixture: Fixture = { staffIds: [], appointmentIds: [], customerIds: [] };
    try {
      const station = await prisma.authUser.findFirstOrThrow({
        where: { role: 'STATION', isActive: true },
      });
      const { appointment, appointmentService } = await createAssignedAppointment(fixture);
      const staffId = appointmentService.primaryStaffId!;
      const results = await Promise.allSettled([
        staffActionDb(
          {
            action: 'ACCEPT',
            appointmentId: appointment.id,
            appointmentServiceId: appointmentService.id,
            staffId,
            idempotencyKey: uniqueLabel('accept-a'),
          },
          station.id,
          undefined,
          true,
        ),
        staffActionDb(
          {
            action: 'ACCEPT',
            appointmentId: appointment.id,
            appointmentServiceId: appointmentService.id,
            staffId,
            idempotencyKey: uniqueLabel('accept-b'),
          },
          station.id,
          undefined,
          true,
        ),
      ]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      const updated = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: { services: true },
      });
      expect(updated.status).toBe(AppointmentStatus.IN_SERVICE);
      expect(updated.services[0]?.status).toBe(AppointmentStatus.IN_SERVICE);
    } finally {
      await cleanup(fixture);
    }
  });

  it('blocks checkout while assigned and releases support atomically on primary finish', async () => {
    const fixture: Fixture = { staffIds: [], appointmentIds: [], customerIds: [] };
    try {
      const admin = await prisma.authUser.findFirstOrThrow({
        where: { role: 'ADMIN', isActive: true },
      });
      const station = await prisma.authUser.findFirstOrThrow({
        where: { role: 'STATION', isActive: true },
      });
      const first = await createAssignedAppointment(fixture, 2);
      const primaryStaffId = first.appointmentService.primaryStaffId!;
      const supportStaffId = fixture.staffIds.find((id) => id !== primaryStaffId)!;

      await expect(
        staffActionDb(
          { action: 'CHECK_OUT', staffId: primaryStaffId, idempotencyKey: uniqueLabel('checkout') },
          admin.id,
          undefined,
          true,
        ),
      ).rejects.toThrow('active turn');
      expect(
        (
          await prisma.attendance.findUnique({
            where: {
              staffId_businessDate: {
                staffId: primaryStaffId,
                businessDate: await currentDbBusinessDate(),
              },
            },
          })
        )?.status,
      ).toBe(AttendanceStatus.PRESENT);

      await staffActionDb(
        {
          action: 'ACCEPT',
          appointmentId: first.appointment.id,
          appointmentServiceId: first.appointmentService.id,
          staffId: primaryStaffId,
          idempotencyKey: uniqueLabel('accept'),
        },
        station.id,
        undefined,
        true,
      );
      await staffActionDb(
        {
          action: 'ADD_SUPPORT',
          appointmentId: first.appointment.id,
          appointmentServiceId: first.appointmentService.id,
          staffId: supportStaffId,
          idempotencyKey: uniqueLabel('support'),
        },
        station.id,
        undefined,
        true,
      );
      expect(
        (
          await prisma.appointmentSupportingStaff.findUnique({
            where: {
              appointmentId_staffId: {
                appointmentId: first.appointment.id,
                staffId: supportStaffId,
              },
            },
          })
        )?.releasedAt,
      ).toBeNull();

      await staffActionDb(
        {
          action: 'FINISH',
          appointmentId: first.appointment.id,
          appointmentServiceId: first.appointmentService.id,
          staffId: primaryStaffId,
          idempotencyKey: uniqueLabel('finish'),
        },
        station.id,
        undefined,
        true,
      );
      const participation = await prisma.appointmentSupportingStaff.findUniqueOrThrow({
        where: {
          appointmentId_staffId: { appointmentId: first.appointment.id, staffId: supportStaffId },
        },
      });
      expect(participation.releasedAt).not.toBeNull();
      expect(
        (await prisma.staffServiceState.findUniqueOrThrow({ where: { staffId: supportStaffId } }))
          .availability,
      ).toBe(Availability.AVAILABLE);
      expect(
        (await prisma.appointment.findUniqueOrThrow({ where: { id: first.appointment.id } }))
          .status,
      ).toBe(AppointmentStatus.PAYMENT_PENDING);
    } finally {
      await cleanup(fixture);
    }
  });

  it('cancels active work idempotently and releases the assigned technician', async () => {
    const fixture: Fixture = { staffIds: [], appointmentIds: [], customerIds: [] };
    try {
      const admin = await prisma.authUser.findFirstOrThrow({
        where: { role: 'ADMIN', isActive: true },
      });
      const { appointment, appointmentService } = await createAssignedAppointment(fixture);
      const key = uniqueLabel('cancel');
      const first = await cancelDbAppointment({
        appointmentId: appointment.id,
        appointmentServiceId: appointmentService.id,
        scope: 'SERVICE',
        reason: 'Customer cancelled before service',
        idempotencyKey: key,
        adminId: admin.id,
      });
      const second = await cancelDbAppointment({
        appointmentId: appointment.id,
        appointmentServiceId: appointmentService.id,
        scope: 'SERVICE',
        reason: 'Customer cancelled before service',
        idempotencyKey: key,
        adminId: admin.id,
      });
      expect(first.idempotent).toBe(false);
      expect(second.idempotent).toBe(true);
      const cancelled = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: { services: true, turns: true },
      });
      expect(cancelled.status).toBe(AppointmentStatus.CANCELLED);
      expect(cancelled.services[0]?.status).toBe(AppointmentStatus.CANCELLED);
      expect(cancelled.turns.some((turn) => turn.status === TurnStatus.SKIPPED)).toBe(true);
      expect(
        (
          await prisma.staffServiceState.findUniqueOrThrow({
            where: { staffId: appointmentService.primaryStaffId! },
          })
        ).availability,
      ).toBe(Availability.AVAILABLE);
    } finally {
      await cleanup(fixture);
    }
  });

  it('changes an active queue service transactionally and preserves the old snapshot', async () => {
    const fixture: Fixture = { staffIds: [], appointmentIds: [], customerIds: [] };
    try {
      const admin = await prisma.authUser.findFirstOrThrow({
        where: { role: 'ADMIN', isActive: true },
      });
      const manicure = await prisma.service.findUniqueOrThrow({
        where: { id: 'seed-basic-manicure' },
        include: { requiredSkills: true },
      });
      const gel = await prisma.service.findUniqueOrThrow({
        where: { id: 'seed-gel-manicure' },
        include: { requiredSkills: true },
      });
      const { appointment, appointmentService } = await createAssignedAppointment(fixture);
      const gelSkillId = gel.requiredSkills[0]?.skillId;
      if (!gelSkillId) throw new Error('Seed gel skill is missing');
      await createPresentStaff(fixture, gelSkillId, 'Gel workflow staff');
      const result = await changeDbAppointmentService({
        appointmentServiceId: appointmentService.id,
        serviceId: gel.id,
        reason: 'Customer changed requested finish',
        idempotencyKey: uniqueLabel('service-change'),
        adminId: admin.id,
      });
      expect(result.idempotent).toBe(false);
      const updated = await prisma.appointmentService.findUniqueOrThrow({
        where: { id: appointmentService.id },
      });
      expect(updated.serviceId).toBe(gel.id);
      expect(updated.serviceNameSnapshot).toBe(gel.name);
      expect(
        (
          await prisma.serviceChangeEvent.findFirstOrThrow({
            where: { appointmentServiceId: appointmentService.id },
            orderBy: { createdAt: 'desc' },
          })
        ).oldServiceId,
      ).toBe(manicure.id);
      expect(
        (
          await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })
        ).amount.toString(),
      ).toBe(gel.price.toString());
    } finally {
      await cleanup(fixture);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
