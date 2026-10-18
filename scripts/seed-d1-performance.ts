import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type ServiceFixture = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
};

type StaffFixture = {
  id: string;
  name: string;
};

const TOTAL_APPOINTMENTS = Number(process.env.PERF_APPOINTMENTS ?? '10000');
const CUSTOMER_COUNT = Math.min(Math.max(Math.ceil(TOTAL_APPOINTMENTS * 0.4), 1000), TOTAL_APPOINTMENTS);
const OUTPUT_PATH = process.env.PERF_SQL_OUT?.trim() || join(tmpdir(), 'wellness-salon-performance-2026.sql');
const START_MS = Date.UTC(2026, 0, 1);
const END_MS = Date.UTC(2026, 9, 31);
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const TOTAL_DAYS = Math.floor((END_MS - START_MS) / DAY_MS) + 1;

const services: ServiceFixture[] = [
  { id: 'service-basic-manicure', name: 'Basic Manicure', durationMin: 30, price: 25 },
  { id: 'service-classic-manicure', name: 'Classic Manicure', durationMin: 35, price: 30 },
  { id: 'service-gel-manicure', name: 'Gel Manicure', durationMin: 60, price: 45 },
  { id: 'service-basic-pedicure', name: 'Basic Pedicure', durationMin: 45, price: 40 },
  { id: 'service-gel-pedicure', name: 'Gel Pedicure', durationMin: 75, price: 60 },
  { id: 'service-deluxe-pedicure', name: 'Deluxe Pedicure', durationMin: 75, price: 65 },
  { id: 'service-acrylic-full-set', name: 'Acrylic Full Set', durationMin: 90, price: 65 },
  { id: 'service-gel-full-set', name: 'Gel Full Set', durationMin: 90, price: 70 },
  { id: 'service-nail-art', name: 'Nail Art', durationMin: 45, price: 30 },
  { id: 'service-brazilian-waxing', name: 'Brazilian Waxing', durationMin: 55, price: 45 },
  { id: 'service-kids-manicure', name: 'Kids Manicure', durationMin: 30, price: 20 },
  { id: 'service-manicure-pedicure-combo', name: 'Manicure & Pedicure Combo', durationMin: 105, price: 70 },
];

const staff: StaffFixture[] = [
  { id: 'staff-anna', name: 'Anna' },
  { id: 'staff-linda', name: 'Linda' },
  { id: 'staff-jenny', name: 'Jenny' },
  { id: 'staff-tom', name: 'Tom' },
  { id: 'staff-mia', name: 'Mia' },
  { id: 'staff-sofia', name: 'Sofia' },
];

type FixtureStatus = 'COMPLETED' | 'PAYMENT_PENDING' | 'CANCELLED' | 'WAITING' | 'ASSIGNED' | 'IN_SERVICE';

function sql(value: string | number | boolean | null) {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${value.replaceAll("'", "''")}'`;
}

function iso(date: Date) {
  return date.toISOString().replace('Z', '+00:00');
}

function money(value: number) {
  return value.toFixed(2);
}

function dateForIndex(index: number) {
  // 37 is coprime with the 304-day range, so the fixture is spread across
  // every day instead of clustering at the beginning of each month.
  const dayIndex = (index * 37) % TOTAL_DAYS;
  return new Date(START_MS + dayIndex * DAY_MS);
}

function statusForIndex(index: number): FixtureStatus {
  const bucket = index % 100;
  if (bucket < 55) return 'COMPLETED';
  if (bucket < 65) return 'PAYMENT_PENDING';
  if (bucket < 75) return 'CANCELLED';
  if (bucket < 85) return 'WAITING';
  if (bucket < 95) return 'ASSIGNED';
  return 'IN_SERVICE';
}

function serviceCountForIndex(index: number) {
  if (index % 20 === 0) return 3;
  if (index % 5 === 0) return 2;
  return 1;
}

function assignedStaffFor(status: FixtureStatus, index: number, serviceIndex: number) {
  if (status === 'WAITING') return null;
  if (status === 'CANCELLED' && index % 4 !== 0) return null;
  return staff[(index + serviceIndex) % staff.length];
}

