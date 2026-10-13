import argon2 from 'argon2';
import { AppointmentStatus, ActorType, AttendanceClosedBy, AttendanceStatus, AuthRole, Availability, PaymentMethod, PrismaClient, TurnEventType, TurnStatus } from '@prisma/client';
import { normalizePhoneNumber } from '../src/domain/phone';

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

function currentBusinessDate(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function formatBusinessDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseBusinessDate(value: string, name: string) {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) throw new Error(`${name} must use YYYY-MM-DD format`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== normalized) throw new Error(`${name} is not a valid calendar date`);
  return date;
}

function addBusinessDay(date: Date) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

function completedHistoricalDemo(demo: DemoAppointment, fallbackStaffName: string): DemoAppointment {
  if (demo.code === 'D105') return demo;
  return {
    ...demo,
    status: AppointmentStatus.COMPLETED,
    services: demo.services.map((service) => {
      const staffName = service.staffName ?? fallbackStaffName;
      const completedMinutesAgo = Math.max(1, service.completedMinutesAgo ?? service.minutesAgo - 60);
      return {
        ...service,
        status: AppointmentStatus.COMPLETED,
        staffName,
        completedMinutesAgo,
        turns: [{
          status: TurnStatus.FINISHED,
          staffName,
          reason: 'Service completed',
          minutesAgo: service.minutesAgo,
          endedMinutesAgo: completedMinutesAgo,
          events: [
            { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: service.minutesAgo },
            { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: staffName, reason: 'Assigned by skill and fair wait time', minutesAgo: Math.max(1, service.minutesAgo - 5) },
            { eventType: TurnEventType.ACCEPTED, actorType: ActorType.STAFF, actorName: staffName, assignedStaffName: staffName, reason: 'Specialist accepted the turn', minutesAgo: Math.max(1, service.minutesAgo - 15) },
            { eventType: TurnEventType.FINISHED, actorType: ActorType.STAFF, actorName: staffName, assignedStaffName: staffName, reason: 'Service completed', minutesAgo: completedMinutesAgo },
          ],
        }],
      };
    }),
  };
}

type DemoEvent = {
  eventType: TurnEventType;
  actorType: ActorType;
  actorName: string;
  assignedStaffName?: string;
  reason?: string;
  minutesAgo: number;
};

type DemoTurn = {
  status: TurnStatus;
  staffName?: string;
  reason?: string;
  skipReasonName?: string;
  minutesAgo: number;
  endedMinutesAgo?: number;
  events: DemoEvent[];
};

type DemoService = {
  name: string;
  status: AppointmentStatus;
  staffName?: string;
  minutesAgo: number;
  completedMinutesAgo?: number;
  cancelledMinutesAgo?: number;
  cancelledReason?: string;
  turns: DemoTurn[];
};

type DemoAppointment = {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  status: AppointmentStatus;
  minutesAgo: number;
  services: DemoService[];
};

