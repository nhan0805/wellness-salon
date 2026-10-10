import { afterAll, describe, expect, it } from 'vitest';
import { Availability } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { createDbCheckIn } from '@/src/server/services/prisma-operations';

const enabled = process.env.RUN_DB_TESTS === 'true' && Boolean(process.env.TEST_DATABASE_URL) && process.env.TEST_DATABASE_URL !== process.env.APPLICATION_DATABASE_URL;

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

  it('keeps retries idempotent while preserving distinct explicit same-day visits', async () => {
    const phone = '+1 415 555 ' + String(Date.now()).slice(-4);
    const service = await prisma.service.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const retryKey = `integration-retry-${Date.now()}`;
    const results = await Promise.all([
      createDbCheckIn({ serviceId: service.id, phone, name: 'Concurrent Guest', idempotencyKey: retryKey }),
      createDbCheckIn({ serviceId: service.id, phone, name: 'Concurrent Guest', idempotencyKey: retryKey }),
    ]);
    expect(results[0].appointmentId).toBe(results[1].appointmentId);
    expect(await prisma.appointment.count({ where: { id: results[0].appointmentId } })).toBe(1);
    const explicitResults = await Promise.all([
      createDbCheckIn({ serviceId: service.id, phone, name: 'Concurrent Guest', idempotencyKey: `integration-explicit-a-${Date.now()}` }),
      createDbCheckIn({ serviceId: service.id, phone, name: 'Concurrent Guest', idempotencyKey: `integration-explicit-b-${Date.now()}` }),
    ]);
    expect(explicitResults[0].appointmentId).not.toBe(explicitResults[1].appointmentId);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { phone } });
    await prisma.appointment.deleteMany({ where: { customerId: customer.id } });
    await prisma.commandReceipt.deleteMany({ where: { key: { startsWith: 'integration-' } } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.staffServiceState.updateMany({ data: { availability: Availability.AVAILABLE } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
