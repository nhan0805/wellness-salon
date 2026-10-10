import { afterAll, describe, expect, it } from 'vitest';
import { AppointmentStatus, Availability } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { createDbCheckIn } from '@/src/server/services/prisma-operations';

const enabled = process.env.RUN_DB_TESTS === 'true' && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)('PostgreSQL migration and seed', () => {
  it('reads the migrated schema, seeded catalog, and advisory-lock capability', async () => {
    const [skillCount, serviceCount, staffCount, authUserCount] = await Promise.all([
      prisma.skill.count(),
      prisma.service.count(),
      prisma.staff.count(),
      prisma.authUser.count(),
    ]);
    expect(skillCount).toBeGreaterThanOrEqual(4);
    expect(serviceCount).toBeGreaterThanOrEqual(4);
    expect(staffCount).toBeGreaterThanOrEqual(4);
    expect(authUserCount).toBeGreaterThanOrEqual(2);

    const lockResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('integration-test', 0))`;
      return tx.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;
    });
    expect(lockResult[0]?.value).toBe(1);
  });

  it('serializes concurrent kiosk submissions for one phone into one appointment', async () => {
    const phone = '+1 415 555 ' + String(Date.now()).slice(-4);
    const service = await prisma.service.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const results = await Promise.all([
      createDbCheckIn({ serviceId: service.id, phone, name: 'Concurrent Guest' }),
      createDbCheckIn({ serviceId: service.id, phone, name: 'Concurrent Guest' }),
    ]);
    expect(results[0].appointmentId).toBe(results[1].appointmentId);
    expect(await prisma.appointment.count({ where: { id: results[0].appointmentId } })).toBe(1);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: results[0].appointmentId }, select: { primaryStaffId: true } });
    await prisma.appointment.delete({ where: { id: results[0].appointmentId } });
    await prisma.customer.delete({ where: { id: customer.id } });
    if (appointment.primaryStaffId) {
      const activeAssignmentCount = await prisma.appointment.count({ where: { primaryStaffId: appointment.primaryStaffId, status: { in: [AppointmentStatus.ASSIGNED, AppointmentStatus.IN_SERVICE] } } });
      if (!activeAssignmentCount) await prisma.staffServiceState.update({ where: { staffId: appointment.primaryStaffId }, data: { availability: Availability.AVAILABLE } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