async function seedDemoOperations(input: { adminId: string; businessDate: Date; referenceNow: Date; isCurrentDay: boolean }) {
  const businessDate = input.businessDate;
  const now = input.referenceNow;
  const minutesAgo = (value: number) => new Date(now.getTime() - value * 60_000);

  const baseDemos: DemoAppointment[] = [
    {
      id: 'seed-demo-appointment-101',
      code: 'D101',
      customerName: 'Emily Carter',
      phone: '+1 415 555 0101',
      status: AppointmentStatus.IN_SERVICE,
      minutesAgo: 55,
      services: [{
        name: 'Gel Manicure',
        status: AppointmentStatus.IN_SERVICE,
        staffName: 'Anna',
        minutesAgo: 50,
        turns: [
          {
            status: TurnStatus.SKIPPED,
            staffName: 'Tom',
            reason: 'Specialist became unavailable during the visit',
            minutesAgo: 50,
            endedMinutesAgo: 35,
            events: [
              { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: 50 },
              { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: 'Tom', reason: 'Assigned by skill and fair wait time', minutesAgo: 45 },
              { eventType: TurnEventType.SKIPPED, actorType: ActorType.ADMIN, actorName: 'Demo manager', assignedStaffName: 'Tom', reason: 'Specialist became unavailable during the visit', minutesAgo: 35 },
            ],
          },
          {
            status: TurnStatus.ACCEPTED,
            staffName: 'Anna',
            reason: 'Manager reassignment',
            minutesAgo: 30,
            events: [
              { eventType: TurnEventType.REASSIGNED, actorType: ActorType.ADMIN, actorName: 'Demo manager', assignedStaffName: 'Anna', reason: 'Reassigned after the original specialist became unavailable', minutesAgo: 30 },
              { eventType: TurnEventType.ACCEPTED, actorType: ActorType.STAFF, actorName: 'Anna', assignedStaffName: 'Anna', reason: 'Specialist accepted the turn', minutesAgo: 20 },
            ],
          },
        ],
      }],
    },
    {
      id: 'seed-demo-appointment-102',
      code: 'D102',
      customerName: 'Olivia Nguyen',
      phone: '+1 415 555 0102',
      status: AppointmentStatus.PAYMENT_PENDING,
      minutesAgo: 180,
      services: [{
        name: 'Deluxe Pedicure',
        status: AppointmentStatus.COMPLETED,
        staffName: 'Linda',
        minutesAgo: 170,
        completedMinutesAgo: 70,
        turns: [{
          status: TurnStatus.FINISHED,
          staffName: 'Linda',
          minutesAgo: 170,
          endedMinutesAgo: 70,
          events: [
            { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: 170 },
            { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: 'Linda', reason: 'Assigned by skill and fair wait time', minutesAgo: 165 },
            { eventType: TurnEventType.ACCEPTED, actorType: ActorType.STAFF, actorName: 'Linda', assignedStaffName: 'Linda', reason: 'Specialist accepted the turn', minutesAgo: 150 },
            { eventType: TurnEventType.FINISHED, actorType: ActorType.STAFF, actorName: 'Linda', assignedStaffName: 'Linda', reason: 'Service completed', minutesAgo: 70 },
          ],
        }],
      }],
    },
    {
      id: 'seed-demo-appointment-103',
      code: 'D103',
      customerName: 'Marcus Lee',
      phone: '+1 415 555 0103',
      status: AppointmentStatus.WAITING,
      minutesAgo: 12,
      services: [{
        name: 'Brazilian Waxing',
        status: AppointmentStatus.WAITING,
        minutesAgo: 12,
        turns: [{
          status: TurnStatus.ASSIGNED,
          reason: 'Waiting for an eligible waxing specialist',
          minutesAgo: 12,
          events: [
            { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible waxing specialist', minutesAgo: 12 },
          ],
        }],
      }],
    },
    {
      id: 'seed-demo-appointment-104',
      code: 'D104',
      customerName: 'Rachel Kim',
      phone: '+1 415 555 0104',
      status: AppointmentStatus.COMPLETED,
      minutesAgo: 360,
      services: [{
        name: 'Spa Mani & Pedi Package',
        status: AppointmentStatus.COMPLETED,
        staffName: 'Linda',
        minutesAgo: 350,
        completedMinutesAgo: 230,
        turns: [{
          status: TurnStatus.FINISHED,
          staffName: 'Linda',
          minutesAgo: 350,
          endedMinutesAgo: 230,
          events: [
            { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: 350 },
            { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: 'Linda', reason: 'Assigned by skill and fair wait time', minutesAgo: 345 },
            { eventType: TurnEventType.ACCEPTED, actorType: ActorType.STAFF, actorName: 'Linda', assignedStaffName: 'Linda', reason: 'Specialist accepted the turn', minutesAgo: 330 },
            { eventType: TurnEventType.FINISHED, actorType: ActorType.STAFF, actorName: 'Linda', assignedStaffName: 'Linda', reason: 'Package completed', minutesAgo: 230 },
          ],
        }],
      }],
    },
    {
      id: 'seed-demo-appointment-105',
      code: 'D105',
      customerName: 'Ava Wilson',
      phone: '+1 415 555 0105',
      status: AppointmentStatus.CANCELLED,
      minutesAgo: 240,
      services: [{
        name: 'Nail Art Design',
        status: AppointmentStatus.CANCELLED,
        staffName: 'Jenny',
        minutesAgo: 230,
        cancelledMinutesAgo: 200,
        cancelledReason: 'Customer not ready',
        turns: [{
          status: TurnStatus.SKIPPED,
          staffName: 'Jenny',
          reason: 'Customer not ready',
          skipReasonName: 'Customer not ready',
          minutesAgo: 230,
          endedMinutesAgo: 200,
          events: [
            { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: 230 },
            { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: 'Jenny', reason: 'Assigned by skill and fair wait time', minutesAgo: 225 },
            { eventType: TurnEventType.CANCELLED, actorType: ActorType.ADMIN, actorName: 'Demo manager', assignedStaffName: 'Jenny', reason: 'Customer not ready', minutesAgo: 200 },
          ],
        }],
      }],
    },
    {
      id: 'seed-demo-appointment-106',
      code: 'D106',
      customerName: 'Daniel Smith',
      phone: '+1 415 555 0106',
      status: AppointmentStatus.PAYMENT_PENDING,
      minutesAgo: 90,
      services: [
        {
          name: 'Gel Manicure',
          status: AppointmentStatus.COMPLETED,
          staffName: 'Anna',
          minutesAgo: 88,
          completedMinutesAgo: 40,
          turns: [{
            status: TurnStatus.FINISHED,
            staffName: 'Anna',
            minutesAgo: 88,
            endedMinutesAgo: 40,
            events: [
              { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: 88 },
              { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: 'Anna', reason: 'Assigned by skill and fair wait time', minutesAgo: 85 },
              { eventType: TurnEventType.ACCEPTED, actorType: ActorType.STAFF, actorName: 'Anna', assignedStaffName: 'Anna', reason: 'Specialist accepted the turn', minutesAgo: 75 },
              { eventType: TurnEventType.FINISHED, actorType: ActorType.STAFF, actorName: 'Anna', assignedStaffName: 'Anna', reason: 'Service completed', minutesAgo: 40 },
            ],
          }],
        },
        {
          name: 'Nail Art Design',
          status: AppointmentStatus.COMPLETED,
          staffName: 'Jenny',
          minutesAgo: 86,
          completedMinutesAgo: 35,
          turns: [{
            status: TurnStatus.FINISHED,
            staffName: 'Jenny',
            minutesAgo: 86,
            endedMinutesAgo: 35,
            events: [
              { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: 86 },
              { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: 'Jenny', reason: 'Assigned by skill and fair wait time', minutesAgo: 83 },
              { eventType: TurnEventType.ACCEPTED, actorType: ActorType.STAFF, actorName: 'Jenny', assignedStaffName: 'Jenny', reason: 'Specialist accepted the turn', minutesAgo: 70 },
              { eventType: TurnEventType.FINISHED, actorType: ActorType.STAFF, actorName: 'Jenny', assignedStaffName: 'Jenny', reason: 'Service completed', minutesAgo: 35 },
            ],
          }],
        },
      ],
    },
    {
      id: 'seed-demo-appointment-107',
      code: 'D107',
      customerName: 'Grace Miller',
      phone: '+1 415 555 0107',
      status: AppointmentStatus.ASSIGNED,
      minutesAgo: 25,
      services: [{
        name: 'Kids Manicure',
        status: AppointmentStatus.ASSIGNED,
        staffName: 'Sofia',
        minutesAgo: 25,
        turns: [{
          status: TurnStatus.ASSIGNED,
          staffName: 'Sofia',
          minutesAgo: 25,
          events: [
            { eventType: TurnEventType.WAITING, actorType: ActorType.SYSTEM, actorName: 'Fair routing', reason: 'Waiting for an eligible specialist', minutesAgo: 25 },
            { eventType: TurnEventType.ASSIGNED, actorType: ActorType.SYSTEM, actorName: 'Fair routing', assignedStaffName: 'Sofia', reason: 'Assigned by skill and fair wait time', minutesAgo: 20 },
          ],
        }],
      }],
    },
  ];

  const historicalStaffByCode: Record<string, string> = {
    D101: 'Anna',
    D102: 'Linda',
    D103: 'Tom',
    D104: 'Linda',
    D106: 'Anna',
    D107: 'Sofia',
  };
  const demos = baseDemos
    .map((demo) => input.isCurrentDay ? demo : completedHistoricalDemo(demo, historicalStaffByCode[demo.code] ?? 'Anna'))
    .map((demo) => ({ ...demo, id: `${demo.id}-${formatBusinessDate(businessDate)}` }));

  const serviceNames = [...new Set(demos.flatMap((demo) => demo.services.map((service) => service.name)))];
  const [serviceRows, staffRows, skipReasonRows] = await Promise.all([
    prisma.service.findMany({ where: { name: { in: serviceNames } }, select: { id: true, name: true, durationMin: true, price: true } }),
    prisma.staff.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.skipReason.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const servicesByName = new Map(serviceRows.map((service) => [service.name, service]));
  const staffByName = new Map(staffRows.map((staff) => [staff.name, staff]));
  const skipReasonsByName = new Map(skipReasonRows.map((reason) => [reason.name, reason]));

  for (const demo of demos) {
    const serviceInputs = demo.services.map((service) => {
      const row = servicesByName.get(service.name);
      if (!row) throw new Error('Missing service required by demo appointment: ' + service.name);
      return { input: service, row };
    });
    const customerPhoneNormalized = normalizePhoneNumber(demo.phone);
    const customer = await prisma.customer.upsert({
      where: { phoneNormalized: customerPhoneNormalized },
      update: { name: demo.customerName, phone: demo.phone, phoneNormalized: customerPhoneNormalized },
      create: { name: demo.customerName, phone: demo.phone, phoneNormalized: customerPhoneNormalized },
    });
    const firstService = serviceInputs[0];
    const firstStaff = firstService.input.staffName ? staffByName.get(firstService.input.staffName) : null;
    const totalAmount = serviceInputs.reduce((sum, service) => sum + Number(service.row.price), 0);
    const appointmentAmount = demo.status === AppointmentStatus.CANCELLED ? 0 : totalAmount;

    await prisma.payment.deleteMany({ where: { appointmentId: demo.id } });
    await prisma.turnEvent.deleteMany({ where: { appointmentId: demo.id } });
    await prisma.turn.deleteMany({ where: { appointmentId: demo.id } });
    await prisma.appointmentService.deleteMany({ where: { appointmentId: demo.id } });
    await prisma.appointmentSupportingStaff.deleteMany({ where: { appointmentId: demo.id } });

    const appointment = await prisma.appointment.upsert({
      where: { id: demo.id },
      update: {
        code: demo.code,
        customerId: customer.id,
        serviceId: firstService.row.id,
        serviceNameSnapshot: firstService.row.name,
        durationMinSnapshot: firstService.row.durationMin,
        status: demo.status,
        primaryStaffId: demo.status === AppointmentStatus.WAITING || demo.status === AppointmentStatus.CANCELLED ? null : firstStaff?.id ?? null,
        amount: appointmentAmount,
        businessDate,
        createdAt: minutesAgo(demo.minutesAgo),
        completedAt: demo.status === AppointmentStatus.COMPLETED ? minutesAgo(Math.max(1, demo.minutesAgo - 100)) : null,
        cancelledAt: demo.status === AppointmentStatus.CANCELLED ? minutesAgo(Math.max(1, demo.minutesAgo - 40)) : null,
        cancelledReason: demo.status === AppointmentStatus.CANCELLED ? demo.services[0].cancelledReason ?? 'Demo cancellation' : null,
        cancelledByType: demo.status === AppointmentStatus.CANCELLED ? ActorType.ADMIN : null,
        cancelledById: demo.status === AppointmentStatus.CANCELLED ? input.adminId : null,
      },
      create: {
        id: demo.id,
        code: demo.code,
        customerId: customer.id,
        serviceId: firstService.row.id,
        serviceNameSnapshot: firstService.row.name,
        durationMinSnapshot: firstService.row.durationMin,
        status: demo.status,
        primaryStaffId: demo.status === AppointmentStatus.WAITING || demo.status === AppointmentStatus.CANCELLED ? null : firstStaff?.id ?? null,
        amount: appointmentAmount,
        businessDate,
        createdAt: minutesAgo(demo.minutesAgo),
        completedAt: demo.status === AppointmentStatus.COMPLETED ? minutesAgo(Math.max(1, demo.minutesAgo - 100)) : null,
        cancelledAt: demo.status === AppointmentStatus.CANCELLED ? minutesAgo(Math.max(1, demo.minutesAgo - 40)) : null,
        cancelledReason: demo.status === AppointmentStatus.CANCELLED ? demo.services[0].cancelledReason ?? 'Demo cancellation' : null,
        cancelledByType: demo.status === AppointmentStatus.CANCELLED ? ActorType.ADMIN : null,
        cancelledById: demo.status === AppointmentStatus.CANCELLED ? input.adminId : null,
      },
    });

    for (const [serviceIndex, service] of serviceInputs.entries()) {
      const serviceStaff = service.input.staffName ? staffByName.get(service.input.staffName) : null;
      const appointmentServiceId = demo.id + '-service-' + String(serviceIndex + 1);
      const completedAt = service.input.status === AppointmentStatus.COMPLETED && service.input.completedMinutesAgo !== undefined ? minutesAgo(service.input.completedMinutesAgo) : null;
      const cancelledAt = service.input.status === AppointmentStatus.CANCELLED && service.input.cancelledMinutesAgo !== undefined ? minutesAgo(service.input.cancelledMinutesAgo) : null;
      const appointmentService = await prisma.appointmentService.create({
        data: {
          id: appointmentServiceId,
          appointmentId: appointment.id,
          serviceId: service.row.id,
          sequence: serviceIndex + 1,
          serviceNameSnapshot: service.row.name,
          durationMinSnapshot: service.row.durationMin,
          amount: service.row.price,
          status: service.input.status,
          primaryStaffId: service.input.status === AppointmentStatus.CANCELLED ? null : serviceStaff?.id ?? null,
          completedAt,
          cancelledAt,
          cancelledReason: service.input.cancelledReason ?? null,
          cancelledByType: service.input.status === AppointmentStatus.CANCELLED ? ActorType.ADMIN : null,
          cancelledById: service.input.status === AppointmentStatus.CANCELLED ? input.adminId : null,
        },
      });

      for (const [turnIndex, turnInput] of service.input.turns.entries()) {
        const turnStaff = turnInput.staffName ? staffByName.get(turnInput.staffName) : null;
        const skipReason = turnInput.skipReasonName ? skipReasonsByName.get(turnInput.skipReasonName) : null;
        const turnId = appointmentService.id + '-turn-' + String(turnIndex + 1);
        const turn = await prisma.turn.create({
          data: {
            id: turnId,
            appointmentId: appointment.id,
            appointmentServiceId: appointmentService.id,
            assignedStaffId: turnStaff?.id ?? null,
            status: turnInput.status,
            reason: turnInput.reason ?? null,
            skipReasonId: skipReason?.id ?? null,
            skipReasonNameSnapshot: skipReason?.name ?? turnInput.skipReasonName ?? null,
            createdAt: minutesAgo(turnInput.minutesAgo),
            endedAt: turnInput.endedMinutesAgo === undefined ? null : minutesAgo(turnInput.endedMinutesAgo),
          },
        });

        for (const [eventIndex, event] of turnInput.events.entries()) {
          const assignedStaff = event.assignedStaffName ? staffByName.get(event.assignedStaffName) : null;
          const actorId = event.actorType === ActorType.ADMIN
            ? input.adminId
            : event.actorType === ActorType.STAFF
              ? staffByName.get(event.actorName)?.id ?? null
              : null;
          await prisma.turnEvent.create({
            data: {
              id: turn.id + '-event-' + String(eventIndex + 1),
              appointmentId: appointment.id,
              appointmentServiceId: appointmentService.id,
              turnId: turn.id,
              eventType: event.eventType,
              assignedStaffId: assignedStaff?.id ?? null,
              assignedStaffNameSnapshot: assignedStaff?.name ?? event.assignedStaffName ?? null,
              actorType: event.actorType,
              actorId,
              actorNameSnapshot: event.actorName,
              reason: event.reason ?? null,
              createdAt: minutesAgo(event.minutesAgo),
            },
          });
        }
      }
    }

    if (demo.status === AppointmentStatus.COMPLETED) {
      const paymentId = demo.id + '-payment';
      const confirmedAt = minutesAgo(Math.max(1, demo.minutesAgo - 90));
      await prisma.payment.create({
        data: {
          id: paymentId,
          appointmentId: appointment.id,
          amount: totalAmount,
          tip: 15,
          method: PaymentMethod.CARD,
          serviceNameSnapshot: serviceInputs.map((service) => service.row.name).join(' + '),
          staffNameSnapshot: firstStaff?.name ?? null,
          confirmedByAdminId: input.adminId,
          confirmedAt,
        },
      });
      const createdServices = await prisma.appointmentService.findMany({ where: { appointmentId: appointment.id }, orderBy: { sequence: 'asc' }, select: { id: true, serviceNameSnapshot: true, amount: true, primaryStaffId: true } });
      for (const service of createdServices) {
        const serviceStaff = service.primaryStaffId ? staffRows.find((staff) => staff.id === service.primaryStaffId) : null;
        await prisma.paymentItem.create({
          data: {
            id: paymentId + '-item-' + service.id,
            paymentId,
            appointmentServiceId: service.id,
            serviceNameSnapshot: service.serviceNameSnapshot,
            staffNameSnapshot: serviceStaff?.name ?? null,
            amount: service.amount,
          },
        });
      }
    }
  }

  const attendance: Array<{ name: string; status: AttendanceStatus; checkInMinutesAgo?: number; checkOutMinutesAgo?: number }> = [
    { name: 'Anna', status: AttendanceStatus.PRESENT, checkInMinutesAgo: 360 },
    { name: 'Linda', status: AttendanceStatus.PRESENT, checkInMinutesAgo: 330 },
    { name: 'Jenny', status: AttendanceStatus.PRESENT, checkInMinutesAgo: 300 },
    { name: 'Tom', status: AttendanceStatus.CHECKED_OUT, checkInMinutesAgo: 300, checkOutMinutesAgo: 45 },
    { name: 'Mia', status: AttendanceStatus.ABSENT },
    { name: 'Sofia', status: AttendanceStatus.PRESENT, checkInMinutesAgo: 240 },
  ];
  for (const record of attendance) {
    const staff = staffByName.get(record.name);
    if (!staff) continue;
    await prisma.attendance.upsert({
      where: { staffId_businessDate: { staffId: staff.id, businessDate } },
      update: {
        status: record.status,
        checkInAt: record.checkInMinutesAgo === undefined ? null : minutesAgo(record.checkInMinutesAgo),
        checkOutAt: record.checkOutMinutesAgo === undefined ? null : minutesAgo(record.checkOutMinutesAgo),
        closedBy: record.status === AttendanceStatus.CHECKED_OUT ? AttendanceClosedBy.STAFF : null,
      },
      create: {
        staffId: staff.id,
        businessDate,
        status: record.status,
        checkInAt: record.checkInMinutesAgo === undefined ? null : minutesAgo(record.checkInMinutesAgo),
        checkOutAt: record.checkOutMinutesAgo === undefined ? null : minutesAgo(record.checkOutMinutesAgo),
        closedBy: record.status === AttendanceStatus.CHECKED_OUT ? AttendanceClosedBy.STAFF : null,
      },
    });
  }

  const busyStaffNames = new Set(['Anna', 'Sofia']);
  for (const staff of staffRows) {
    await prisma.staffServiceState.upsert({
      where: { staffId: staff.id },
      update: { availability: busyStaffNames.has(staff.name) ? Availability.BUSY : Availability.AVAILABLE, lastAssignedAt: busyStaffNames.has(staff.name) ? minutesAgo(20) : null },
      create: { staffId: staff.id, availability: busyStaffNames.has(staff.name) ? Availability.BUSY : Availability.AVAILABLE, lastAssignedAt: busyStaffNames.has(staff.name) ? minutesAgo(20) : null },
    });
  }
}

async function main() {
  const adminEmail = requiredEnv('ADMIN_EMAIL').toLowerCase();
  const adminPassword = requiredEnv('ADMIN_PASSWORD');
  const stationEmail = requiredEnv('STATION_EMAIL').toLowerCase();
  const stationPassword = requiredEnv('STATION_PASSWORD');
  const staffPin = requiredEnv('STAFF_DEFAULT_PIN');
  if (!/^\d{4}$/.test(staffPin)) throw new Error('STAFF_DEFAULT_PIN must be exactly four digits');

  const skillNames = [
    'Classic manicure',
    'Gel technique',
    'Pedicure',
    'Nail art',
    'Acrylic & extensions',
    'Dip powder',
    'Builder gel',
    'Waxing',
    'Nail care',
    'Spa treatment',
    'Kids services',
    'Service packages',
  ];
  const skills = Object.fromEntries(
    await Promise.all(
      skillNames.map(async (name) => [name, await prisma.skill.upsert({ where: { name }, update: {}, create: { name } })]),
    ),
  );

  const categories = [
    { id: 'category-manicure', name: 'Manicure', slug: 'manicure', sortOrder: 0 },
    { id: 'category-pedicure', name: 'Pedicure', slug: 'pedicure', sortOrder: 1 },
    { id: 'category-nail-enhancements', name: 'Nail Enhancements', slug: 'nail-enhancements', sortOrder: 2 },
    { id: 'category-nail-art-add-ons', name: 'Nail Art & Add-ons', slug: 'nail-art-add-ons', sortOrder: 3 },
    { id: 'category-waxing', name: 'Waxing', slug: 'waxing', sortOrder: 4 },
    { id: 'category-kids-services', name: 'Kids Services', slug: 'kids-services', sortOrder: 5 },
    { id: 'category-combos-packages', name: 'Combos & Packages', slug: 'combos-packages', sortOrder: 6 },
  ];

  for (const category of categories) {
    await prisma.serviceCategory.upsert({ where: { id: category.id }, update: { name: category.name, slug: category.slug, sortOrder: category.sortOrder, isActive: true }, create: { ...category, isActive: true } });
  }

  const services = [
    // Manicure
    { name: 'Basic Manicure', iconKey: 'hand', categoryId: 'category-manicure', durationMin: 30, price: 25, skills: ['Classic manicure'] },
    { name: 'Classic Manicure', iconKey: 'hand', categoryId: 'category-manicure', durationMin: 35, price: 30, skills: ['Classic manicure'] },
    { name: 'Gel Manicure', iconKey: 'sparkles', categoryId: 'category-manicure', durationMin: 60, price: 45, skills: ['Classic manicure', 'Gel technique'] },
    { name: 'Deluxe Manicure', iconKey: 'flower-2', categoryId: 'category-manicure', durationMin: 60, price: 50, skills: ['Classic manicure', 'Spa treatment'] },
    { name: 'Spa Manicure', iconKey: 'flower', categoryId: 'category-manicure', durationMin: 75, price: 60, skills: ['Classic manicure', 'Spa treatment'] },
    { name: 'French Manicure', iconKey: 'brush', categoryId: 'category-manicure', durationMin: 45, price: 40, skills: ['Classic manicure', 'Nail art'] },
    { name: 'Polish Change – Hands', iconKey: 'brush', categoryId: 'category-manicure', durationMin: 20, price: 15, skills: ['Classic manicure'] },
    { name: 'Gel Polish Change', iconKey: 'sparkles', categoryId: 'category-manicure', durationMin: 35, price: 30, skills: ['Gel technique'] },
    { name: 'Nail Strengthening Treatment', iconKey: 'shield-plus', categoryId: 'category-manicure', durationMin: 30, price: 25, skills: ['Nail care'] },
    { name: 'Paraffin Wax Treatment', iconKey: 'hand', categoryId: 'category-manicure', durationMin: 30, price: 20, skills: ['Nail care', 'Spa treatment'] },

    // Pedicure
    { name: 'Basic Pedicure', iconKey: 'footprints', categoryId: 'category-pedicure', durationMin: 45, price: 40, skills: ['Pedicure'] },
    { name: 'Pedicure', iconKey: 'flower-2', categoryId: 'category-pedicure', durationMin: 60, price: 45, skills: ['Pedicure'] },
    { name: 'Classic Pedicure', iconKey: 'footprints', categoryId: 'category-pedicure', durationMin: 55, price: 45, skills: ['Pedicure'] },
    { name: 'Gel Pedicure', iconKey: 'sparkles', categoryId: 'category-pedicure', durationMin: 75, price: 60, skills: ['Pedicure', 'Gel technique'] },
    { name: 'Deluxe Pedicure', iconKey: 'flower-2', categoryId: 'category-pedicure', durationMin: 75, price: 65, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Spa Pedicure', iconKey: 'flower', categoryId: 'category-pedicure', durationMin: 90, price: 75, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Jelly Pedicure', iconKey: 'waves', categoryId: 'category-pedicure', durationMin: 90, price: 80, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Volcano Pedicure', iconKey: 'spray-can', categoryId: 'category-pedicure', durationMin: 90, price: 85, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Hot Stone Pedicure', iconKey: 'sun', categoryId: 'category-pedicure', durationMin: 90, price: 80, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Collagen Pedicure', iconKey: 'heart', categoryId: 'category-pedicure', durationMin: 90, price: 85, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Pearl Pedicure', iconKey: 'gem', categoryId: 'category-pedicure', durationMin: 90, price: 85, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Milk & Honey Pedicure', iconKey: 'droplets', categoryId: 'category-pedicure', durationMin: 90, price: 80, skills: ['Pedicure', 'Spa treatment'] },
    { name: 'Polish Change – Toes', iconKey: 'brush', categoryId: 'category-pedicure', durationMin: 20, price: 18, skills: ['Pedicure'] },
    { name: 'Callus Removal', iconKey: 'footprints', categoryId: 'category-pedicure', durationMin: 20, price: 15, skills: ['Pedicure', 'Nail care'] },

    // Nail Enhancements
    { name: 'Acrylic Full Set', iconKey: 'hand', categoryId: 'category-nail-enhancements', durationMin: 90, price: 65, skills: ['Acrylic & extensions'] },
    { name: 'Acrylic Fill-In', iconKey: 'hand', categoryId: 'category-nail-enhancements', durationMin: 60, price: 45, skills: ['Acrylic & extensions'] },
    { name: 'Gel Full Set', iconKey: 'sparkles', categoryId: 'category-nail-enhancements', durationMin: 90, price: 70, skills: ['Gel technique', 'Acrylic & extensions'] },
    { name: 'Gel Fill-In', iconKey: 'sparkles', categoryId: 'category-nail-enhancements', durationMin: 60, price: 50, skills: ['Gel technique'] },
    { name: 'Dip Powder / SNS', iconKey: 'gem', categoryId: 'category-nail-enhancements', durationMin: 75, price: 55, skills: ['Dip powder'] },
    { name: 'Dip Powder with Tips', iconKey: 'gem', categoryId: 'category-nail-enhancements', durationMin: 90, price: 65, skills: ['Dip powder', 'Acrylic & extensions'] },
    { name: 'Builder Gel / BIAB', iconKey: 'shield-plus', categoryId: 'category-nail-enhancements', durationMin: 75, price: 60, skills: ['Builder gel'] },
    { name: 'Hard Gel Extensions', iconKey: 'sparkles', categoryId: 'category-nail-enhancements', durationMin: 120, price: 85, skills: ['Builder gel', 'Acrylic & extensions'] },
    { name: 'Gel-X Extensions', iconKey: 'sparkles', categoryId: 'category-nail-enhancements', durationMin: 120, price: 95, skills: ['Gel technique', 'Acrylic & extensions'] },
    { name: 'Ombre Full Set', iconKey: 'palette', categoryId: 'category-nail-enhancements', durationMin: 120, price: 90, skills: ['Acrylic & extensions', 'Nail art'] },
    { name: 'Pink & White Full Set', iconKey: 'hand', categoryId: 'category-nail-enhancements', durationMin: 135, price: 100, skills: ['Acrylic & extensions', 'Nail art'] },
    { name: 'Pink & White Fill-In', iconKey: 'hand', categoryId: 'category-nail-enhancements', durationMin: 90, price: 70, skills: ['Acrylic & extensions', 'Nail art'] },
    { name: 'Nail Tips Extension', iconKey: 'hand', categoryId: 'category-nail-enhancements', durationMin: 90, price: 65, skills: ['Acrylic & extensions'] },
    { name: 'Nail Repair', iconKey: 'bandage', categoryId: 'category-nail-enhancements', durationMin: 15, price: 10, skills: ['Nail care'] },
    { name: 'Nail Removal / Soak Off', iconKey: 'droplets', categoryId: 'category-nail-enhancements', durationMin: 30, price: 20, skills: ['Nail care'] },

    // Nail Art & Add-ons
    { name: 'Nail Art', iconKey: 'palette', categoryId: 'category-nail-art-add-ons', durationMin: 45, price: 30, skills: ['Nail art'] },
    { name: 'Nail Art Design', iconKey: 'palette', categoryId: 'category-nail-art-add-ons', durationMin: 30, price: 25, skills: ['Nail art'] },
    { name: 'French Tips', iconKey: 'brush', categoryId: 'category-nail-art-add-ons', durationMin: 20, price: 15, skills: ['Nail art'] },
    { name: 'Chrome Nails', iconKey: 'gem', categoryId: 'category-nail-art-add-ons', durationMin: 30, price: 20, skills: ['Nail art', 'Gel technique'] },
    { name: 'Cat Eye Nails', iconKey: 'eye', categoryId: 'category-nail-art-add-ons', durationMin: 30, price: 20, skills: ['Nail art', 'Gel technique'] },
    { name: 'Ombre Design', iconKey: 'palette', categoryId: 'category-nail-art-add-ons', durationMin: 45, price: 30, skills: ['Nail art'] },
    { name: 'Marble Nail Art', iconKey: 'palette', categoryId: 'category-nail-art-add-ons', durationMin: 45, price: 35, skills: ['Nail art'] },
    { name: 'Rhinestone Design', iconKey: 'gem', categoryId: 'category-nail-art-add-ons', durationMin: 30, price: 25, skills: ['Nail art'] },
    { name: '3D Nail Art', iconKey: 'star', categoryId: 'category-nail-art-add-ons', durationMin: 45, price: 35, skills: ['Nail art'] },
    { name: 'Matte Top Coat', iconKey: 'brush', categoryId: 'category-nail-art-add-ons', durationMin: 15, price: 10, skills: ['Nail art'] },
    { name: 'Nail Charms', iconKey: 'gem', categoryId: 'category-nail-art-add-ons', durationMin: 20, price: 15, skills: ['Nail art'] },
    { name: 'Extra Nail Length', iconKey: 'hand', categoryId: 'category-nail-art-add-ons', durationMin: 15, price: 10, skills: ['Acrylic & extensions'] },
    { name: 'Special Nail Shape', iconKey: 'wand-sparkles', categoryId: 'category-nail-art-add-ons', durationMin: 20, price: 15, skills: ['Acrylic & extensions', 'Nail art'] },
    { name: 'Gel Polish Upgrade', iconKey: 'sparkles', categoryId: 'category-nail-art-add-ons', durationMin: 15, price: 10, skills: ['Gel technique'] },

    // Waxing
    { name: 'Eyebrow Waxing', iconKey: 'eye', categoryId: 'category-waxing', durationMin: 20, price: 18, skills: ['Waxing'] },
    { name: 'Upper Lip Waxing', iconKey: 'smile', categoryId: 'category-waxing', durationMin: 15, price: 12, skills: ['Waxing'] },
    { name: 'Chin Waxing', iconKey: 'smile', categoryId: 'category-waxing', durationMin: 15, price: 12, skills: ['Waxing'] },
    { name: 'Full Face Waxing', iconKey: 'scan-heart', categoryId: 'category-waxing', durationMin: 45, price: 40, skills: ['Waxing'] },
    { name: 'Underarm Waxing', iconKey: 'hand', categoryId: 'category-waxing', durationMin: 25, price: 20, skills: ['Waxing'] },
    { name: 'Half Arm Waxing', iconKey: 'hand', categoryId: 'category-waxing', durationMin: 30, price: 25, skills: ['Waxing'] },
    { name: 'Full Arm Waxing', iconKey: 'hand', categoryId: 'category-waxing', durationMin: 45, price: 35, skills: ['Waxing'] },
    { name: 'Half Leg Waxing', iconKey: 'footprints', categoryId: 'category-waxing', durationMin: 45, price: 35, skills: ['Waxing'] },
    { name: 'Full Leg Waxing', iconKey: 'footprints', categoryId: 'category-waxing', durationMin: 60, price: 50, skills: ['Waxing'] },
    { name: 'Bikini Waxing', iconKey: 'heart', categoryId: 'category-waxing', durationMin: 35, price: 30, skills: ['Waxing'] },
    { name: 'Brazilian Waxing', iconKey: 'heart', categoryId: 'category-waxing', durationMin: 55, price: 45, skills: ['Waxing'] },
    { name: 'Back Waxing', iconKey: 'waves', categoryId: 'category-waxing', durationMin: 50, price: 40, skills: ['Waxing'] },

    // Kids Services
    { name: 'Kids Manicure', iconKey: 'baby', categoryId: 'category-kids-services', durationMin: 30, price: 20, skills: ['Kids services', 'Classic manicure'] },
    { name: 'Kids Pedicure', iconKey: 'baby', categoryId: 'category-kids-services', durationMin: 35, price: 25, skills: ['Kids services', 'Pedicure'] },
    { name: 'Kids Mani & Pedi Combo', iconKey: 'baby', categoryId: 'category-kids-services', durationMin: 60, price: 40, skills: ['Kids services', 'Classic manicure', 'Pedicure'] },
    { name: 'Kids Gel Polish', iconKey: 'sparkles', categoryId: 'category-kids-services', durationMin: 45, price: 30, skills: ['Kids services', 'Gel technique'] },
    { name: 'Kids Nail Art', iconKey: 'palette', categoryId: 'category-kids-services', durationMin: 30, price: 20, skills: ['Kids services', 'Nail art'] },

    // Combos & Packages
    { name: 'Manicure & Pedicure Combo', iconKey: 'heart', categoryId: 'category-combos-packages', durationMin: 105, price: 70, skills: ['Service packages', 'Classic manicure', 'Pedicure'] },
    { name: 'Gel Mani & Pedi Combo', iconKey: 'sparkles', categoryId: 'category-combos-packages', durationMin: 135, price: 95, skills: ['Service packages', 'Gel technique', 'Pedicure'] },
    { name: 'Deluxe Mani & Pedi', iconKey: 'flower-2', categoryId: 'category-combos-packages', durationMin: 150, price: 115, skills: ['Service packages', 'Classic manicure', 'Pedicure', 'Spa treatment'] },
    { name: 'Spa Mani & Pedi Package', iconKey: 'flower', categoryId: 'category-combos-packages', durationMin: 180, price: 135, skills: ['Service packages', 'Spa treatment', 'Pedicure'] },
    { name: 'Bridal Nail Package', iconKey: 'gem', categoryId: 'category-combos-packages', durationMin: 180, price: 150, skills: ['Service packages', 'Acrylic & extensions', 'Nail art'] },
    { name: 'Princess Package', iconKey: 'star', categoryId: 'category-combos-packages', durationMin: 90, price: 65, skills: ['Service packages', 'Kids services', 'Nail art'] },
  ];

  for (const service of services) {
    const seedId = `seed-${service.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    const existing = await prisma.service.findFirst({ where: { name: service.name }, select: { id: true } });
    const serviceId = existing?.id ?? seedId;
    const record = await prisma.service.upsert({
      where: { id: serviceId },
      update: { name: service.name, iconKey: service.iconKey, categoryId: service.categoryId, durationMin: service.durationMin, price: service.price, isActive: true },
      create: { id: serviceId, name: service.name, iconKey: service.iconKey, categoryId: service.categoryId, durationMin: service.durationMin, price: service.price },
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
    { name: 'Anna', initials: 'AN', skills: ['Classic manicure', 'Gel technique', 'Nail care', 'Builder gel'] },
    { name: 'Linda', initials: 'LI', skills: ['Pedicure', 'Classic manicure', 'Spa treatment', 'Nail care'] },
    { name: 'Jenny', initials: 'JE', skills: ['Nail art', 'Gel technique', 'Acrylic & extensions', 'Builder gel', 'Service packages'] },
    { name: 'Tom', initials: 'TO', skills: ['Pedicure', 'Waxing', 'Acrylic & extensions', 'Dip powder'] },
    { name: 'Mia', initials: 'MI', skills: ['Waxing', 'Nail care', 'Classic manicure', 'Kids services'] },
    { name: 'Sofia', initials: 'SO', skills: ['Kids services', 'Service packages', 'Spa treatment', 'Gel technique', 'Nail art'] },
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

  const adminUser = await prisma.authUser.upsert({
    where: { email: adminEmail },
    update: { passwordHash: await hashSecret(adminPassword), role: AuthRole.ADMIN, isActive: true },
    create: { email: adminEmail, passwordHash: await hashSecret(adminPassword), role: AuthRole.ADMIN },
  });
  await prisma.authUser.upsert({
    where: { email: stationEmail },
    update: { passwordHash: await hashSecret(stationPassword), role: AuthRole.STATION, isActive: true },
    create: { email: stationEmail, passwordHash: await hashSecret(stationPassword), role: AuthRole.STATION },
  });

  const shopTimezone = process.env.SHOP_TIMEZONE?.trim() || 'UTC';
  const shopConfig = await prisma.shopConfig.upsert({ where: { id: 1 }, update: {}, create: { id: 1, timezone: shopTimezone, openingTime: '09:00', closingTime: '21:00', verifiedSessionTtlMin: 3, currency: 'USD', roundRobinEnabled: true } });
  const today = currentBusinessDate(shopConfig.timezone);
  const seedStartDate = parseBusinessDate(process.env.DEMO_START_DATE?.trim() || formatBusinessDate(today), 'DEMO_START_DATE');
  const seedEndDate = parseBusinessDate(process.env.DEMO_END_DATE?.trim() || formatBusinessDate(today), 'DEMO_END_DATE');
  if (seedStartDate > seedEndDate) throw new Error('DEMO_START_DATE must be on or before DEMO_END_DATE');
  const existingAppointmentCount = await prisma.appointment.count();
  const forceDemoSeed = process.env.SEED_FORCE === 'true';
  if (forceDemoSeed || existingAppointmentCount === 0) {
    for (let businessDate = seedStartDate; businessDate <= seedEndDate; businessDate = addBusinessDay(businessDate)) {
      const isCurrentDay = businessDate.getTime() === today.getTime();
      const referenceNow = isCurrentDay ? new Date() : new Date(businessDate.getTime() + 10 * 60 * 60 * 1000);
      await seedDemoOperations({ adminId: adminUser.id, businessDate, referenceNow, isCurrentDay });
    }
    console.info(`Seeded demo operations from ${formatBusinessDate(seedStartDate)} through ${formatBusinessDate(seedEndDate)}.`);
  } else {
    console.info(`Preserving ${existingAppointmentCount} existing appointment(s); skipping demo operational seed.`);
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error instanceof Error ? error.message : 'unknown error');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
