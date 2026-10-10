import { AppointmentStatus, PrismaClient, PaymentMethod, TurnStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding KPIs...');

  const today = new Date();

  // Get some existing data to link to
  const staff = await prisma.staff.findFirst();
  const service = await prisma.service.findFirst();

  if (!staff || !service) {
    console.error('Required seed data (staff or service) not found. Please run db:seed first.');
    return;
  }

  const customers = ['Alice Smith', 'Bob Johnson', 'Charlie Brown', 'Diana Prince'];
  const amounts = [45.00, 120.00, 30.00, 65.00];
  const methods: PaymentMethod[] = [PaymentMethod.CARD, PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.CARD];

  for (let i = 0; i < customers.length; i++) {
    const phone = `090${1000000 + i}`;
    const customer = await prisma.customer.upsert({
      where: { phone },
      update: { name: customers[i] },
      create: { name: customers[i], phone, phoneNormalized: phone.replace(/\D/g, '') },
    });

    await prisma.appointment.create({
      data: {
        code: `S${100 + i}`,
        customerId: customer.id,
        serviceId: service.id,
        serviceNameSnapshot: service.name,
        durationMinSnapshot: service.durationMin,
        businessDate: today,
        completedAt: today,
        amount: amounts[i],
        status: AppointmentStatus.COMPLETED,
        primaryStaffId: staff.id,
        payment: {
          create: {
            amount: amounts[i],
            method: methods[i],
            serviceNameSnapshot: service.name,
            staffNameSnapshot: staff.name,
            confirmedAt: today,
          },
        },
        turns: {
          create: { status: TurnStatus.FINISHED, reason: null, endedAt: today },
        },
      },
    });
    console.log(`Created completed appointment for ${customers[i]}`);
  }

  console.log('KPI seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