function turnFor(status: FixtureStatus, assignedStaff: StaffFixture | null) {
  if (status === 'COMPLETED' || status === 'PAYMENT_PENDING') {
    return { status: 'FINISHED', eventType: 'FINISHED', reason: null } as const;
  }
  if (status === 'CANCELLED') {
    return { status: 'SKIPPED', eventType: 'CANCELLED', reason: 'Performance fixture: cancelled visit' } as const;
  }
  if (status === 'IN_SERVICE' && assignedStaff) {
    return { status: 'ACCEPTED', eventType: 'ACCEPTED', reason: null } as const;
  }
  if (!assignedStaff) {
    return { status: 'ASSIGNED', eventType: 'WAITING', reason: 'Waiting for eligible staff' } as const;
  }
  return { status: 'ASSIGNED', eventType: 'ASSIGNED', reason: null } as const;
}

function addAttendance(statements: string[], now: string) {
  for (let dayIndex = 0; dayIndex < TOTAL_DAYS; dayIndex += 1) {
    const businessDate = new Date(START_MS + dayIndex * DAY_MS);
    const businessDateValue = iso(businessDate);
    const isCurrentDemoDay = businessDate.toISOString().slice(0, 10) === '2026-10-16';
    for (const member of staff) {
      const attendanceId = `perf-attendance-${businessDate.toISOString().slice(0, 10)}-${member.id}`;
      const checkInAt = new Date(businessDate.getTime() + 8 * 60 * MINUTE_MS);
      const checkOutAt = isCurrentDemoDay ? null : new Date(businessDate.getTime() + 18 * 60 * MINUTE_MS);
      statements.push(
        `INSERT OR IGNORE INTO attendance (id, staff_id, business_date, check_in_at, check_out_at, status, closed_by) VALUES (${sql(attendanceId)}, ${sql(member.id)}, ${sql(businessDateValue)}, ${sql(iso(checkInAt))}, ${sql(checkOutAt ? iso(checkOutAt) : null)}, ${sql(isCurrentDemoDay ? 'PRESENT' : 'CHECKED_OUT')}, ${sql(isCurrentDemoDay ? null : 'STAFF')})`,
      );
    }
  }
  statements.push(
    `UPDATE shop_config SET state_version = state_version + 1, updated_at = ${sql(now)} WHERE id = 1`,
  );
}

