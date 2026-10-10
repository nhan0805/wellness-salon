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
  tip: z.number().finite().min(0).max(100000).optional(),
  idempotencyKey: z.string().min(8).max(120),
});

export const staffActionSchema = z.object({
  action: z.enum(['ACCEPT', 'SKIP', 'FINISH', 'CHECK_IN', 'CHECK_OUT', 'ADD_SUPPORT']),
  appointmentId: z.string().optional(),
  appointmentServiceId: z.string().optional(),
  staffId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, 'Enter a 4-digit PIN').optional(),
  reason: z.string().trim().max(140).optional(),
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
  durationMin: z.number().int().min(5).max(480),
  price: z.number().finite().min(0).max(100000),
  skillIds,
});

export const adminServiceUpdateSchema = adminServiceCreateSchema.extend({ id: z.string().min(1), isActive: z.boolean() });

export const adminAttendanceSchema = z.object({
  staffId: z.string().min(1),
  action: z.enum(['CHECK_IN', 'CHECK_OUT']),
  idempotencyKey: z.string().min(8).max(120),
});
