import { z } from 'zod';
import { DEFAULT_SERVICE_ICON_KEY, SERVICE_ICON_KEYS } from '@/src/domain/service-icons';

const phoneSchema = z.string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(20, 'Enter a valid phone number')
  .regex(/^[+0-9 ()-]+$/, 'Use digits, spaces, +, hyphens, or parentheses only')
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15;
  }, 'Enter a phone number with 7–15 digits');

export const checkInSchema = z.object({
  serviceId: z.string().min(1).optional(),
  serviceIds: z.array(z.string().min(1)).min(1).max(8).optional(),
  phone: phoneSchema,
  name: z.string().trim().min(2).max(80),
  idempotencyKey: z.string().min(8).max(120).optional(),
}).refine((value) => Boolean(value.serviceIds?.length || value.serviceId), { message: 'Choose at least one service', path: ['serviceIds'] });

export const kioskCustomerLookupSchema = z.object({
  phone: phoneSchema,
});

export const confirmPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  method: z.enum(['CARD', 'CASH']),
  amount: z.number().finite().min(0).max(100000).optional(),
  tip: z.number().finite().min(0).max(100000).optional(),
  cashReceived: z.number().finite().min(0).max(100000).optional(),
  adjustmentReason: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().min(8).max(120),
});

export const adjustPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  method: z.enum(['CARD', 'CASH']),
  amount: z.number().finite().min(0).max(100000),
  tip: z.number().finite().min(0).max(100000),
  cashReceived: z.number().finite().min(0).max(100000).optional(),
  reason: z.string().trim().min(2, 'Enter a reason for the adjustment').max(200),
  idempotencyKey: z.string().min(8).max(120),
});

export const correctPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  method: z.enum(['CARD', 'CASH']),
  tip: z.number().finite().min(0).max(100000),
  reason: z.string().trim().min(2, 'Enter a reason for the correction').max(200),
  idempotencyKey: z.string().min(8).max(120),
});

export const refundPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  amount: z.number().finite().positive().max(100000),
  refundMethod: z.enum(['CARD', 'CASH']),
  reason: z.string().trim().min(2, 'Enter a reason for the refund').max(200),
  idempotencyKey: z.string().min(8).max(120),
});

export const staffActionSchema = z.object({
  action: z.enum(['ACCEPT', 'SKIP', 'FINISH', 'CHECK_IN', 'CHECK_OUT', 'ADD_SUPPORT', 'CONTINUE_WITH_ME']),
  appointmentId: z.string().optional(),
  appointmentServiceId: z.string().optional(),
  staffId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, 'Enter a 4-digit PIN').optional(),
  reason: z.string().trim().max(140).optional(),
  skipReasonId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(8).max(120),
});

const adminName = z.string().trim().min(2).max(80);
const adminPhone = phoneSchema;
const skillIds = z.array(z.string().min(1)).min(1, 'Choose at least one skill').max(8);
const adminSkillName = z.string().trim().min(2).max(80);
const adminServiceIconKey = z.enum(SERVICE_ICON_KEYS).default(DEFAULT_SERVICE_ICON_KEY);
const adminAccountEmail = z.string().trim().email('Enter a valid email address').max(160).toLowerCase();
const adminAccountPassword = z.string().min(8, 'Use at least 8 characters for the password').max(200);

export const adminCustomerCreateSchema = z.object({ name: adminName, phone: adminPhone });
export const adminCustomerUpdateSchema = adminCustomerCreateSchema.extend({ id: z.string().min(1) });

export const adminStaffCreateSchema = z.object({
  name: adminName,
  pin: z.string().regex(/^\d{4}$/, 'Enter a 4-digit PIN'),
  skillIds,
});

export const adminStaffUpdateSchema = z.object({
  id: z.string().min(1),
  name: adminName,
  pin: z.string().regex(/^\d{4}$/, 'Enter a 4-digit PIN').optional().or(z.literal('')),
  skillIds,
  isActive: z.boolean(),
});

export const adminSkillCreateSchema = z.object({ name: adminSkillName });
export const adminSkillUpdateSchema = adminSkillCreateSchema.extend({ id: z.string().min(1) });

export const adminAccountCreateSchema = z.object({
  email: adminAccountEmail,
  password: adminAccountPassword,
  role: z.enum(['ADMIN', 'STATION']),
});

export const adminAccountUpdateSchema = z.object({
  id: z.string().min(1),
  email: adminAccountEmail,
  password: adminAccountPassword.optional().or(z.literal('')),
  role: z.enum(['ADMIN', 'STATION']),
  isActive: z.boolean(),
});

export const adminServiceCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  iconKey: adminServiceIconKey,
  categoryId: z.string().min(1),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().finite().min(0).max(100000),
  skillIds,
});

export const adminServiceUpdateSchema = adminServiceCreateSchema.extend({ id: z.string().min(1), isActive: z.boolean() });

const adminServiceCategoryName = z.string().trim().min(2, 'Enter a category name').max(60);
export const adminServiceCategoryCreateSchema = z.object({
  name: adminServiceCategoryName,
  sortOrder: z.number().int().min(0).max(999).default(0),
});
export const adminServiceCategoryUpdateSchema = adminServiceCategoryCreateSchema.extend({
  id: z.string().min(1),
  isActive: z.boolean(),
});

export const adminAttendanceSchema = z.object({
  staffId: z.string().min(1),
  action: z.enum(['CHECK_IN', 'CHECK_OUT']),
  idempotencyKey: z.string().min(8).max(120),
});

export const adminSkipReasonCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const adminSkipReasonUpdateSchema = adminSkipReasonCreateSchema.extend({
  id: z.string().min(1),
  isActive: z.boolean(),
});

export const adminAppointmentCancelSchema = z.object({
  appointmentId: z.string().min(1),
  appointmentServiceId: z.string().min(1).optional(),
  scope: z.enum(['SERVICE', 'VISIT']).default('SERVICE'),
  reason: z.string().trim().min(2).max(200),
  confirmed: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(120),
});

export const adminAppointmentReassignSchema = z.object({
  appointmentServiceId: z.string().min(1),
  staffId: z.string().min(1),
  reason: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().min(8).max(120),
});

export const adminTurnExclusionOverrideSchema = z.object({
  appointmentServiceId: z.string().min(1),
  staffId: z.string().min(1),
  reason: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().min(8).max(120),
});

export const adminAppointmentServiceChangeSchema = z.object({
  appointmentServiceId: z.string().min(1),
  serviceId: z.string().min(1),
  reason: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().min(8).max(120),
});

const shopTime = z.string().regex(/^\d{2}:\d{2}$/).refine((value) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}, 'Enter a valid 24-hour time');

const shopTimezone = z.string().trim().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'Enter a valid IANA timezone');

export const adminShopConfigSchema = z.object({
  timezone: shopTimezone,
  openingTime: shopTime,
  closingTime: shopTime,
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  verifiedSessionTtlMin: z.number().int().min(1).max(15),
  roundRobinEnabled: z.boolean(),
}).refine((value) => value.openingTime < value.closingTime, { message: 'Closing time must be later than opening time', path: ['closingTime'] });