function addFixture(statements: string[], index: number) {
  const sequence = index + 1;
  const appointmentId = `perf-appointment-${String(sequence).padStart(5, '0')}`;
  const code = `PERF-2026-${String(sequence).padStart(5, '0')}`;
  const customerSequence = (index % CUSTOMER_COUNT) + 1;
  const customerId = `perf-customer-${String(customerSequence).padStart(5, '0')}`;
  const businessDate = dateForIndex(index);
  const status = statusForIndex(index);
  const serviceCount = serviceCountForIndex(index);
  const startMinute = 9 * 60 + ((index * 29) % (10 * 60));
  const createdAt = new Date(businessDate.getTime() + startMinute * MINUTE_MS);
  const selectedServices = Array.from({ length: serviceCount }, (_, serviceIndex) => services[(index + serviceIndex * 3) % services.length]);
  const staffForServices = selectedServices.map((_, serviceIndex) => assignedStaffFor(status, index, serviceIndex));
  const totalAmount = selectedServices.reduce((total, item) => total + item.price, 0);
  const appointmentStaff = staffForServices[0];
  let elapsedMinutes = 0;
  const childStatements: string[] = [];
  const serviceRows = selectedServices.map((service, serviceIndex) => {
    const assignedStaff = staffForServices[serviceIndex];
    const serviceCreatedAt = new Date(createdAt.getTime() + elapsedMinutes * MINUTE_MS);
    elapsedMinutes += service.durationMin;
    const serviceCompletedAt = status === 'COMPLETED' || status === 'PAYMENT_PENDING'
      ? new Date(serviceCreatedAt.getTime() + service.durationMin * MINUTE_MS)
      : null;
    const serviceCancelledAt = status === 'CANCELLED'
      ? new Date(serviceCreatedAt.getTime() + 15 * MINUTE_MS)
      : null;
    const appointmentServiceId = `perf-appointment-service-${String(sequence).padStart(5, '0')}-${serviceIndex + 1}`;
    const turnId = `perf-turn-${String(sequence).padStart(5, '0')}-${serviceIndex + 1}`;
    const turn = turnFor(status, assignedStaff);
    const turnEndedAt = serviceCompletedAt ?? serviceCancelledAt;
    const serviceStatus = status === 'PAYMENT_PENDING' ? 'COMPLETED' : status;
    const cancelledReason = status === 'CANCELLED' ? 'Performance fixture: cancelled visit' : null;
    childStatements.push(
      `INSERT OR IGNORE INTO appointment_services (id, appointment_id, service_id, sequence, service_name_snapshot, duration_min_snapshot, amount, status, primary_staff_id, completed_at, cancelled_at, cancelled_reason, cancelled_by_type, cancelled_by_id) VALUES (${sql(appointmentServiceId)}, ${sql(appointmentId)}, ${sql(service.id)}, ${serviceIndex + 1}, ${sql(service.name)}, ${service.durationMin}, ${money(service.price)}, ${sql(serviceStatus)}, ${sql(assignedStaff?.id ?? null)}, ${sql(serviceCompletedAt ? iso(serviceCompletedAt) : null)}, ${sql(serviceCancelledAt ? iso(serviceCancelledAt) : null)}, ${sql(cancelledReason)}, ${sql(status === 'CANCELLED' ? 'SYSTEM' : null)}, NULL)`,
    );
    childStatements.push(
      `INSERT OR IGNORE INTO turns (id, appointment_id, appointment_service_id, assigned_staff_id, status, reason, skip_reason_id, skip_reason_name_snapshot, created_at, ended_at) VALUES (${sql(turnId)}, ${sql(appointmentId)}, ${sql(appointmentServiceId)}, ${sql(assignedStaff?.id ?? null)}, ${sql(turn.status)}, ${sql(turn.reason)}, ${sql(status === 'CANCELLED' ? 'skip-reason-other' : null)}, ${sql(status === 'CANCELLED' ? 'Other' : null)}, ${sql(iso(serviceCreatedAt))}, ${sql(turnEndedAt ? iso(turnEndedAt) : null)})`,
    );
    childStatements.push(
      `INSERT OR IGNORE INTO turn_events (id, appointment_id, appointment_service_id, turn_id, event_type, assigned_staff_id, assigned_staff_name_snapshot, actor_type, actor_id, actor_name_snapshot, reason, created_at) VALUES (${sql(`perf-turn-event-${String(sequence).padStart(5, '0')}-${serviceIndex + 1}`)}, ${sql(appointmentId)}, ${sql(appointmentServiceId)}, ${sql(turnId)}, ${sql(turn.eventType)}, ${sql(assignedStaff?.id ?? null)}, ${sql(assignedStaff?.name ?? null)}, 'SYSTEM', NULL, 'Performance fixture', ${sql(turn.reason)}, ${sql(iso(turnEndedAt ?? serviceCreatedAt))})`,
    );
    return {
      appointmentServiceId,
      service,
      assignedStaff,
      completedAt: serviceCompletedAt,
    };
  });
  const appointmentCompletedAt = status === 'COMPLETED'
    ? serviceRows.reduce<Date | null>((latest, row) => row.completedAt && (!latest || row.completedAt > latest) ? row.completedAt : latest, null)
    : null;
  const appointmentCancelledAt = status === 'CANCELLED' ? new Date(createdAt.getTime() + 15 * MINUTE_MS) : null;
  const firstService = selectedServices[0];
  statements.push(
    `INSERT OR IGNORE INTO appointments (id, code, customer_id, service_id, service_name_snapshot, duration_min_snapshot, status, primary_staff_id, amount, service_count, business_date, created_at, completed_at, cancelled_at, cancelled_reason, cancelled_by_type, cancelled_by_id) VALUES (${sql(appointmentId)}, ${sql(code)}, ${sql(customerId)}, ${sql(firstService.id)}, ${sql(firstService.name)}, ${firstService.durationMin}, ${sql(status)}, ${sql(appointmentStaff?.id ?? null)}, ${money(totalAmount)}, ${selectedServices.length}, ${sql(iso(businessDate))}, ${sql(iso(createdAt))}, ${sql(appointmentCompletedAt ? iso(appointmentCompletedAt) : null)}, ${sql(appointmentCancelledAt ? iso(appointmentCancelledAt) : null)}, ${sql(status === 'CANCELLED' ? 'Performance fixture: cancelled visit' : null)}, ${sql(status === 'CANCELLED' ? 'SYSTEM' : null)}, NULL)`,
  );
  statements.push(...childStatements);

  statements.push(
    `INSERT OR IGNORE INTO audit_events (id, ts, actor_type, actor_id, action, entity, entity_id, metadata) VALUES (${sql(`perf-audit-${String(sequence).padStart(5, '0')}`)}, ${sql(iso(createdAt))}, 'SYSTEM', NULL, 'appointment.checked_in', 'Appointment', ${sql(appointmentId)}, ${sql(JSON.stringify({ code, source: 'performance-fixture' }))})`,
  );
  if (status === 'COMPLETED') {
    const paymentId = `perf-payment-${String(sequence).padStart(5, '0')}`;
    const confirmedAt = appointmentCompletedAt ? new Date(appointmentCompletedAt.getTime() + 10 * MINUTE_MS) : createdAt;
    const method = index % 2 === 0 ? 'CARD' : 'CASH';
    statements.push(
      `INSERT OR IGNORE INTO payments (id, appointment_id, amount, tip, method, service_name_snapshot, staff_name_snapshot, confirmed_by_admin_id, confirmed_at) VALUES (${sql(paymentId)}, ${sql(appointmentId)}, ${money(totalAmount)}, ${money(index % 10 === 0 ? 5 : 0)}, ${sql(method)}, ${sql(selectedServices.map((item) => item.name).join(' + '))}, ${sql(appointmentStaff?.name ?? null)}, NULL, ${sql(iso(confirmedAt))})`,
    );
    for (const row of serviceRows) {
      statements.push(
        `INSERT OR IGNORE INTO payment_items (id, payment_id, appointment_service_id, service_name_snapshot, staff_name_snapshot, amount) VALUES (${sql(`perf-payment-item-${String(sequence).padStart(5, '0')}-${row.appointmentServiceId.slice(-1)}`)}, ${sql(paymentId)}, ${sql(row.appointmentServiceId)}, ${sql(row.service.name)}, ${sql(row.assignedStaff?.name ?? null)}, ${money(row.service.price)})`,
      );
    }
  }
}

