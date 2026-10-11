import { afterAll, describe, expect, it } from 'vitest';
import { Availability } from '@prisma/client';
import { prisma } from '@/src/server/db';
import { createDbCheckIn, currentDbBusinessDate, getDbAppointmentsPage } from '@/src/server/services/prisma-operations';

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

  it('returns bounded appointment history pages with period summaries', async () => {
    const marker = Date.now();
    const service = await prisma.service.findFirstOrThrow({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const createdPhones: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const phone = `+1 415 555 ${String(marker).slice(-3)}${index}`;
      createdPhones.push(phone);
      await createDbCheckIn({ serviceId: service.id, phone, name: `Pagination Guest ${index}`, idempotencyKey: `integration-pagination-${marker}-${index}` });
    }

    const businessDate = await currentDbBusinessDate();
    const firstPage = await getDbAppointmentsPage({ start: businessDate, end: new Date(businessDate.getTime() + 24 * 60 * 60 * 1000) }, 1, 1);
    const secondPage = await getDbAppointmentsPage({ start: businessDate, end: new Date(businessDate.getTime() + 24 * 60 * 60 * 1000) }, 2, 1);
    expect(firstPage.pageSize).toBe(1);
    expect(firstPage.appointments).toHaveLength(1);
    expect(firstPage.total).toBeGreaterThanOrEqual(3);
    expect(firstPage.totalPages).toBeGreaterThanOrEqual(3);
    expect(firstPage.totalRevenue).toBeGreaterThan(0);
    expect(firstPage.totalDuration).toBeGreaterThan(0);
    expect(secondPage.appointments).toHaveLength(1);
    expect(secondPage.appointments[0]?.id).not.toBe(firstPage.appointments[0]?.id);

    const filteredPage = await getDbAppointmentsPage({ start: businessDate, end: new Date(businessDate.getTime() + 24 * 60 * 60 * 1000), search: 'Pagination Guest 1', serviceCount: 'SINGLE', sort: 'DURATION_DESC' }, 1, 10);
    expect(filteredPage.total).toBe(1);
    expect(filteredPage.appointments[0]?.customerName).toBe('Pagination Guest 1');

    const customers = await prisma.customer.findMany({ where: { phone: { in: createdPhones } }, select: { id: true } });
    await prisma.appointment.deleteMany({ where: { customerId: { in: customers.map((customer) => customer.id) } } });
    await prisma.commandReceipt.deleteMany({ where: { key: { startsWith: `integration-pagination-${marker}-` } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers.map((customer) => customer.id) } } });
    await prisma.staffServiceState.updateMany({ data: { availability: Availability.AVAILABLE } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
