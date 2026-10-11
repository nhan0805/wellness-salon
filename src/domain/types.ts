import type { ServiceIconKey } from '@/src/domain/service-icons';

export type AppointmentStatus = 'CREATED' | 'WAITING' | 'ASSIGNED' | 'IN_SERVICE' | 'PAYMENT_PENDING' | 'COMPLETED' | 'CANCELLED';
export type TurnStatus = 'ASSIGNED' | 'ACCEPTED' | 'SKIPPED' | 'FINISHED';
export type AttendanceStatus = 'PRESENT' | 'CHECKED_OUT' | 'ABSENT';
export type Availability = 'AVAILABLE' | 'BUSY';
export type PaymentMethod = 'CARD' | 'CASH';
export type AttendanceClosedBy = 'STAFF' | 'ADMIN' | 'AUTO';

export interface ServiceCandidate {
  id: string;
  name: string;
  iconKey: ServiceIconKey;
  category: ServiceCategorySnapshot;
  durationMin: number;
  price: number;
  requiredSkillIds: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ServiceCategorySnapshot {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface StaffCandidate {
  id: string;
  name: string;
  initials: string;
  skills: string[];
  isActive: boolean;
  isPresent: boolean;
  availability: Availability;
  lastServiceFinishedAt: Date | null;
  lastAssignedAt: Date | null;
}

export interface TurnSnapshot {
  id: string;
  appointmentId: string;
  appointmentServiceId: string | null;
  assignedStaffId: string | null;
  status: TurnStatus;
  reason: string | null;
  skipReasonId?: string | null;
  skipReasonNameSnapshot?: string | null;
  createdAt: Date;
  endedAt: Date | null;
}

export interface TurnExclusionSnapshot {
  staffId: string;
  staffName: string;
  reason: string;
  createdAt: Date;
}

export interface AppointmentServiceSnapshot {
  id: string;
  serviceId: string;
  sequence: number;
  serviceName: string;
  durationMin: number;
  amount: number;
  status: AppointmentStatus;
  primaryStaffId: string | null;
  primaryStaff: { id: string; name: string; initials: string } | null;
  completedAt: Date | null;
  turns: TurnSnapshot[];
  turnExclusions: TurnExclusionSnapshot[];
}

export interface AppointmentSnapshot {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  amount: number;
  status: AppointmentStatus;
  primaryStaffId: string | null;
  primaryStaff: { id: string; name: string; initials: string } | null;
  createdAt: Date;
  completedAt: Date | null;
  turns: TurnSnapshot[];
  services: AppointmentServiceSnapshot[];
  supportingStaffIds: string[];
  payment: { amount: number; tip: number; method: PaymentMethod; confirmedAt: Date } | null;
}

export interface AssignmentResult {
  status: 'ASSIGNED' | 'WAITING';
  staff: StaffCandidate | null;
}

export interface ReportTrendPoint {
  date: string;
  revenue: number;
  appointmentCount: number;
  completedCount: number;
}

export interface DailyReport {
  period: 'day';
  businessDate: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  appointmentCount: number;
  openCount: number;
  pendingPaymentCount: number;
  cancelledCount: number;
  revenue: number;
  completedCount: number;
  cardTotal: number;
  cashTotal: number;
  tipTotal: number;
  cardCollectedTotal: number;
  cashCollectedTotal: number;
  totalCollected: number;
  byService: Array<{ serviceName: string; revenue: number; count: number }>;
  byCategory: Array<{ categoryName: string; revenue: number; count: number }>;
  byStaff: Array<{ staffName: string; revenue: number; count: number }>;
  dailyTrend: ReportTrendPoint[];
}

export interface MonthlyReport {
  period: 'month';
  businessMonth: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  appointmentCount: number;
  openCount: number;
  pendingPaymentCount: number;
  cancelledCount: number;
  revenue: number;
  completedCount: number;
  cardTotal: number;
  cashTotal: number;
  tipTotal: number;
  cardCollectedTotal: number;
  cashCollectedTotal: number;
  totalCollected: number;
  byService: Array<{ serviceName: string; revenue: number; count: number }>;
  byCategory: Array<{ categoryName: string; revenue: number; count: number }>;
  byStaff: Array<{ staffName: string; revenue: number; count: number }>;
  dailyTrend: ReportTrendPoint[];
}

export interface AdminSkillSnapshot {
  id: string;
  name: string;
}

export interface AdminSkillManagementSnapshot extends AdminSkillSnapshot {
  staffCount: number;
  serviceCount: number;
  createdAt: Date;
}

export interface AdminSkipReasonSnapshot {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminAccountSnapshot {
  id: string;
  email: string;
  role: 'ADMIN' | 'STATION';
  isActive: boolean;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminAttendanceSnapshot {
  staffId: string;
  staffName: string;
  initials: string;
  isActive: boolean;
  status: AttendanceStatus;
  availability: Availability;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  closedBy: AttendanceClosedBy | null;
}

export interface AdminCustomerSnapshot {
  id: string;
  name: string;
  phone: string;
  appointmentCount: number;
  lastVisitAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminCustomerHistoryItem {
  id: string;
  code: string;
  businessDate: string;
  createdAt: Date;
  completedAt: Date | null;
  serviceName: string;
  durationMin: number;
  staffName: string | null;
  status: AppointmentStatus;
  amount: number;
  services: Array<{
    id: string;
    sequence: number;
    serviceName: string;
    durationMin: number;
    amount: number;
    status: AppointmentStatus;
    staffName: string | null;
  }>;
  payment: {
    amount: number;
    tip: number;
    total: number;
    method: PaymentMethod;
    confirmedAt: Date;
  } | null;
}

export interface AdminCustomerHistorySnapshot {
  customer: Pick<AdminCustomerSnapshot, 'id' | 'name' | 'phone'>;
  summary: {
    visitCount: number;
    completedCount: number;
    paidTotal: number;
    tipTotal: number;
    totalCollected: number;
  };
  history: AdminCustomerHistoryItem[];
}

export interface AdminStaffSnapshot {
  id: string;
  name: string;
  initials: string;
  skills: AdminSkillSnapshot[];
  isActive: boolean;
  status: AttendanceStatus;
  availability: Availability;
  checkInAt: Date | null;
  checkOutAt: Date | null;
}

export interface AdminServiceSnapshot {
  id: string;
  name: string;
  iconKey: ServiceIconKey;
  categoryId: string;
  category: ServiceCategorySnapshot;
  durationMin: number;
  price: number;
  requiredSkills: AdminSkillSnapshot[];
  isActive: boolean;
  appointmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminServiceCategorySnapshot extends ServiceCategorySnapshot {
  isActive: boolean;
  serviceCount: number;
  createdAt: Date;
  updatedAt: Date;
}
