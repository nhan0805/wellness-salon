// Disposable benchmark fixture only. Run against an isolated database; this is not an application seed.
import { AppointmentStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const benchmarkDate = process.env.SCALE_DATE ?? new Date().toISOString().slice(0, 10);
const currentDate = new Date(`${benchmarkDate}T00:00:00.000Z`);
const totalHistorical = Number(process.env.SCALE_HISTORICAL ?? 18000);
const totalToday = Number(process.env.SCALE_TODAY ?? 2000);

function dateAtUtcDay(offset: number) {
  const value = new Date(currentDate);
  value.setUTCDate(value.getUTCDate() - offset);
  return value;
}

async function main() {
  const service = await prisma.service.findUniqueOrThrow({ where: { id: 'seed-basic-manicure' } });
  const customers = Array.from({ length: totalHistorical + totalToday }, (_, index) => ({
    id: `scale-customer-${index}`,
    phone: `+1 415 777 ${String(index).padStart(7, '0')}`,
    phoneNormalized: `1415777${String(index).padStart(7, '0')}`,
    name: `Scale Guest ${index}`,
  }));
  await prisma.customer.createMany({ data: customers });

  const appointments: Array<{
    id: string;
    code: string;
    customerId: string;
    serviceId: string;
    serviceNameSnapshot: string;
    durationMinSnapshot: number;
    status: AppointmentStatus;
    amount: number;
    businessDate: Date;
    primaryStaffId?: string;
  }> = [];
  const services: Array<{
    id: string;
    appointmentId: string;
    serviceId: string;
    sequence: number;
    serviceNameSnapshot: string;
    durationMinSnapshot: number;
    amount: number;
    status: AppointmentStatus;
    primaryStaffId?: string;
  }> = [];
  const turns: Array<{
    id: string;
    appointmentId: string;
    appointmentServiceId: string;
    assignedStaffId?: string;
    status: 'ASSIGNED';
  }> = [];

  let index = 0;
  for (let offset = 1; offset <= 30; offset += 1) {
    const count = Math.floor(totalHistorical / 30) + (offset <= totalHistorical % 30 ? 1 : 0);
    for (let row = 0; row < count; row += 1) {
      const appointmentId = `scale-appointment-${index}`;
      const serviceId = `scale-appointment-service-${index}`;
      const date = dateAtUtcDay(offset);
      appointments.push({ id: appointmentId, code: `H${String(index).padStart(5, '0')}`, customerId: customers[index].id, serviceId: service.id, serviceNameSnapshot: service.name, durationMinSnapshot: service.durationMin, status: AppointmentStatus.COMPLETED, amount: Number(service.price), businessDate: date, primaryStaffId: 'seed-staff-anna' });
      services.push({ id: serviceId, appointmentId, serviceId: service.id, sequence: 1, serviceNameSnapshot: service.name, durationMinSnapshot: service.durationMin, amount: Number(service.price), status: AppointmentStatus.COMPLETED, primaryStaffId: 'seed-staff-anna' });
      index += 1;
    }
  }

  for (let row = 0; row < totalToday; row += 1) {
    const appointmentId = `scale-appointment-${index}`;
    const serviceId = `scale-appointment-service-${index}`;
    const status = row < Math.floor(totalToday * 0.85) ? AppointmentStatus.WAITING : AppointmentStatus.ASSIGNED;
    const primaryStaffId = status === AppointmentStatus.ASSIGNED ? (row % 2 === 0 ? 'seed-staff-anna' : 'seed-staff-jenny') : undefined;
    appointments.push({ id: appointmentId, code: `T${String(row).padStart(5, '0')}`, customerId: customers[index].id, serviceId: service.id, serviceNameSnapshot: service.name, durationMinSnapshot: service.durationMin, status, amount: Number(service.price), businessDate: currentDate, primaryStaffId });
    services.push({ id: serviceId, appointmentId, serviceId: service.id, sequence: 1, serviceNameSnapshot: service.name, durationMinSnapshot: service.durationMin, amount: Number(service.price), status, primaryStaffId });
    if (status === AppointmentStatus.ASSIGNED) turns.push({ id: `scale-turn-${row}`, appointmentId, appointmentServiceId: serviceId, assignedStaffId: primaryStaffId, status: 'ASSIGNED' });
    index += 1;
  }

  await prisma.appointment.createMany({ data: appointments });
  await prisma.appointmentService.createMany({ data: services });
  if (turns.length) await prisma.turn.createMany({ data: turns });
  console.log(JSON.stringify({ fixture: true, historical: totalHistorical, today: totalToday, appointments: appointments.length, services: services.length, turns: turns.length }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
