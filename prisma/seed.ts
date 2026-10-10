import argon2 from 'argon2';
import { PrismaClient, AuthRole } from '@prisma/client';

const prisma = new PrismaClient();

const hashSecret = (secret: string) =>
  argon2.hash(secret, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required before seeding the database`);
  return value;
}

async function main() {
  const adminEmail = requiredEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = requiredEnv('ADMIN_PASSWORD');
  const stationEmail = requiredEnv('STATION_EMAIL').toLowerCase();
  const stationPassword = requiredEnv('STATION_PASSWORD');
  const staffPin = requiredEnv('STAFF_DEFAULT_PIN');
  if (!/^\d{4}$/.test(staffPin)) throw new Error('STAFF_DEFAULT_PIN must be exactly four digits');

  const skillNames = ['Classic manicure', 'Gel technique', 'Pedicure', 'Nail art'];
  const skills = Object.fromEntries(
    await Promise.all(
      skillNames.map(async (name) => [name, await prisma.skill.upsert({ where: { name }, update: {}, create: { name } })]),
    ),
  );

  const services = [
    { name: 'Basic Manicure', iconKey: 'hand', durationMin: 30, price: 20, skills: ['Classic manicure'] },
    { name: 'Gel Manicure', iconKey: 'sparkles', durationMin: 60, price: 35, skills: ['Gel technique'] },
    { name: 'Pedicure', iconKey: 'flower-2', durationMin: 60, price: 40, skills: ['Pedicure'] },
    { name: 'Nail Art', iconKey: 'palette', durationMin: 45, price: 30, skills: ['Nail art'] },
  ];

  for (const service of services) {
    const record = await prisma.service.upsert({
      where: { id: `seed-${service.name.toLowerCase().replaceAll(' ', '-')}` },
      update: { name: service.name, iconKey: service.iconKey, durationMin: service.durationMin, price: service.price, isActive: true },
      create: { id: `seed-${service.name.toLowerCase().replaceAll(' ', '-')}`, name: service.name, iconKey: service.iconKey, durationMin: service.durationMin, price: service.price },
    });
    await prisma.serviceSkill.deleteMany({ where: { serviceId: record.id } });
    await prisma.serviceSkill.createMany({ data: service.skills.map((skill) => ({ serviceId: record.id, skillId: skills[skill].id })) });
  }

  const skipReasons = ['Customer not ready', 'Customer requested a break', 'Service requires another specialist', 'Other'];
  for (const [sortOrder, name] of skipReasons.entries()) {
    await prisma.skipReason.upsert({
      where: { name },
      update: { sortOrder, isActive: true },
      create: { name, sortOrder, isActive: true },
    });
  }

  const pinHash = await hashSecret(staffPin);
  const staff = [
    { name: 'Anna', initials: 'AN', skills: ['Classic manicure', 'Gel technique'] },
    { name: 'Linda', initials: 'LI', skills: ['Pedicure', 'Classic manicure'] },
    { name: 'Jenny', initials: 'JE', skills: ['Nail art', 'Gel technique'] },
    { name: 'Tom', initials: 'TO', skills: ['Pedicure', 'Nail art'] },
  ];

  for (const person of staff) {
    const record = await prisma.staff.upsert({
      where: { id: `seed-staff-${person.name.toLowerCase()}` },
      update: { name: person.name, initials: person.initials, pinHash, isActive: true },
      create: { id: `seed-staff-${person.name.toLowerCase()}`, name: person.name, initials: person.initials, pinHash },
    });
    await prisma.staffServiceState.upsert({ where: { staffId: record.id }, update: {}, create: { staffId: record.id } });
    for (const skill of person.skills) {
      await prisma.staffSkill.upsert({ where: { staffId_skillId: { staffId: record.id, skillId: skills[skill].id } }, update: {}, create: { staffId: record.id, skillId: skills[skill].id } });
    }
  }

  await prisma.authUser.upsert({
    where: { email: adminEmail },
    update: { passwordHash: await hashSecret(adminPassword), role: AuthRole.ADMIN, isActive: true },
    create: { email: adminEmail, passwordHash: await hashSecret(adminPassword), role: AuthRole.ADMIN },
  });
  await prisma.authUser.upsert({
    where: { email: stationEmail },
    update: { passwordHash: await hashSecret(stationPassword), role: AuthRole.STATION, isActive: true },
    create: { email: stationEmail, passwordHash: await hashSecret(stationPassword), role: AuthRole.STATION },
  });

  await prisma.shopConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1, timezone: 'Asia/Ho_Chi_Minh', openingTime: '09:00', closingTime: '21:00', verifiedSessionTtlMin: 3, currency: 'USD', roundRobinEnabled: true } });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