function main() {
  if (process.env.PERF_SEED_CONFIRM !== 'YES') {
    throw new Error('Set PERF_SEED_CONFIRM=YES to generate the performance fixture SQL');
  }
  if (!Number.isInteger(TOTAL_APPOINTMENTS) || TOTAL_APPOINTMENTS < 1 || TOTAL_APPOINTMENTS > 100_000) {
    throw new Error('PERF_APPOINTMENTS must be an integer between 1 and 100000');
  }
  const now = iso(new Date());
  const statements: string[] = [
    '-- Wellness Salon performance fixture: PERF-2026-* appointments from 2026-01-01 through 2026-10-31',
    '-- Idempotent by fixed PERF identifiers. Requires the bootstrap catalog and staff records.',
  ];
  for (let index = 0; index < CUSTOMER_COUNT; index += 1) {
    const customerSequence = index + 1;
    const customerId = `perf-customer-${String(customerSequence).padStart(5, '0')}`;
    const phoneNormalized = `849000${String(customerSequence).padStart(5, '0')}`;
    const phone = `+84 900 0${String(customerSequence).padStart(5, '0')}`;
    statements.push(
      `INSERT OR IGNORE INTO customers (id, phone, phone_normalized, name, created_at, updated_at) VALUES (${sql(customerId)}, ${sql(phone)}, ${sql(phoneNormalized)}, ${sql(`Performance Customer ${String(customerSequence).padStart(5, '0')}`)}, ${sql(now)}, ${sql(now)})`,
    );
  }
  addAttendance(statements, now);
  for (let index = 0; index < TOTAL_APPOINTMENTS; index += 1) addFixture(statements, index);
  writeFileSync(OUTPUT_PATH, `${statements.join(';\n')};\n`, 'utf8');
  console.error(`Generated ${TOTAL_APPOINTMENTS} appointments, ${CUSTOMER_COUNT} customers, ${statements.length} SQL statements`);
  console.error(`Output: ${OUTPUT_PATH}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Performance fixture generation failed');
  process.exitCode = 1;
}
