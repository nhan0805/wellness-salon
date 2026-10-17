'use client';

import dynamic from 'next/dynamic';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BadgeCheck,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CircleX,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Hand,
  History,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  Menu,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Scissors,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Undo2,
  UserCog,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react';
import { InitialsAvatar, SectionHeader, StatusBadge } from '@/src/components/ui';
import { AccountMenu } from '@/src/components/account-menu';
import { useDialogFocus } from '@/src/components/use-dialog-focus';
import {
  fetchWithTimeout,
  isAbortError,
  RequestTimeoutError,
} from '@/src/client/fetch-with-timeout';
import { makeAccountViewer, type AccountViewer } from '@/src/domain/viewer';
import { DEFAULT_TIMEZONE } from '@/src/domain/locale-options';
import { isAppointmentPaymentReady } from '@/src/domain/payment-readiness';
import { ADMIN_REFRESH_INTERVAL_MS } from '@/src/domain/realtime';

// Settings, master-data management, and modal workflows are not needed for the
// initial dashboard. Keep them in on-demand client chunks so a manager reaches
// the live overview without downloading every form, keypad, and table editor.
const AdminManagement = dynamic(
  () => import('@/src/components/admin-management').then((module) => module.AdminManagement),
  {
    loading: () => (
      <div className="card management-loading" role="status">
        Loading management…
      </div>
    ),
  },
);
const AdminAccessManagement = dynamic(
  () => import('@/src/components/admin-access').then((module) => module.AdminAccessManagement),
  {
    loading: () => (
      <div className="card management-loading" role="status">
        Loading access…
      </div>
    ),
  },
);
const AdminShopConfig = dynamic(
  () => import('@/src/components/admin-operations').then((module) => module.AdminShopConfig),
  {
    loading: () => (
      <div className="card management-loading" role="status">
        Loading settings…
      </div>
    ),
  },
);
const AdminSkipReasons = dynamic(
  () => import('@/src/components/admin-operations').then((module) => module.AdminSkipReasons),
  {
    loading: () => (
      <div className="card management-loading" role="status">
        Loading skip reasons…
      </div>
    ),
  },
);
const AdminAppointmentAction = dynamic(
  () =>
    import('@/src/components/admin-appointment-actions').then(
      (module) => module.AdminAppointmentAction,
    ),
  {
    loading: () => (
      <div className="card management-loading" role="status">
        Loading action…
      </div>
    ),
  },
);
const AmountKeypad = dynamic(
  () => import('@/src/components/amount-keypad').then((module) => module.AmountKeypad),
  {
    loading: () => (
      <div className="card management-loading" role="status">
        Loading keypad…
      </div>
    ),
  },
);

type Section =
  | 'overview'
  | 'attendance'
  | 'queue'
  | 'appointments'
  | 'payments'
  | 'customers'
  | 'config';
type ShopConfigSection = 'general' | 'staff' | 'services' | 'skills' | 'skipReasons' | 'accounts';
type AppointmentFilter = 'ALL' | 'COMPLETED';
type AppointmentStatusFilter =
  | 'ALL'
  | 'CREATED'
  | 'WAITING'
  | 'ASSIGNED'
  | 'IN_SERVICE'
  | 'PAYMENT_PENDING'
  | 'COMPLETED'
  | 'CANCELLED';
type AppointmentDateMode = 'DAY' | 'MONTH' | 'RANGE';
type Appointment = {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  serviceId: string;
  serviceName: string;
  durationMin: number;
  amount: number;
  status: string;
  primaryStaffId: string | null;
  primaryStaff: { id: string; name: string; initials: string } | null;
  completedAt: string | null;
  createdAt: string;
  supportingStaffIds: string[];
  payment: { amount: number; tip: number; method: 'CARD' | 'CASH'; confirmedAt: string } | null;
  turns: Array<{ status: string; reason: string | null }>;
  services: Array<{
    id: string;
    serviceId: string;
    sequence: number;
    serviceName: string;
    durationMin: number;
    amount: number;
    status: string;
    primaryStaffId?: string | null;
    completedAt?: string | null;
    primaryStaff: { id: string; name: string; initials: string } | null;
    turnExclusions: Array<{
      staffId: string;
      staffName: string;
      reason: string;
      createdAt: string;
    }>;
  }>;
};

function isPaymentReadyForAdminAppointment(appointment: Appointment) {
  const services = appointment.services.length
    ? appointment.services
    : [
        {
          status: appointment.status,
          primaryStaffId: appointment.primaryStaffId,
          completedAt: appointment.completedAt,
        },
      ];
  return isAppointmentPaymentReady({ status: appointment.status, services });
}
type PaymentHistoryEvent = {
  id: string;
  action: string;
  actorName: string;
  createdAt: string;
  metadata: { [key: string]: unknown } | null;
};
type PaymentHistoryPayload = {
  payment: {
    id: string;
    appointmentId: string;
    code: string;
    customerName: string;
    originalAmount: number;
    amount: number;
    tip: number;
    total: number;
    method: 'CARD' | 'CASH';
    cashReceived: number | null;
    changeGiven: number;
    confirmedAt: string | null;
    confirmedBy: string;
    refundedAmount: number;
    refundableAmount: number;
    status: 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  };
  events: PaymentHistoryEvent[];
};
type AppointmentPageMeta = { page: number; pageSize: number; total: number; totalPages: number };
type AppointmentSummary = { totalRevenue: number; totalDuration: number };
type AppointmentFilterOptions = {
  staff: Array<{ id: string; name: string }>;
  services: Array<{ id: string; name: string }>;
};
type ReportPeriod = 'day' | 'month';
type RevenueBreakdown = 'service' | 'category';
type ReportTrendPoint = {
  date: string;
  revenue: number;
  appointmentCount: number;
  completedCount: number;
};
type Report = {
  period: ReportPeriod;
  businessDate?: string;
  businessMonth?: string;
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
  reconciliation: { recordedTotal: number; difference: number; isBalanced: boolean };
};
type ShopSnapshot = {
  timezone: string;
  openingTime: string;
  closingTime: string;
  currency: string;
};
type AdminDashboardPayload = {
  live?: { appointments?: Appointment[] };
  appointments?: {
    businessDate?: string;
    businessMonth?: string;
    appointments?: Appointment[];
    pagination?: AppointmentPageMeta;
    summary?: AppointmentSummary;
    filterOptions?: AppointmentFilterOptions;
  };
  reports?: Report;
  config?: { shop?: ShopSnapshot };
  errors?: Array<{ section: 'live' | 'appointments' | 'reports' | 'config'; message: string }>;
};

const navItems: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance', icon: CalendarClock },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'appointments', label: 'Appointments', icon: ClipboardList },
  { id: 'payments', label: 'Payments', icon: WalletCards },
  { id: 'customers', label: 'Customers', icon: UsersRound },
  { id: 'config', label: 'Settings', icon: Settings2 },
];
const shopConfigTabs: Array<{ id: ShopConfigSection; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: 'General', icon: Settings2 },
  { id: 'staff', label: 'Staff', icon: BadgeCheck },
  { id: 'services', label: 'Services', icon: Hand },
  { id: 'skills', label: 'Skills', icon: Tags },
  { id: 'skipReasons', label: 'Skip reasons', icon: ListChecks },
  { id: 'accounts', label: 'Accounts', icon: UserCog },
];

const emptyReport: Report = {
  period: 'day',
  businessDate: '',
  periodStart: '',
  periodEnd: '',
  periodLabel: '',
  appointmentCount: 0,
  openCount: 0,
  pendingPaymentCount: 0,
  cancelledCount: 0,
  revenue: 0,
  completedCount: 0,
  cardTotal: 0,
  cashTotal: 0,
  tipTotal: 0,
  cardCollectedTotal: 0,
  cashCollectedTotal: 0,
  totalCollected: 0,
  byService: [],
  byCategory: [],
  byStaff: [],
  dailyTrend: [],
  reconciliation: { recordedTotal: 0, difference: 0, isBalanced: true },
};

const ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS = 10_000;

function getAdminApiError(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return '';
  const error = (payload as { error?: unknown }).error;
  return typeof error === 'string' ? error : '';
}

async function parseAdminJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(
      response.ok
        ? `${fallbackMessage}. The server returned an empty response.`
        : `${fallbackMessage} (HTTP ${response.status}). The server returned an empty response.`,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(
      `${fallbackMessage} (HTTP ${response.status}). The server returned an invalid response.`,
    );
  }

  if (!response.ok) {
    throw new Error(getAdminApiError(payload) || `${fallbackMessage} (HTTP ${response.status})`);
  }
  return payload as T;
}

async function fetchAdminDashboardJson<T>(
  path: string,
  label: string,
  parentSignal: AbortSignal,
): Promise<T> {
  try {
    const response = await fetchWithTimeout(
      path,
      { cache: 'no-store', signal: parentSignal },
      ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS,
    );
    const payload = await response.json();
    if (!response.ok) {
      const detail = getAdminApiError(payload);
      throw new Error(`${label} failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof RequestTimeoutError) {
      throw new Error(
        `${label} timed out after ${ADMIN_DASHBOARD_REQUEST_TIMEOUT_MS / 1000} seconds.`,
      );
    }
    throw error;
  }
}

export default function AdminPage() {
  const [accountViewer, setAccountViewer] = useState<AccountViewer>(
    () => makeAccountViewer({ role: 'ADMIN' })!,
  );
  const [section, setSection] = useState<Section>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [shopConfigSection, setShopConfigSection] = useState<ShopConfigSection>('general');
  const [appointmentFilter, setAppointmentFilter] = useState<AppointmentFilter>('ALL');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reportAppointments, setReportAppointments] = useState<Appointment[]>([]);
  const [report, setReport] = useState<Report>(emptyReport);
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('day');
  const [reportDate, setReportDate] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [revenueBreakdown, setRevenueBreakdown] = useState<RevenueBreakdown>('service');
  const [toast, setToast] = useState('');
  const [paymentModal, setPaymentModal] = useState<Appointment | null>(null);
  const [appointmentAction, setAppointmentAction] = useState<{
    appointment: Appointment;
    mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION';
  } | null>(null);
  const [method, setMethod] = useState<'CARD' | 'CASH'>('CARD');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [tip, setTip] = useState('');
  const [cashReceived, setCashReceived] = useState('');
  const [paymentFieldError, setPaymentFieldError] = useState<{
    field: 'amount' | 'tip' | 'cash';
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueRepairing, setQueueRepairing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [staleSince, setStaleSince] = useState<Date | null>(null);
  const refreshControllerRef = useRef<AbortController | null>(null);
  const refreshRevisionRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const reportPeriodRef = useRef(reportPeriod);
  const reportDateRef = useRef(reportDate);
  const reportMonthRef = useRef(reportMonth);
  const mobileNavRef = useDialogFocus(mobileNavOpen, () => setMobileNavOpen(false));
  const [shop, setShop] = useState({
    timezone: DEFAULT_TIMEZONE,
    openingTime: '09:00',
    closingTime: '21:00',
    currency: 'USD',
  });

  useEffect(() => {
    let disposed = false;

    async function loadAccountViewer() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          user?: { email?: string | null; name?: string | null; role?: 'ADMIN' | 'STATION' | null };
        };
        const viewer = makeAccountViewer({ ...payload.user, displayName: payload.user?.name });
        if (!disposed && viewer) setAccountViewer(viewer);
      } catch {
        // The role-based fallback keeps the account control available if the session endpoint is briefly unavailable.
      }
    }

    void loadAccountViewer();
    return () => {
      disposed = true;
    };
  }, []);

  async function refresh(
    period = reportPeriod,
    date = reportDate,
    month = reportMonth,
    background = false,
  ) {
    if (background && refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    const revision = ++refreshRevisionRef.current;
    refreshControllerRef.current?.abort();
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    if (!background) setLoading(true);
    setLoadError('');
    try {
      const shouldLoadLive =
        section === 'overview' || section === 'queue' || section === 'payments';
      // Reports and settings are snapshots. Refresh them on initial load,
      // section changes, and explicit retries; background polling only needs
      // the live queue to avoid re-running the heaviest report queries every
      // 15 seconds.
      const shouldLoadReports =
        !background && (section === 'overview' || section === 'appointments');
      const shouldLoadConfig = !background && section === 'overview';
      const include = [
        shouldLoadLive ? 'live' : '',
        shouldLoadReports ? 'reports' : '',
        shouldLoadConfig ? 'config' : '',
      ].filter(Boolean);
      if (!include.length) return;
      const dashboardQuery = new URLSearchParams({ include: include.join(',') });
      if (period === 'month') {
        dashboardQuery.set('period', 'month');
        if (month) dashboardQuery.set('month', month);
      } else if (date) {
        dashboardQuery.set('date', date);
      }
      dashboardQuery.set('page', '1');
      dashboardQuery.set('pageSize', '3');
      const requests: Array<{ label: string; enabled: boolean; promise: Promise<unknown> }> = [
        {
          label: 'Dashboard snapshot',
          enabled: include.length > 0,
          promise: fetchAdminDashboardJson<AdminDashboardPayload>(
            `/api/admin/dashboard?${dashboardQuery.toString()}`,
            'Dashboard snapshot',
            controller.signal,
          ),
        },
      ];
      const results = await Promise.allSettled(requests.map((request) => request.promise));
      if (revision !== refreshRevisionRef.current) return;

      const dashboardResult = results[0];
      const dashboardPayload =
        dashboardResult.status === 'fulfilled'
          ? (dashboardResult.value as AdminDashboardPayload)
          : null;
      if (dashboardPayload?.live) setAppointments(dashboardPayload.live.appointments ?? []);
      if (dashboardPayload?.appointments)
        setReportAppointments(dashboardPayload.appointments.appointments ?? []);
      if (dashboardPayload?.reports) setReport(dashboardPayload.reports);
      if (dashboardPayload?.config?.shop) setShop(dashboardPayload.config.shop);

      const sectionLabels: Record<string, string> = {
        live: 'Live appointments',
        appointments: 'Report appointments',
        reports: 'Reports',
        config: 'Shop config',
      };
      const failures =
        dashboardResult.status === 'fulfilled'
          ? (dashboardPayload?.errors ?? []).map((failure) => ({
              label: sectionLabels[failure.section] ?? failure.section,
              reason: new Error(failure.message),
            }))
          : [{ label: requests[0].label, reason: dashboardResult.reason }];
      const actionableFailures = failures.filter(({ reason }) => !isAbortError(reason));
      const successfulRequestCount = dashboardPayload
        ? [
            dashboardPayload.live,
            dashboardPayload.appointments,
            dashboardPayload.reports,
            dashboardPayload.config,
          ].filter(Boolean).length
        : 0;

      if (actionableFailures.length) {
        const firstFailure = actionableFailures[0].reason;
        const detail =
          firstFailure instanceof Error ? firstFailure.message : 'Unable to load dashboard data';
        setLoadError(
          actionableFailures.length === 1
            ? detail
            : `${detail} Some dashboard data may be out of date.`,
        );
        setStaleSince((current) => current ?? new Date());
      } else if (failures.length) {
        return;
      } else {
        setLoadError('');
        setStaleSince(null);
      }

      if (successfulRequestCount > 0) {
        setLastUpdatedAt(new Date());
        setDataRevision((revision) => revision + 1);
      }
      if (dashboardPayload?.reports) {
        setReportPeriod(dashboardPayload.reports.period ?? period);
        if (dashboardPayload.reports.period === 'month')
          setReportMonth(dashboardPayload.reports.businessMonth ?? month);
        else setReportDate(dashboardPayload.reports.businessDate ?? date);
      }
    } finally {
      if (revision === refreshRevisionRef.current) {
        if (!background) setLoading(false);
        refreshInFlightRef.current = false;
        if (refreshControllerRef.current === controller) refreshControllerRef.current = null;
      }
    }
  }

  useEffect(() => {
    reportPeriodRef.current = reportPeriod;
    reportDateRef.current = reportDate;
    reportMonthRef.current = reportMonth;
  }, [reportPeriod, reportDate, reportMonth]);

  // Refresh only sections that display the parent Admin snapshot. Management modules own their
  // own data lifecycle, so they do not create an extra four-request polling fan-out.
  useEffect(() => {
    const refreshableSections: Section[] = ['overview', 'queue', 'appointments', 'payments'];
    if (!refreshableSections.includes(section)) return;
    // The initial dashboard request intentionally starts after mount and section changes request
    // the newly visible snapshot immediately.
    void refresh(reportPeriodRef.current, reportDateRef.current, reportMonthRef.current);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible')
        void refresh(reportPeriodRef.current, reportDateRef.current, reportMonthRef.current, true);
    }, ADMIN_REFRESH_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible')
        void refresh(reportPeriodRef.current, reportDateRef.current, reportMonthRef.current, true);
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      refreshRevisionRef.current += 1;
      refreshControllerRef.current?.abort();
      refreshInFlightRef.current = false;
    };
    // refresh is intentionally kept out of the dependency list because it is
    // recreated on render; the selected report scope is the meaningful input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [section]);
  useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const serviceRevenue = [...report.byService].sort((left, right) => right.revenue - left.revenue);
  const categoryRevenue = [...report.byCategory].sort(
    (left, right) => right.revenue - left.revenue,
  );
  const eligibleAppointmentCount = Math.max(report.appointmentCount - report.cancelledCount, 0);
  const completionRate = eligibleAppointmentCount
    ? Math.round((report.completedCount / eligibleAppointmentCount) * 100)
    : 0;
  const paymentTotal = report.totalCollected;
  const cardPaymentShare = paymentTotal
    ? Math.round((report.cardCollectedTotal / paymentTotal) * 100)
    : 0;
  const cashPaymentShare = paymentTotal ? 100 - cardPaymentShare : 0;

  function formatMoney(value: number) {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: shop.currency }).format(
      value,
    );
  }

  function revenueShare(value: number) {
    return report.revenue ? Math.round((value / report.revenue) * 100) : 0;
  }

  const parsedPaymentAmount = Number(paymentAmount);
  const safePaymentAmount =
    Number.isFinite(parsedPaymentAmount) && parsedPaymentAmount >= 0 ? parsedPaymentAmount : 0;
  const parsedTipAmount = tip.trim() ? Number(tip) : 0;
  const safeTipAmount =
    Number.isFinite(parsedTipAmount) && parsedTipAmount >= 0 ? parsedTipAmount : 0;
  const currentPaymentTotal = Number((safePaymentAmount + safeTipAmount).toFixed(2));
  const parsedCashReceived = cashReceived.trim() ? Number(cashReceived) : undefined;
  const cashReceivedIsShort =
    method === 'CASH' &&
    parsedCashReceived !== undefined &&
    Number.isFinite(parsedCashReceived) &&
    parsedCashReceived < currentPaymentTotal;
  const cardTipQuickValues = [15, 18, 20, 25].map((percentage) => ({
    label: `${percentage}%`,
    value: (safePaymentAmount * (percentage / 100)).toFixed(2),
  }));

  function openPayment(appointment: Appointment) {
    if (!isPaymentReadyForAdminAppointment(appointment)) {
      setToast('Payment is unavailable until every completed service has a specialist.');
      return;
    }
    setPaymentModal(appointment);
    setMethod('CARD');
    setPaymentAmount(String(appointment.amount));
    setTip('');
    setCashReceived('');
    setPaymentFieldError(null);
  }
  function openAppointmentAction(
    appointment: Appointment,
    mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION',
  ) {
    setAppointmentAction({ appointment, mode });
  }
  function resetAdminScroll() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }
  function navigateToSection(nextSection: Section) {
    resetAdminScroll();
    setMobileNavOpen(false);
    setSection(nextSection);
    if (nextSection === 'appointments') setAppointmentFilter('ALL');
  }
  function openAppointments(filter: AppointmentFilter = 'ALL') {
    resetAdminScroll();
    setAppointmentFilter(filter);
    setSection('appointments');
  }
  const closePayment = useCallback(() => {
    setPaymentModal(null);
    setPaymentAmount('');
    setTip('');
    setCashReceived('');
    setPaymentFieldError(null);
  }, []);
  const paymentDialogRef = useDialogFocus(Boolean(paymentModal), closePayment);
  async function confirmPayment() {
    if (!paymentModal) return;
    const parsedAmount = Number(paymentAmount);
    const parsedTip = tip.trim() ? Number(tip) : 0;
    const parsedCashReceived = cashReceived.trim() ? Number(cashReceived) : undefined;
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      const message = 'Enter a valid final amount.';
      setPaymentFieldError({ field: 'amount', message });
      document.getElementById('payment-final-amount')?.focus();
      return;
    }
    if (!Number.isFinite(parsedTip) || parsedTip < 0) {
      const message = 'Enter a valid non-negative tip.';
      setPaymentFieldError({ field: 'tip', message });
      document.getElementById('payment-tip')?.focus();
      return;
    }
    if (
      method === 'CASH' &&
      parsedCashReceived !== undefined &&
      (!Number.isFinite(parsedCashReceived) || parsedCashReceived < 0)
    ) {
      const message = 'Enter a valid cash received amount.';
      setPaymentFieldError({ field: 'cash', message });
      document.getElementById('payment-cash-received')?.focus();
      return;
    }
    const total = Number((parsedAmount + parsedTip).toFixed(2));
    if (method === 'CASH' && parsedCashReceived !== undefined && parsedCashReceived < total) {
      const message = `Cash received must be at least ${formatMoney(total)}.`;
      setPaymentFieldError({ field: 'cash', message });
      document.getElementById('payment-cash-received')?.focus();
      return;
    }
    setPaymentFieldError(null);
    setBusy(true);
    try {
      const response = await fetch('/api/admin/payments/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appointmentId: paymentModal.id,
          method,
          amount: parsedAmount,
          tip: parsedTip,
          cashReceived: method === 'CASH' ? parsedCashReceived : undefined,
          idempotencyKey: `payment-${paymentModal.id}-${method}-${parsedAmount}-${parsedTip}-${parsedCashReceived ?? 'card'}`,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Payment could not be confirmed');
      setToast(`${paymentModal.code} marked paid via ${method === 'CARD' ? 'card' : 'cash'}.`);
      closePayment();
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Payment could not be confirmed');
    } finally {
      setBusy(false);
    }
  }

  async function repairQueue() {
    setQueueRepairing(true);
    try {
      const response = await fetch('/api/admin/queue/reconcile', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Queue repair could not be completed');
      const routedAppointments = payload.routedAppointments ?? 0;
      setToast(
        `Assignment check complete · ${routedAppointments} appointment${routedAppointments === 1 ? '' : 's'} reviewed.`,
      );
      await refresh('day', reportDate, reportMonth, true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Queue repair could not be completed');
    } finally {
      setQueueRepairing(false);
    }
  }

  function changeReportPeriod(next: ReportPeriod) {
    if (next === reportPeriod) return;
    setReportPeriod(next);
    if (next === 'month') {
      const nextMonth = reportDate
        ? reportDate.slice(0, 7)
        : reportMonth || formatLocalPeriodValue('month');
      setReportMonth(nextMonth);
      void refresh('month', reportDate, nextMonth);
      return;
    }

    const nextDate = reportMonth
      ? `${reportMonth}-01`
      : reportDate || formatLocalPeriodValue('day');
    setReportDate(nextDate);
    void refresh('day', nextDate, reportMonth);
  }
  function changeReportDate(value: string) {
    setReportDate(value);
    if (value) void refresh('day', value, reportMonth);
  }
  function changeReportMonth(value: string) {
    setReportMonth(value);
    if (value) void refresh('month', reportDate, value);
  }

  function renderOverview() {
    if (loading)
      return (
        <div className="card management-loading" role="status">
          Loading dashboard…
        </div>
      );
    if (loadError)
      return (
        <div className="management-error" role="alert">
          {loadError}
          <button className="button button-quiet button-sm" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      );
    const reportLabel = formatReportPeriodLabel(report);
    const periodName = report.period === 'month' ? 'month' : 'business date';
    const activeAppointments = appointments.filter(
      (appointment) => !['COMPLETED', 'CANCELLED'].includes(appointment.status),
    );
    const pendingPaymentAppointments = activeAppointments.filter(
      (appointment) => !appointment.payment && isPaymentReadyForAdminAppointment(appointment),
    );
    const unassignedAppointments = activeAppointments.filter(
      (appointment) => !appointment.primaryStaff,
    );
    const waitingAppointments = activeAppointments.filter((appointment) =>
      ['CREATED', 'WAITING'].includes(appointment.status),
    );
    const queueExceptionAppointments = new Set([
      ...waitingAppointments.map((appointment) => appointment.id),
      ...unassignedAppointments.map((appointment) => appointment.id),
    ]);
    const staffRevenue = [...report.byStaff].sort((left, right) => right.revenue - left.revenue);
    const staffRevenueTotal = staffRevenue.reduce((total, entry) => total + entry.revenue, 0);
    const breakdownItems =
      revenueBreakdown === 'service'
        ? serviceRevenue.map((entry) => ({
            name: entry.serviceName,
            revenue: entry.revenue,
            count: entry.count,
          }))
        : categoryRevenue.map((entry) => ({
            name: entry.categoryName,
            revenue: entry.revenue,
            count: entry.count,
          }));
    const breakdownTitle =
      revenueBreakdown === 'service' ? 'Revenue by service' : 'Revenue by category';
    const breakdownDescription =
      revenueBreakdown === 'service'
        ? `Service revenue for ${reportLabel}; tips are excluded.`
        : `Service revenue grouped by category for ${reportLabel}; tips are excluded.`;
    const breakdownTitleId =
      revenueBreakdown === 'service' ? 'revenue-by-service-title' : 'revenue-by-category-title';
    return (
      <>
        <div className="dashboard-greeting">
          <div className="dashboard-greeting-copy">
            <div className="eyebrow">
              {report.period === 'month' ? 'Business month' : 'Business date'} · {reportLabel}
            </div>
            <h2>Business overview</h2>
            <p>
              Service revenue and completed appointments for the selected {periodName}. Live queue
              exceptions are always for today.
            </p>
          </div>
        </div>
        <div className="report-toolbar dashboard-report-toolbar">
          <ReportPeriodFilter
            period={reportPeriod}
            date={reportDate}
            month={reportMonth}
            onPeriodChange={changeReportPeriod}
            onDateChange={changeReportDate}
            onMonthChange={changeReportMonth}
            loading={loading}
          />
        </div>
        <div className="kpi-grid">
          <Kpi
            icon={CircleDollarSign}
            label="Service revenue"
            value={formatMoney(report.revenue)}
            meta={`Excludes tips · ${reportLabel}`}
            tone="blue"
          />
          <Kpi
            icon={Banknote}
            label="Tips collected"
            value={formatMoney(report.tipTotal)}
            meta="Separate from service revenue"
            tone="teal"
          />
          <Kpi
            icon={CheckCircle2}
            label="Completed appointments"
            value={String(report.completedCount)}
            meta={`Completion rate · ${completionRate}% of ${eligibleAppointmentCount} non-cancelled appointments`}
            tone="teal"
            onClick={() => openAppointments('COMPLETED')}
            actionLabel="Open completed appointments"
            actionHint="View completed"
          />
        </div>
        {(() => {
          const attentionItems = [
            {
              key: 'payments',
              icon: <WalletCards size={17} aria-hidden="true" />,
              iconClass: 'dashboard-attention-item-icon-warning',
              title: 'Payment collection',
              detail: `${pendingPaymentAppointments.length} appointment${pendingPaymentAppointments.length === 1 ? '' : 's'} ready to collect`,
              count: pendingPaymentAppointments.length,
              onClick: () => navigateToSection('payments'),
            },
            {
              key: 'queue',
              icon: <UsersRound size={17} aria-hidden="true" />,
              iconClass: 'dashboard-attention-item-icon-blue',
              title: 'Queue exceptions',
              detail: `${waitingAppointments.length} waiting · ${unassignedAppointments.length} unassigned`,
              count: queueExceptionAppointments.size,
              onClick: () => navigateToSection('queue'),
            },
          ].filter((item) => item.count > 0);
          const attentionCount = attentionItems.length;

          return (
            <section
              className="card card-pad dashboard-attention-card"
              aria-labelledby="dashboard-attention-title"
            >
              <div className="dashboard-attention-header">
                <div className="dashboard-attention-title">
                  <span
                    className={`dashboard-attention-icon ${attentionCount ? 'has-alert' : 'is-clear'}`}
                  >
                    {attentionCount ? (
                      <AlertCircle size={18} aria-hidden="true" />
                    ) : (
                      <CheckCircle2 size={18} aria-hidden="true" />
                    )}
                  </span>
                  <div className="dashboard-attention-title-copy">
                    <div className="eyebrow">Live operations</div>
                    <h3 id="dashboard-attention-title" className="card-title">
                      Live today
                    </h3>
                    <p>Only current-day payment and queue exceptions are shown here.</p>
                  </div>
                </div>
                <span
                  className={`dashboard-attention-count ${attentionCount ? 'has-alert' : 'is-clear'}`}
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {attentionCount
                    ? `${attentionCount} check${attentionCount === 1 ? '' : 's'} to review`
                    : 'All clear'}
                </span>
              </div>
              {attentionCount ? (
                <div className="dashboard-attention-list">
                  {attentionItems.map((item) => (
                    <button
                      type="button"
                      className="dashboard-attention-item has-alert"
                      key={item.key}
                      onClick={item.onClick}
                      aria-label={`${item.title}: ${item.detail}`}
                    >
                      <span className={`dashboard-attention-item-icon ${item.iconClass}`}>
                        {item.icon}
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <span className="dashboard-attention-item-value">{item.count}</span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="dashboard-attention-clear" role="status">
                  <span className="dashboard-attention-clear-icon">
                    <CheckCircle2 size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>Everything is on track</strong>
                    <small>No payment or queue exceptions right now.</small>
                  </span>
                </div>
              )}
            </section>
          );
        })()}
        <section
          className="card card-pad dashboard-collection-card"
          aria-labelledby="collection-summary-title"
        >
          <div className="card-title-row">
            <div>
              <h3 id="collection-summary-title" className="card-title">
                Payment split
              </h3>
              <p>Card + cash · includes tips for {reportLabel}.</p>
            </div>
            <StatusBadge
              label={report.totalCollected ? 'Includes tips' : 'No collections'}
              tone={report.totalCollected ? 'success' : 'neutral'}
            />
          </div>
          <div className="collection-total-row">
            <div className="collection-total-copy">
              <span>Total collected</span>
              <strong>{formatMoney(report.totalCollected)}</strong>
            </div>
            <p>Service revenue + tips</p>
          </div>
          <div
            className="payment-split-summary"
            role="group"
            aria-label={`Payment methods: ${cardPaymentShare}% card, ${cashPaymentShare}% cash`}
          >
            <strong>{cardPaymentShare}% card</strong>
            <span>{cashPaymentShare}% cash</span>
          </div>
          <div className="payment-split-track" aria-hidden="true">
            <span className="payment-split-track-card" style={{ width: `${cardPaymentShare}%` }} />
            <span className="payment-split-track-cash" style={{ width: `${cashPaymentShare}%` }} />
          </div>
          <div className="payment-split-legend">
            <div className="payment-split-legend-item">
              <span>Card</span>
              <strong>{formatMoney(report.cardCollectedTotal)}</strong>
            </div>
            <div className="payment-split-legend-item">
              <span>Cash</span>
              <strong>{formatMoney(report.cashCollectedTotal)}</strong>
            </div>
          </div>
        </section>
        {report.period === 'month' ? (
          <MonthlyTrendCard trend={report.dailyTrend} currency={shop.currency} />
        ) : null}
        <section
          className="card card-pad dashboard-breakdown-card"
          aria-labelledby={breakdownTitleId}
        >
          <div className="dashboard-chart-header">
            <div>
              <span className="dashboard-chart-eyebrow">Revenue breakdown</span>
              <h3 id={breakdownTitleId} className="card-title">
                {breakdownTitle}
              </h3>
              <p>{breakdownDescription}</p>
            </div>
            <span className="dashboard-chart-scope">Excl. tips · {reportLabel}</span>
          </div>
          <div className="dashboard-breakdown-tabs" role="tablist" aria-label="Revenue breakdown">
            <button
              type="button"
              role="tab"
              aria-selected={revenueBreakdown === 'service'}
              aria-controls="dashboard-breakdown-panel"
              className={`dashboard-breakdown-tab ${revenueBreakdown === 'service' ? 'is-active' : ''}`}
              onClick={() => setRevenueBreakdown('service')}
            >
              By service <span>{serviceRevenue.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={revenueBreakdown === 'category'}
              aria-controls="dashboard-breakdown-panel"
              className={`dashboard-breakdown-tab ${revenueBreakdown === 'category' ? 'is-active' : ''}`}
              onClick={() => setRevenueBreakdown('category')}
            >
              By category <span>{categoryRevenue.length}</span>
            </button>
          </div>
          <div id="dashboard-breakdown-panel" role="tabpanel" aria-labelledby={breakdownTitleId}>
            <div
              className="report-bars report-ranked-bars"
              role="list"
              aria-labelledby={breakdownTitleId}
            >
              {breakdownItems.length ? (
                breakdownItems.map((entry, index) => {
                  const share = revenueShare(entry.revenue);
                  return (
                    <div
                      className={`report-ranked-row ${index === 0 ? 'is-leading' : ''}`}
                      key={entry.name}
                      role="listitem"
                      aria-label={`${entry.name}: ${formatMoney(entry.revenue)}, ${entry.count} paid service items, ${share}% of service revenue`}
                    >
                      <div className="report-ranked-row-header">
                        <div className="report-ranked-label">
                          <span className="report-rank">{String(index + 1).padStart(2, '0')}</span>
                          <div>
                            <strong>{entry.name}</strong>
                            <small>
                              {entry.count} paid service item{entry.count === 1 ? '' : 's'} ·{' '}
                              {share}% of service revenue
                            </small>
                          </div>
                        </div>
                        <strong className="report-ranked-value">
                          {formatMoney(entry.revenue)}
                        </strong>
                      </div>
                      <div className="report-ranked-track" aria-hidden="true">
                        <span style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-state">
                  <span>No confirmed service revenue for this {periodName}.</span>
                </div>
              )}
            </div>
          </div>
        </section>
        <section
          className="card card-pad dashboard-reconciliation-card dashboard-reconciliation-compact"
          aria-labelledby="revenue-reconciliation-title"
        >
          <div className="dashboard-reconciliation-inline">
            <span
              className={`dashboard-reconciliation-icon ${report.reconciliation.isBalanced ? 'is-balanced' : 'needs-review'}`}
            >
              {report.reconciliation.isBalanced ? (
                <CheckCircle2 size={17} aria-hidden="true" />
              ) : (
                <AlertCircle size={17} aria-hidden="true" />
              )}
            </span>
            <div className="dashboard-reconciliation-copy">
              <strong id="revenue-reconciliation-title">
                {report.reconciliation.isBalanced
                  ? 'Service fees reconciled'
                  : 'Review service fee reconciliation'}
              </strong>
              <small>
                Card {formatMoney(report.cardTotal)} + cash {formatMoney(report.cashTotal)} ={' '}
                {formatMoney(report.revenue)}
                {' · '}difference {formatMoney(report.reconciliation.difference)}
              </small>
            </div>
            <StatusBadge
              label={report.reconciliation.isBalanced ? 'Balanced' : 'Review'}
              tone={report.reconciliation.isBalanced ? 'success' : 'warning'}
            />
          </div>
        </section>
        <section className="card card-pad dashboard-staff-card">
          <div className="card-title-row">
            <div>
              <h3 id="revenue-by-staff-title" className="card-title">
                Revenue by staff
              </h3>
              <p>
                Assigned service revenue by specialist; tips are excluded. Bars show share of
                attributed revenue.
              </p>
            </div>
          </div>
          {staffRevenue.length ? (
            <div
              className="staff-revenue-chart"
              role="list"
              aria-labelledby="revenue-by-staff-title"
            >
              <div className="staff-revenue-summary">
                <div>
                  <span>Attributed service revenue</span>
                  <strong>{formatMoney(staffRevenueTotal)}</strong>
                </div>
                <div>
                  <span>Contributing staff</span>
                  <strong>{staffRevenue.length}</strong>
                </div>
              </div>
              <div className="staff-revenue-list">
                {staffRevenue.map((entry, index) => {
                  const share = staffRevenueTotal
                    ? Math.round((entry.revenue / staffRevenueTotal) * 100)
                    : 0;
                  return (
                    <article
                      className={`staff-revenue-row ${index === 0 ? 'is-leading' : ''}`}
                      key={entry.staffName}
                      role="listitem"
                      aria-label={`${entry.staffName}: ${formatMoney(entry.revenue)}, ${entry.count} completed appointments, ${share}% of staff-attributed revenue`}
                    >
                      <div className="staff-revenue-row-header">
                        <div className="staff-revenue-identity">
                          <InitialsAvatar
                            initials={formatStaffInitials(entry.staffName)}
                            tone={index === 0 ? 'orange' : 'blue'}
                          />
                          <div>
                            <strong>{entry.staffName}</strong>
                            <span>
                              {entry.count} completed appointment{entry.count === 1 ? '' : 's'}
                            </span>
                          </div>
                        </div>
                        <div className="staff-revenue-value">
                          <strong>{formatMoney(entry.revenue)}</strong>
                          <span>{share}% of attributed revenue</span>
                        </div>
                      </div>
                      <div className="staff-revenue-track" aria-hidden="true">
                        <span style={{ width: `${share}%` }} />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <span>No confirmed payments for this {periodName}.</span>
            </div>
          )}
        </section>
      </>
    );
  }

  function renderShopConfig() {
    return (
      <>
        <label className="shop-config-mobile-select">
          <span>Settings section</span>
          <select
            value={shopConfigSection}
            onChange={(event) => setShopConfigSection(event.target.value as ShopConfigSection)}
          >
            {shopConfigTabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </label>
        <nav className="shop-config-tabs" aria-label="Salon settings sections">
          {shopConfigTabs.map((tab) => {
            const Icon = tab.icon;
            const active = shopConfigSection === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                className={`shop-config-tab ${active ? 'active' : ''}`}
                aria-pressed={active}
                onClick={() => setShopConfigSection(tab.id)}
              >
                <Icon size={19} strokeWidth={1.9} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <p className="shop-config-scroll-hint">Swipe horizontally to see more settings sections</p>
        <div className="shop-config-tab-content">
          {shopConfigSection === 'general' ? <AdminShopConfig onToast={setToast} /> : null}
          {shopConfigSection === 'staff' ? (
            <AdminManagement kind="staff" currency={shop.currency} onToast={setToast} />
          ) : null}
          {shopConfigSection === 'services' ? (
            <AdminManagement kind="services" currency={shop.currency} onToast={setToast} />
          ) : null}
          {shopConfigSection === 'skills' ? (
            <AdminAccessManagement kind="skills" onToast={setToast} />
          ) : null}
          {shopConfigSection === 'skipReasons' ? <AdminSkipReasons onToast={setToast} /> : null}
          {shopConfigSection === 'accounts' ? (
            <AdminAccessManagement kind="accounts" onToast={setToast} />
          ) : null}
        </div>
      </>
    );
  }

  function renderSection() {
    if (section === 'overview') return renderOverview();
    if (section === 'queue')
      return (
        <QueueView
          appointments={appointments}
          onPayment={openPayment}
          onRepair={() => void repairQueue()}
          repairing={queueRepairing}
        />
      );
    if (section === 'appointments')
      return (
        <AppointmentsView
          appointments={reportAppointments}
          currency={shop.currency}
          timezone={shop.timezone}
          filter={appointmentFilter}
          reportPeriod={reportPeriod}
          reportDate={reportDate}
          reportMonth={reportMonth}
          refreshToken={dataRevision}
          onFilterChange={setAppointmentFilter}
          onPayment={openPayment}
          onAction={openAppointmentAction}
          onChanged={(message) => {
            if (message) setToast(message);
            void refresh();
          }}
        />
      );
    if (section === 'payments')
      return (
        <PaymentsView
          appointments={appointments}
          currency={shop.currency}
          businessDate={reportDate}
          businessMonth={reportMonth}
          refreshToken={dataRevision}
          onPayment={openPayment}
          onChanged={() => refresh()}
        />
      );
    if (section === 'config') return renderShopConfig();
    if (section === 'attendance' || section === 'customers')
      return <AdminManagement kind={section} currency={shop.currency} onToast={setToast} />;
    return null;
  }

  return (
    <main
      className={`admin-layout page-root ${section === 'config' ? 'admin-settings-context' : ''} ${section === 'payments' ? 'admin-payment-context' : ''}`}
    >
      <aside
        ref={mobileNavRef}
        className={`admin-sidebar ${mobileNavOpen ? 'is-mobile-open' : ''}`}
        role={mobileNavOpen ? 'dialog' : undefined}
        aria-modal={mobileNavOpen ? true : undefined}
        aria-label={mobileNavOpen ? 'Operations menu' : undefined}
      >
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Sparkles size={19} aria-hidden="true" />
          </span>
          <span className="brand-copy">
            Wellness Salon <small>Operations</small>
          </span>
        </Link>
        <nav id="admin-nav-panel" className="admin-nav" aria-label="Operations sections">
          <div className="admin-nav-label">Operations</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                className={`admin-nav-link ${section === item.id ? 'active' : ''}`}
                aria-current={section === item.id ? 'page' : undefined}
                onClick={() => navigateToSection(item.id)}
              >
                <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      {mobileNavOpen ? (
        <button
          type="button"
          className="admin-mobile-nav-scrim"
          aria-label="Close operations menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <section className="admin-main" inert={mobileNavOpen ? true : undefined}>
        <header className="admin-topbar">
          <div className="admin-topbar-title">
            <span className="admin-desktop-menu-icon" aria-hidden="true">
              <Menu size={20} className="muted" />
            </span>
            <button
              type="button"
              className="admin-mobile-menu-toggle"
              aria-label={mobileNavOpen ? 'Close operations menu' : 'Open operations menu'}
              aria-expanded={mobileNavOpen}
              aria-controls="admin-nav-panel"
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <h1>{navItems.find((item) => item.id === section)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <span className="admin-live-status" role="status" aria-live="polite">
              <span className="admin-live-dot" aria-hidden="true" />
              {lastUpdatedAt
                ? `Updated ${lastUpdatedAt.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: shop.timezone,
                  })} · ${shop.timezone}`
                : 'Connecting…'}
            </span>
            <button
              type="button"
              className="button button-outline button-sm admin-refresh-button"
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Refresh dashboard data"
            >
              <RefreshCcw size={17} aria-hidden="true" className={loading ? 'spin' : undefined} />
              <span>Refresh</span>
            </button>
            <Link className="button button-board-nav" href="/board" aria-label="Open queue board">
              <span className="nav-action-icon">
                <ClipboardList size={18} aria-hidden="true" />
              </span>
              <span>Queue board</span>
            </Link>
          </div>
          <AccountMenu viewer={accountViewer} callbackUrl="/admin/sign-in" />
        </header>
        {staleSince ? (
          <div className="admin-data-health-banner" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <span>
              Live data may be out of date
              {lastUpdatedAt
                ? ` · Last successful refresh ${lastUpdatedAt.toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZone: shop.timezone,
                  })}`
                : ''}
              .
            </span>
            <button
              type="button"
              className="button button-quiet button-sm"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          </div>
        ) : null}
        <div className="admin-content">{renderSection()}</div>
      </section>
      {paymentModal ? (
        <div className="modal-backdrop">
          <div
            className="modal payment-confirm-modal"
            ref={paymentDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-title"
          >
            <div className="modal-header">
              <div>
                <h2 id="payment-title">Confirm payment</h2>
                <p>
                  {paymentModal.code} · {paymentModal.customerName} · Service fee{' '}
                  {formatMoney(paymentModal.amount)}
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close payment dialog"
                onClick={closePayment}
              >
                <X size={19} aria-hidden="true" />
              </button>
            </div>
            <div className="field payment-method-field">
              <span id="payment-method-label" className="payment-method-label">
                Payment method
              </span>
              <div
                className="payment-method-options"
                role="group"
                aria-labelledby="payment-method-label"
              >
                <button
                  type="button"
                  className={`payment-method-option ${method === 'CASH' ? 'active' : ''}`}
                  aria-pressed={method === 'CASH'}
                  disabled={busy}
                  onClick={() => setMethod('CASH')}
                >
                  <Banknote size={20} aria-hidden="true" />
                  Cash
                </button>
                <button
                  type="button"
                  className={`payment-method-option ${method === 'CARD' ? 'active' : ''}`}
                  aria-pressed={method === 'CARD'}
                  disabled={busy}
                  onClick={() => setMethod('CARD')}
                >
                  <CreditCard size={20} aria-hidden="true" />
                  Card
                </button>
              </div>
            </div>
            <AmountKeypad
              id="payment-final-amount"
              value={paymentAmount}
              onChange={(value) => {
                setPaymentAmount(value);
                if (paymentFieldError?.field === 'amount') setPaymentFieldError(null);
              }}
              label={`Final amount (${shop.currency})`}
              hint={`Service fee is ${formatMoney(paymentModal.amount)}.`}
              currency={shop.currency}
              maxValue={100000}
              expandOnFocus
              disabled={busy}
              error={paymentFieldError?.field === 'amount' ? paymentFieldError.message : undefined}
            />
            {method === 'CARD' ? (
              <AmountKeypad
                id="payment-tip"
                value={tip}
                onChange={(value) => {
                  setTip(value);
                  if (paymentFieldError?.field === 'tip') setPaymentFieldError(null);
                }}
                label="Tip from card terminal"
                hint="Enter the tip confirmed on the card terminal."
                currency={shop.currency}
                quickValues={[{ label: 'No tip', value: '' }, ...cardTipQuickValues]}
                maxValue={100000}
                expandOnFocus
                disabled={busy}
                error={paymentFieldError?.field === 'tip' ? paymentFieldError.message : undefined}
              />
            ) : (
              <AmountKeypad
                id="payment-tip"
                value={tip}
                onChange={(value) => {
                  setTip(value);
                  if (paymentFieldError?.field === 'tip') setPaymentFieldError(null);
                }}
                label={`Tip (${shop.currency})`}
                hint="Optional. Recorded separately from the service amount."
                currency={shop.currency}
                quickValues={[{ label: 'No tip', value: '' }]}
                maxValue={100000}
                expandOnFocus
                disabled={busy}
                error={paymentFieldError?.field === 'tip' ? paymentFieldError.message : undefined}
              />
            )}
            {method === 'CASH' ? (
              <AmountKeypad
                id="payment-cash-received"
                value={cashReceived}
                onChange={(value) => {
                  setCashReceived(value);
                  if (paymentFieldError?.field === 'cash') setPaymentFieldError(null);
                }}
                label="Cash received from customer"
                hint="Enter the cash handed over, or use Exact amount."
                currency={shop.currency}
                quickValues={[{ label: 'Exact amount', value: currentPaymentTotal.toFixed(2) }]}
                maxValue={100000}
                expandOnFocus
                disabled={busy}
                error={paymentFieldError?.field === 'cash' ? paymentFieldError.message : undefined}
              />
            ) : null}
            <PaymentPreview
              amount={paymentAmount}
              tip={tip}
              method={method}
              cashReceived={cashReceived}
              currency={shop.currency}
            />
            <p className="field-hint" style={{ marginTop: 12 }}>
              Payment is recorded here after the collection is complete. Card details are never
              stored in the app.
            </p>
            <div className="form-actions">
              <button type="button" className="button button-quiet" onClick={closePayment}>
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={busy || cashReceivedIsShort}
                onClick={confirmPayment}
              >
                {busy ? 'Confirming…' : 'Confirm & complete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {appointmentAction ? (
        <AdminAppointmentAction
          appointment={appointmentAction.appointment}
          mode={appointmentAction.mode}
          currency={shop.currency}
          onClose={() => setAppointmentAction(null)}
          onComplete={(message) => {
            setAppointmentAction(null);
            setToast(message);
            void refresh();
          }}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <CheckCircle2 size={17} aria-hidden="true" />
          {toast}
        </div>
      ) : null}
    </main>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  meta,
  tone,
  onClick,
  actionLabel,
  actionHint,
}: {
  icon: typeof CircleDollarSign;
  label: string;
  value: string;
  meta: string;
  tone: 'blue' | 'teal' | 'orange' | 'slate';
  onClick?: () => void;
  actionLabel?: string;
  actionHint?: string;
}) {
  const cardClassName = `card kpi-card kpi-tone-${tone}${onClick ? ' kpi-card-action' : ''}`;
  const content = (
    <>
      <div className="kpi-label">
        <span>{label}</span>
        <span
          className={`kpi-icon ${tone === 'teal' ? 'avatar-teal' : tone === 'orange' ? 'avatar-orange' : tone === 'slate' ? 'avatar-slate' : ''}`}
        >
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>
      <strong className="kpi-value">{value}</strong>
      <span className="kpi-meta">{meta}</span>
      {actionHint ? (
        <span className="kpi-action-hint">
          {actionHint}
          <ChevronRight size={14} aria-hidden="true" />
        </span>
      ) : null}
    </>
  );
  return onClick ? (
    <button type="button" className={cardClassName} onClick={onClick} aria-label={actionLabel}>
      {content}
    </button>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
}
function PaymentPreview({
  amount,
  tip,
  method,
  cashReceived,
  currency,
}: {
  amount: string;
  tip: string;
  method: 'CARD' | 'CASH';
  cashReceived: string;
  currency: string;
}) {
  const parsedAmount = Number(amount);
  const safeAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? parsedAmount : 0;
  const parsedTip = tip.trim() ? Number(tip) : 0;
  const safeTip = Number.isFinite(parsedTip) && parsedTip >= 0 ? parsedTip : 0;
  const total = Number((safeAmount + safeTip).toFixed(2));
  const hasCashReceived = cashReceived.trim().length > 0;
  const parsedCashReceived = hasCashReceived ? Number(cashReceived) : total;
  const safeCashReceived =
    Number.isFinite(parsedCashReceived) && parsedCashReceived >= 0 ? parsedCashReceived : 0;
  const shortfall =
    method === 'CASH' && hasCashReceived && safeCashReceived < total ? total - safeCashReceived : 0;
  const change = method === 'CASH' && safeCashReceived >= total ? safeCashReceived - total : 0;
  return (
    <div className="payment-preview" aria-live="polite">
      <div>
        <span>Final amount</span>
        <strong>{formatAdminMoney(safeAmount, currency)}</strong>
      </div>
      <div>
        <span>Tip</span>
        <strong>{formatAdminMoney(safeTip, currency)}</strong>
      </div>
      <div className="payment-preview-total">
        <span>{method === 'CARD' ? 'Card total' : 'Total due'}</span>
        <strong>{formatAdminMoney(total, currency)}</strong>
      </div>
      {method === 'CASH' ? (
        <>
          <div>
            <span>Cash received</span>
            <strong>
              {hasCashReceived ? formatAdminMoney(safeCashReceived, currency) : 'Exact amount'}
            </strong>
          </div>
          <div className={`payment-preview-total${shortfall > 0 ? ' payment-preview-short' : ''}`}>
            <span>{shortfall > 0 ? 'Still due' : 'Change'}</span>
            <strong>{formatAdminMoney(shortfall > 0 ? shortfall : change, currency)}</strong>
          </div>
        </>
      ) : null}
    </div>
  );
}
function formatAdminMoney(value: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
}
function formatStaffInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
function formatBusinessDateLabel(value: string) {
  if (!value) return 'selected date';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}
function formatBusinessMonthLabel(value: string) {
  if (!value) return 'selected month';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${value}-01T00:00:00Z`));
}
function formatReportPeriodLabel(report: Report) {
  return report.period === 'month'
    ? formatBusinessMonthLabel(report.businessMonth ?? report.periodLabel)
    : formatBusinessDateLabel(report.businessDate ?? report.periodLabel);
}

type DateNavigatorMode = 'day' | 'month';

function formatLocalPeriodValue(mode: DateNavigatorMode, value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  if (mode === 'month') return `${year}-${month}`;
  return `${year}-${month}-${String(value.getDate()).padStart(2, '0')}`;
}

function shiftPeriodValue(value: string, mode: DateNavigatorMode, amount: number) {
  if (!value) return value;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month) return value;
  const shifted = new Date(Date.UTC(year, month - 1, mode === 'day' ? day || 1 : 1));
  if (mode === 'month') shifted.setUTCMonth(shifted.getUTCMonth() + amount);
  else shifted.setUTCDate(shifted.getUTCDate() + amount);
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  if (mode === 'month') return `${shiftedYear}-${shiftedMonth}`;
  return `${shiftedYear}-${shiftedMonth}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function DateNavigator({
  id,
  mode,
  label,
  value,
  onChange,
  disabled,
  className = '',
}: {
  id: string;
  mode: DateNavigatorMode;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  className?: string;
}) {
  const today = formatLocalPeriodValue(mode);
  const periodLabel = mode === 'day' ? 'date' : 'month';
  const resetLabel = mode === 'day' ? 'Today' : 'This month';
  return (
    <div className={`date-filter${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{label}</label>
      <div className="date-filter-controls date-filter-navigator">
        <button
          type="button"
          className="date-filter-nav"
          onClick={() => onChange(shiftPeriodValue(value || today, mode, -1))}
          disabled={disabled || !value}
          aria-label={`Previous ${periodLabel}`}
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <input
          id={id}
          type={mode === 'day' ? 'date' : 'month'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          disabled={disabled}
        />
        <button
          type="button"
          className="date-filter-nav"
          onClick={() => onChange(shiftPeriodValue(value || today, mode, 1))}
          disabled={disabled || !value}
          aria-label={`Next ${periodLabel}`}
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
        {value && value !== today ? (
          <button
            type="button"
            className="date-filter-today"
            onClick={() => onChange(today)}
            disabled={disabled}
            aria-label={`Use ${resetLabel}`}
          >
            {resetLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReportPeriodFilter({
  period,
  date,
  month,
  onPeriodChange,
  onDateChange,
  onMonthChange,
  loading,
}: {
  period: ReportPeriod;
  date: string;
  month: string;
  onPeriodChange: (period: ReportPeriod) => void;
  onDateChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  loading: boolean;
}) {
  const isDay = period === 'day';
  const value = isDay ? date : month;
  const periodValueLabel = value
    ? isDay
      ? formatBusinessDateLabel(value)
      : formatBusinessMonthLabel(value)
    : isDay
      ? 'selected date'
      : 'selected month';
  return (
    <div
      className="dashboard-report-filter"
      role="group"
      aria-labelledby="dashboard-report-filter-title"
      aria-busy={loading}
    >
      <div className="dashboard-filter-header">
        <div>
          <span className="dashboard-filter-kicker">Report filters</span>
          <strong id="dashboard-report-filter-title">Choose a reporting period</strong>
        </div>
        <span className="dashboard-filter-live-status">
          <span className="dashboard-filter-live-dot" aria-hidden="true" />
          Live operations: Today only
        </span>
      </div>
      <div className="dashboard-filter-body">
        <div className="dashboard-filter-field dashboard-filter-period">
          <span className="dashboard-filter-field-label">Period</span>
          <div className="period-toggle" role="group" aria-label="Report period">
            <button
              type="button"
              className={`button button-sm ${isDay ? 'active' : ''}`}
              onClick={() => onPeriodChange('day')}
              aria-pressed={isDay}
              disabled={loading}
            >
              Day
            </button>
            <button
              type="button"
              className={`button button-sm ${!isDay ? 'active' : ''}`}
              onClick={() => onPeriodChange('month')}
              aria-pressed={!isDay}
              disabled={loading}
            >
              Month
            </button>
          </div>
        </div>
        <DateNavigator
          id={isDay ? 'business-date' : 'business-month'}
          mode={isDay ? 'day' : 'month'}
          label={isDay ? 'Business date' : 'Business month'}
          value={value}
          onChange={(nextValue) => (isDay ? onDateChange(nextValue) : onMonthChange(nextValue))}
          disabled={loading}
          className="dashboard-filter-date"
        />
        <div className="dashboard-filter-summary" role="status" aria-live="polite">
          <span>Showing</span>
          <strong>
            {isDay ? 'Day' : 'Month'} · {periodValueLabel}
          </strong>
        </div>
      </div>
    </div>
  );
}
function AppointmentPeriodFilter({
  mode,
  date,
  month,
  from,
  to,
  onModeChange,
  onDateChange,
  onMonthChange,
  onFromChange,
  onToChange,
  loading,
  error,
}: {
  mode: AppointmentDateMode;
  date: string;
  month: string;
  from: string;
  to: string;
  onModeChange: (mode: AppointmentDateMode) => void;
  onDateChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  loading: boolean;
  error: string;
}) {
  const isDay = mode === 'DAY';
  return (
    <div className="report-period-filter appointment-period-filter">
      <div className="period-toggle" role="group" aria-label="Appointment date scope">
        <button
          type="button"
          className={`button button-sm ${isDay ? 'active' : ''}`}
          onClick={() => onModeChange('DAY')}
          aria-pressed={isDay}
          disabled={loading}
        >
          Day
        </button>
        <button
          type="button"
          className={`button button-sm ${mode === 'MONTH' ? 'active' : ''}`}
          onClick={() => onModeChange('MONTH')}
          aria-pressed={mode === 'MONTH'}
          disabled={loading}
        >
          Month
        </button>
        <button
          type="button"
          className={`button button-sm ${mode === 'RANGE' ? 'active' : ''}`}
          onClick={() => onModeChange('RANGE')}
          aria-pressed={mode === 'RANGE'}
          disabled={loading}
        >
          Range
        </button>
      </div>
      {mode === 'RANGE' ? (
        <div className="appointment-range-filter">
          <div className="date-filter">
            <label htmlFor="appointment-from">From</label>
            <div className="date-filter-controls">
              <input
                id="appointment-from"
                type="date"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
          <div className="date-filter">
            <label htmlFor="appointment-to">To</label>
            <div className="date-filter-controls">
              <input
                id="appointment-to"
                type="date"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
        </div>
      ) : (
        <DateNavigator
          id={isDay ? 'appointment-date' : 'appointment-month'}
          mode={isDay ? 'day' : 'month'}
          label={isDay ? 'Business date' : 'Business month'}
          value={isDay ? date : month}
          onChange={(nextValue) => (isDay ? onDateChange(nextValue) : onMonthChange(nextValue))}
          disabled={loading}
        />
      )}
      {loading ? (
        <span className="subtle appointment-date-loading" role="status" aria-live="polite">
          Loading…
        </span>
      ) : null}
      {error ? (
        <small className="form-error appointment-period-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
function PaymentHistoryPeriodFilter({
  mode,
  date,
  month,
  from,
  to,
  onModeChange,
  onDateChange,
  onMonthChange,
  onFromChange,
  onToChange,
  loading,
  error,
}: {
  mode: AppointmentDateMode;
  date: string;
  month: string;
  from: string;
  to: string;
  onModeChange: (mode: AppointmentDateMode) => void;
  onDateChange: (value: string) => void;
  onMonthChange: (value: string) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  loading: boolean;
  error: string;
}) {
  const isDay = mode === 'DAY';
  return (
    <div className="report-period-filter appointment-period-filter payment-history-period-filter">
      <div className="period-toggle" role="group" aria-label="Payment history date scope">
        <button
          type="button"
          className={`button button-sm ${isDay ? 'active' : ''}`}
          onClick={() => onModeChange('DAY')}
          aria-pressed={isDay}
          disabled={loading}
        >
          Day
        </button>
        <button
          type="button"
          className={`button button-sm ${mode === 'MONTH' ? 'active' : ''}`}
          onClick={() => onModeChange('MONTH')}
          aria-pressed={mode === 'MONTH'}
          disabled={loading}
        >
          Month
        </button>
        <button
          type="button"
          className={`button button-sm ${mode === 'RANGE' ? 'active' : ''}`}
          onClick={() => onModeChange('RANGE')}
          aria-pressed={mode === 'RANGE'}
          disabled={loading}
        >
          Range
        </button>
      </div>
      {mode === 'RANGE' ? (
        <div className="appointment-range-filter">
          <div className="date-filter">
            <label htmlFor="payment-history-from">From</label>
            <div className="date-filter-controls">
              <input
                id="payment-history-from"
                type="date"
                value={from}
                onChange={(event) => onFromChange(event.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
          <div className="date-filter">
            <label htmlFor="payment-history-to">To</label>
            <div className="date-filter-controls">
              <input
                id="payment-history-to"
                type="date"
                value={to}
                onChange={(event) => onToChange(event.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>
        </div>
      ) : (
        <DateNavigator
          id={isDay ? 'payment-history-date' : 'payment-history-month'}
          mode={isDay ? 'day' : 'month'}
          label={isDay ? 'Payment date' : 'Payment month'}
          value={isDay ? date : month}
          onChange={(nextValue) => (isDay ? onDateChange(nextValue) : onMonthChange(nextValue))}
          disabled={loading}
        />
      )}
      {error ? (
        <small className="form-error appointment-period-error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
function MonthlyTrendCard({ trend, currency }: { trend: ReportTrendPoint[]; currency: string }) {
  const maxRevenue = Math.max(...trend.map((point) => point.revenue), 1);
  const totalRevenue = trend.reduce((total, point) => total + point.revenue, 0);
  const activeDays = trend.filter((point) => point.revenue > 0).length;
  const averageDailyRevenue = activeDays ? totalRevenue / activeDays : 0;
  const peakPoint = trend.reduce<ReportTrendPoint | null>(
    (peak, point) => (!peak || point.revenue > peak.revenue ? point : peak),
    null,
  );
  return (
    <section className="card card-pad monthly-trend-card">
      <div className="card-title-row">
        <div>
          <h3 id="monthly-trend-title" className="card-title">
            Monthly trend
          </h3>
          <p>Service revenue by business day.</p>
        </div>
        <StatusBadge
          label={`${activeDays} active day${activeDays === 1 ? '' : 's'}`}
          tone="neutral"
        />
      </div>
      {trend.length ? (
        <>
          <div className="monthly-trend-summary" aria-label="Monthly trend summary">
            <div>
              <span>Average / active day</span>
              <strong>{formatAdminMoney(averageDailyRevenue, currency)}</strong>
              <small>{formatAdminMoney(totalRevenue, currency)} across the month</small>
            </div>
            <div>
              <span>Peak day</span>
              <strong>{peakPoint ? formatAdminMoney(peakPoint.revenue, currency) : '—'}</strong>
              <small>{peakPoint ? formatBusinessDateLabel(peakPoint.date) : '—'}</small>
            </div>
            <div>
              <span>Active days</span>
              <strong>{activeDays}</strong>
              <small>with confirmed revenue</small>
            </div>
          </div>
          <div className="monthly-trend-plot">
            <div className="monthly-trend-y-axis" aria-hidden="true">
              <span>{formatAdminMoney(Math.round(maxRevenue), currency)}</span>
              <span>{formatAdminMoney(Math.round(maxRevenue / 2), currency)}</span>
              <span>{formatAdminMoney(0, currency)}</span>
            </div>
            <div className="monthly-trend-chart">
              <div className="monthly-trend-gridlines" aria-hidden="true" />
              <div className="monthly-trend" role="list" aria-labelledby="monthly-trend-title">
                {trend.map((point, index) => {
                  const dayNumber = new Date(`${point.date}T00:00:00Z`).getUTCDate();
                  const showDayLabel =
                    index === 0 || index === trend.length - 1 || dayNumber % 5 === 0;
                  return (
                    <div
                      className={`monthly-trend-column ${point.revenue > 0 ? 'has-revenue' : 'is-empty'}`}
                      key={point.date}
                      role="listitem"
                      aria-label={`${formatBusinessDateLabel(point.date)}: ${formatAdminMoney(point.revenue, currency)}, ${point.completedCount} completed appointments`}
                      title={`${formatBusinessDateLabel(point.date)} · ${formatAdminMoney(point.revenue, currency)} · ${point.completedCount} completed appointments`}
                    >
                      <div className="monthly-trend-bar-track" aria-hidden="true">
                        <div
                          className="monthly-trend-bar"
                          style={{
                            height: `${point.revenue > 0 ? Math.max((point.revenue / maxRevenue) * 100, 5) : 0}%`,
                          }}
                        />
                      </div>
                      <small aria-hidden={!showDayLabel}>{showDayLabel ? dayNumber : ''}</small>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <span>No appointment activity for this business month.</span>
        </div>
      )}
    </section>
  );
}
function QueueView({
  appointments,
  onPayment,
  onRepair,
  repairing,
}: {
  appointments: Appointment[];
  onPayment: (appointment: Appointment) => void;
  onRepair: () => void;
  repairing: boolean;
}) {
  return (
    <>
      <SectionHeader
        eyebrow="Today"
        title="Queue"
        description="Active appointments from check-in through payment."
        action={
          <button
            type="button"
            className="button button-outline button-sm"
            onClick={onRepair}
            disabled={repairing}
          >
            <RefreshCcw size={15} aria-hidden="true" className={repairing ? 'spin' : undefined} />
            {repairing ? 'Checking…' : 'Re-check assignments'}
          </button>
        }
      />
      <div className="card card-pad">
        <div className="admin-table-wrap">
          <table className="admin-table queue-table">
            <thead>
              <tr>
                <th>Turn</th>
                <th>Customer</th>
                <th>Services</th>
                <th>Assigned</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {appointments
                .filter((appointment) => !['COMPLETED', 'CANCELLED'].includes(appointment.status))
                .map((appointment) => {
                  const services = appointment.services.length
                    ? appointment.services
                    : [
                        {
                          id: `${appointment.id}-service`,
                          sequence: 1,
                          serviceName: appointment.serviceName,
                          durationMin: appointment.durationMin,
                          amount: appointment.amount,
                          status: appointment.status,
                          primaryStaff: appointment.primaryStaff,
                        },
                      ];
                  const totalDuration = services.reduce(
                    (total, service) => total + service.durationMin,
                    0,
                  );
                  return (
                    <tr key={appointment.id}>
                      <td data-label="Appointment">
                        <strong>{appointment.code}</strong>
                      </td>
                      <td data-label="Customer">
                        <div className="table-customer">
                          <InitialsAvatar
                            initials={appointment.customerName
                              .split(' ')
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)}
                            tone="slate"
                          />
                          <div>
                            <strong>{appointment.customerName}</strong>
                            <small>{appointment.phone}</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Services">
                        <div className="queue-table-service-list">
                          {services.map((service) => (
                            <div className="queue-table-service-row" key={service.id}>
                              <strong>
                                {service.sequence}. {service.serviceName}
                              </strong>
                              <small>{service.durationMin} min</small>
                            </div>
                          ))}
                        </div>
                        <span className="table-note">
                          {services.length} service{services.length === 1 ? '' : 's'} ·{' '}
                          {totalDuration} min total
                        </span>
                      </td>
                      <td data-label="Assigned">
                        {appointment.primaryStaff ? (
                          <div className="assigned-staff">
                            <InitialsAvatar
                              initials={appointment.primaryStaff.initials}
                              tone="blue"
                            />
                            <div className="assigned-staff-copy">
                              <strong>{appointment.primaryStaff.name}</strong>
                              <small>Assigned specialist</small>
                            </div>
                          </div>
                        ) : (
                          <span className="subtle">Unassigned</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <StatusBadge
                          label={appointment.status.replace('_', ' ')}
                          tone={
                            appointment.status === 'IN_SERVICE'
                              ? 'blue'
                              : appointment.status === 'PAYMENT_PENDING'
                                ? 'warning'
                                : 'neutral'
                          }
                        />
                      </td>
                      <td data-label="Actions">
                        {!appointment.payment && isPaymentReadyForAdminAppointment(appointment) ? (
                          <button
                            className="button button-primary button-sm"
                            onClick={() => onPayment(appointment)}
                          >
                            Payment
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
function AppointmentsView({
  appointments,
  currency,
  timezone,
  filter,
  reportPeriod,
  reportDate,
  reportMonth,
  refreshToken,
  onFilterChange,
  onPayment,
  onAction,
  onChanged,
}: {
  appointments: Appointment[];
  currency: string;
  timezone: string;
  filter: AppointmentFilter;
  reportPeriod: ReportPeriod;
  reportDate: string;
  reportMonth: string;
  refreshToken: number;
  onFilterChange: (filter: AppointmentFilter) => void;
  onPayment: (appointment: Appointment) => void;
  onAction: (
    appointment: Appointment,
    mode: 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION',
  ) => void;
  onChanged: (message?: string) => void;
}) {
  const [rows, setRows] = useState(appointments);
  const [status, setStatus] = useState<AppointmentStatusFilter>(
    filter === 'COMPLETED' ? 'COMPLETED' : 'ALL',
  );
  const [payment, setPayment] = useState<'ALL' | 'PAID' | 'UNPAID'>('ALL');
  const [staffId, setStaffId] = useState('ALL');
  const [serviceId, setServiceId] = useState('ALL');
  const [serviceStatus, setServiceStatus] = useState('ALL');
  const [serviceCount, setServiceCount] = useState<'ALL' | 'SINGLE' | 'MULTI'>('ALL');
  const [sort, setSort] = useState<'NEWEST' | 'OLDEST' | 'AMOUNT_DESC' | 'DURATION_DESC'>('NEWEST');
  const [search, setSearch] = useState('');
  const [dateMode, setDateMode] = useState<AppointmentDateMode>(
    reportPeriod === 'month' ? 'MONTH' : 'DAY',
  );
  const [dateValue, setDateValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [monthValue, setMonthValue] = useState(reportMonth || new Date().toISOString().slice(0, 7));
  const [fromValue, setFromValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [toValue, setToValue] = useState(reportDate || new Date().toISOString().slice(0, 10));
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [pagination, setPagination] = useState<AppointmentPageMeta>({
    page: 1,
    pageSize: 25,
    total: appointments.length,
    totalPages: 1,
  });
  const [summary, setSummary] = useState<AppointmentSummary>({ totalRevenue: 0, totalDuration: 0 });
  const [filterOptions, setFilterOptions] = useState<AppointmentFilterOptions>({
    staff: [],
    services: [],
  });
  const [historyAppointment, setHistoryAppointment] = useState<Appointment | null>(null);
  const dateRequestRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const lastRefreshTokenRef = useRef(refreshToken);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  const staffOptions = filterOptions.staff.length
    ? filterOptions.staff
    : [
        ...new Map(
          rows
            .flatMap((appointment) => [
              appointment.primaryStaff,
              ...appointment.services.map((service) => service.primaryStaff),
            ])
            .filter((staff): staff is NonNullable<typeof staff> => Boolean(staff))
            .map((staff) => [staff.id, { id: staff.id, name: staff.name }]),
        ).values(),
      ].sort((left, right) => left.name.localeCompare(right.name));
  const serviceOptions = filterOptions.services.length
    ? filterOptions.services
    : [
        ...new Map(
          rows
            .flatMap((appointment) =>
              appointment.services.length
                ? appointment.services.map((service) => ({
                    id: service.serviceId,
                    name: service.serviceName,
                  }))
                : [{ id: appointment.serviceId, name: appointment.serviceName }],
            )
            .map((service) => [service.id, service]),
        ).values(),
      ].sort((left, right) => left.name.localeCompare(right.name));
  const activeFilterCount = [
    search,
    status !== 'ALL' ? status : '',
    payment !== 'ALL' ? payment : '',
    staffId !== 'ALL' ? staffId : '',
    serviceId !== 'ALL' ? serviceId : '',
    serviceStatus !== 'ALL' ? serviceStatus : '',
    serviceCount !== 'ALL' ? serviceCount : '',
    sort !== 'NEWEST' ? sort : '',
  ].filter(Boolean).length;
  const activeAdvancedFilterCount = [
    staffId !== 'ALL' ? staffId : '',
    serviceId !== 'ALL' ? serviceId : '',
    serviceStatus !== 'ALL' ? serviceStatus : '',
    serviceCount !== 'ALL' ? serviceCount : '',
    sort !== 'NEWEST' ? sort : '',
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch('');
    setStatus('ALL');
    onFilterChange('ALL');
    setPayment('ALL');
    setStaffId('ALL');
    setServiceId('ALL');
    setServiceStatus('ALL');
    setServiceCount('ALL');
    setSort('NEWEST');
    setShowAdvancedFilters(false);
  }
  function buildQuery(page: number) {
    const params = new URLSearchParams();
    if (dateMode === 'MONTH') params.set('month', monthValue);
    else if (dateMode === 'RANGE') {
      params.set('from', fromValue);
      params.set('to', toValue);
    } else params.set('date', dateValue);
    params.set('page', String(page));
    params.set('pageSize', '25');
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'ALL') params.set('status', status);
    if (payment !== 'ALL') params.set('payment', payment);
    if (staffId !== 'ALL') params.set('staffId', staffId);
    if (serviceId !== 'ALL') params.set('serviceId', serviceId);
    if (serviceStatus !== 'ALL') params.set('serviceStatus', serviceStatus);
    if (serviceCount !== 'ALL') params.set('serviceCount', serviceCount);
    if (sort !== 'NEWEST') params.set('sort', sort);
    return params.toString();
  }

  async function loadPage(requestedPage = 1) {
    if (dateMode === 'RANGE' && (!fromValue || !toValue || fromValue > toValue)) {
      setDateError('Choose a valid date range.');
      return;
    }
    const requestId = dateRequestRef.current + 1;
    dateRequestRef.current = requestId;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setDateLoading(true);
    setDateError('');
    try {
      const response = await fetch(`/api/admin/appointments?${buildQuery(requestedPage)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load appointments');
      if (requestId !== dateRequestRef.current) return;
      setRows(payload.appointments ?? []);
      setPagination(
        payload.pagination ?? {
          page: 1,
          pageSize: 25,
          total: payload.appointments?.length ?? 0,
          totalPages: 1,
        },
      );
      setSummary(payload.summary ?? { totalRevenue: 0, totalDuration: 0 });
      setFilterOptions(payload.filterOptions ?? { staff: [], services: [] });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === dateRequestRef.current)
        setDateError(error instanceof Error ? error.message : 'Unable to load appointments');
    } finally {
      if (requestId === dateRequestRef.current) setDateLoading(false);
    }
  }
  useEffect(() => {
    const shouldLoad =
      dateMode === 'DAY'
        ? Boolean(dateValue)
        : dateMode === 'MONTH'
          ? Boolean(monthValue)
          : Boolean(fromValue && toValue && fromValue <= toValue);
    // This effect intentionally starts the external history request when scope or filters change.
    if (!shouldLoad) return;
    const timer = window.setTimeout(
      () => {
        void loadPage(1);
      },
      search ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
    // The date inputs and server-backed filters are the deliberate triggers for this local history query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dateMode,
    dateValue,
    monthValue,
    fromValue,
    toValue,
    search,
    status,
    payment,
    staffId,
    serviceId,
    serviceStatus,
    serviceCount,
    sort,
  ]);
  useEffect(() => {
    if (refreshToken === 0 || refreshToken === lastRefreshTokenRef.current) return;
    lastRefreshTokenRef.current = refreshToken;
    void loadPage(pagination.page);
    // Parent refreshes are a deliberate signal after mutations or polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);
  function updateStatus(value: string) {
    const next = value as AppointmentStatusFilter;
    setStatus(next);
    if (next === 'COMPLETED' || filter === 'COMPLETED')
      onFilterChange(next === 'COMPLETED' ? 'COMPLETED' : 'ALL');
  }
  function changeDateMode(next: AppointmentDateMode) {
    setDateMode(next);
    setDateError('');
  }

  return (
    <>
      <PastUnresolvedPanel
        currency={currency}
        refreshToken={refreshToken}
        onPayment={onPayment}
        onHistory={setHistoryAppointment}
        onChanged={onChanged}
      />
      <SectionHeader
        eyebrow="History"
        title="Appointments"
        description="Review appointments and filter single- or multi-service visits."
        action={
          <AppointmentPeriodFilter
            mode={dateMode}
            date={dateValue}
            month={monthValue}
            from={fromValue}
            to={toValue}
            onModeChange={changeDateMode}
            onDateChange={(value) => {
              setDateValue(value);
              setDateError('');
            }}
            onMonthChange={(value) => {
              setMonthValue(value);
              setDateError('');
            }}
            onFromChange={(value) => {
              setFromValue(value);
              setDateError('');
            }}
            onToChange={(value) => {
              setToValue(value);
              setDateError('');
            }}
            loading={dateLoading}
            error={dateError}
          />
        }
      />
      <div className="card card-pad appointment-history-card">
        <div className="appointment-filter-panel">
          <div className="appointment-filter-grid">
            <div className="field appointment-search-field">
              <label htmlFor="appointment-search">Search</label>
              <div className="input-with-icon">
                <Search size={16} aria-hidden="true" />
                <input
                  id="appointment-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Code, customer, phone"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="appointment-status">Appointment status</label>
              <select
                id="appointment-status"
                value={status}
                onChange={(event) => updateStatus(event.target.value)}
              >
                <option value="ALL">All statuses</option>
                {[
                  'CREATED',
                  'WAITING',
                  'ASSIGNED',
                  'IN_SERVICE',
                  'PAYMENT_PENDING',
                  'COMPLETED',
                  'CANCELLED',
                ].map((value) => (
                  <option key={value} value={value}>
                    {value.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="appointment-payment">Payment</label>
              <select
                id="appointment-payment"
                value={payment}
                onChange={(event) => setPayment(event.target.value as typeof payment)}
              >
                <option value="ALL">All payments</option>
                <option value="PAID">Paid</option>
                <option value="UNPAID">Unpaid / pending</option>
              </select>
            </div>
          </div>
          <div className="appointment-filter-advanced-toolbar">
            <button
              type="button"
              className="button button-quiet button-sm"
              aria-expanded={showAdvancedFilters}
              onClick={() => setShowAdvancedFilters((current) => !current)}
            >
              <SlidersHorizontal size={15} aria-hidden="true" />
              {showAdvancedFilters ? 'Hide filters' : 'More filters'}
              {activeAdvancedFilterCount ? (
                <span
                  className="filter-count"
                  aria-label={`${activeAdvancedFilterCount} advanced filters active`}
                >
                  {activeAdvancedFilterCount}
                </span>
              ) : null}
            </button>
          </div>
          {showAdvancedFilters || activeAdvancedFilterCount ? (
            <div className="appointment-filter-advanced">
              <div className="appointment-filter-grid appointment-filter-grid-secondary">
                <div className="field">
                  <label htmlFor="appointment-staff">Staff</label>
                  <select
                    id="appointment-staff"
                    value={staffId}
                    onChange={(event) => setStaffId(event.target.value)}
                  >
                    <option value="ALL">All staff</option>
                    <option value="UNASSIGNED">Unassigned</option>
                    {staffOptions.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appointment-service">Service</label>
                  <select
                    id="appointment-service"
                    value={serviceId}
                    onChange={(event) => setServiceId(event.target.value)}
                  >
                    <option value="ALL">All services</option>
                    {serviceOptions.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appointment-service-status">Service status</label>
                  <select
                    id="appointment-service-status"
                    value={serviceStatus}
                    onChange={(event) => setServiceStatus(event.target.value)}
                  >
                    <option value="ALL">Any service status</option>
                    {[
                      'CREATED',
                      'WAITING',
                      'ASSIGNED',
                      'IN_SERVICE',
                      'PAYMENT_PENDING',
                      'COMPLETED',
                      'CANCELLED',
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appointment-count">Service count</label>
                  <select
                    id="appointment-count"
                    value={serviceCount}
                    onChange={(event) => setServiceCount(event.target.value as typeof serviceCount)}
                  >
                    <option value="ALL">Single or multi</option>
                    <option value="SINGLE">Single service</option>
                    <option value="MULTI">Multi-service</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="appointment-sort">Sort by</label>
                  <select
                    id="appointment-sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value as typeof sort)}
                  >
                    <option value="NEWEST">Newest first</option>
                    <option value="OLDEST">Oldest first</option>
                    <option value="AMOUNT_DESC">Highest amount</option>
                    <option value="DURATION_DESC">Longest duration</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}
          <div className="appointment-filter-footer">
            <div className="appointment-summary">
              <strong>{pagination.total}</strong> matching ·{' '}
              <strong>{formatAdminMoney(summary.totalRevenue, currency)}</strong> revenue ·{' '}
              <strong>{summary.totalDuration} min</strong> booked
            </div>
            <div className="appointment-filter-actions">
              <span className="subtle">
                <SlidersHorizontal size={14} aria-hidden="true" />
                {activeFilterCount ? `${activeFilterCount} filters active` : 'No filters applied'}
              </span>
              {activeFilterCount ? (
                <button
                  type="button"
                  className="button button-quiet button-sm"
                  onClick={clearFilters}
                >
                  <X size={15} aria-hidden="true" />
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
        {rows.length ? (
          <div className="admin-table-wrap" aria-busy={dateLoading}>
            <table className="admin-table appointment-table">
              <thead>
                <tr>
                  <th>Appointment</th>
                  <th>Customer</th>
                  <th>Services</th>
                  <th>Assigned</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((appointment) => {
                  const services = appointment.services.length
                    ? appointment.services
                    : [
                        {
                          id: `${appointment.id}-service`,
                          serviceId: appointment.serviceId,
                          sequence: 1,
                          serviceName: appointment.serviceName,
                          durationMin: appointment.durationMin,
                          amount: appointment.amount,
                          status: appointment.status,
                          primaryStaff: appointment.primaryStaff,
                          turnExclusions: [],
                        },
                      ];
                  const duration = services.reduce(
                    (total, service) => total + service.durationMin,
                    0,
                  );
                  const hasEditableService = services.some(
                    (service) => !['COMPLETED', 'CANCELLED'].includes(service.status),
                  );
                  const canChangeService =
                    hasEditableService &&
                    !['PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].includes(appointment.status);
                  const canReassign = services.some((service) =>
                    ['WAITING', 'ASSIGNED'].includes(service.status),
                  );
                  const hasExclusion = services.some(
                    (service) => service.turnExclusions.length > 0,
                  );
                  const canCancel = !['PAYMENT_PENDING', 'COMPLETED', 'CANCELLED'].includes(
                    appointment.status,
                  );
                  const hasPendingPayment =
                    !appointment.payment && isPaymentReadyForAdminAppointment(appointment);
                  return (
                    <tr key={appointment.id}>
                      <td data-label="Appointment">
                        <strong>{appointment.code}</strong>
                        <span className="table-note">
                          {appointment.turns.length} activity record
                          {appointment.turns.length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td data-label="Customer">
                        <div className="table-customer">
                          <InitialsAvatar
                            initials={appointment.customerName
                              .split(' ')
                              .map((part) => part[0])
                              .join('')
                              .slice(0, 2)}
                            tone="slate"
                          />
                          <div>
                            <strong>{appointment.customerName}</strong>
                            <small>{appointment.phone}</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Services">
                        <div className="history-service-list">
                          {services.map((service) => (
                            <div key={service.id}>
                              <strong>
                                {service.sequence}. {service.serviceName}
                              </strong>
                              <small className="table-note">
                                {service.durationMin} min · {service.status.replace('_', ' ')}
                                {service.turnExclusions.length
                                  ? ` · ${service.turnExclusions.length} skip exclusion${service.turnExclusions.length === 1 ? '' : 's'}`
                                  : ''}
                              </small>
                            </div>
                          ))}
                        </div>
                        <span className="table-note">
                          {services.length} service{services.length === 1 ? '' : 's'} · {duration}{' '}
                          min total
                        </span>
                      </td>
                      <td data-label="Assigned">
                        {appointment.primaryStaff ? (
                          <div className="assigned-staff">
                            <InitialsAvatar
                              initials={appointment.primaryStaff.initials}
                              tone="blue"
                            />
                            <div className="assigned-staff-copy">
                              <strong>{appointment.primaryStaff.name}</strong>
                              <small>Primary assignment</small>
                            </div>
                          </div>
                        ) : (
                          <span className="subtle">Unassigned</span>
                        )}
                      </td>
                      <td data-label="Created" className="subtle">
                        {formatAppointmentDateTime(appointment.createdAt)}
                      </td>
                      <td data-label="Status">
                        <StatusBadge
                          label={appointment.status.replace('_', ' ')}
                          tone={
                            appointment.status === 'COMPLETED'
                              ? 'success'
                              : appointment.status === 'CANCELLED'
                                ? 'neutral'
                                : appointment.status === 'IN_SERVICE'
                                  ? 'blue'
                                  : appointment.status === 'PAYMENT_PENDING'
                                    ? 'warning'
                                    : 'neutral'
                          }
                        />
                      </td>
                      <td data-label="Amount">
                        <strong>{formatAdminMoney(appointment.amount, currency)}</strong>
                        <span className="table-note">
                          {appointment.payment ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td data-label="Actions">
                        <AppointmentActionMenu
                          appointmentCode={appointment.code}
                          hasPendingPayment={hasPendingPayment}
                          canCancel={canCancel}
                          canChangeService={canChangeService}
                          canReassign={canReassign}
                          hasExclusion={hasExclusion}
                          onHistory={() => setHistoryAppointment(appointment)}
                          onPayment={() => onPayment(appointment)}
                          onAction={(mode) => onAction(appointment, mode)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <CheckCircle2 size={28} aria-hidden="true" />
            <div>
              <strong>No appointments match</strong>
              <br />
              <span>Try another date or clear one of the filters.</span>
            </div>
          </div>
        )}
        {pagination.total > pagination.pageSize ? (
          <nav className="appointment-pagination" aria-label="Appointment history pagination">
            <span className="subtle">
              Showing {(pagination.page - 1) * pagination.pageSize + 1}–
              {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
              {pagination.total}
            </span>
            <div className="appointment-pagination-actions">
              <button
                type="button"
                className="button button-quiet button-sm"
                onClick={() => void loadPage(pagination.page - 1)}
                disabled={dateLoading || pagination.page <= 1}
                aria-label="Previous appointment page"
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Previous
              </button>
              <span className="subtle" aria-live="polite">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="button button-quiet button-sm"
                onClick={() => void loadPage(pagination.page + 1)}
                disabled={dateLoading || pagination.page >= pagination.totalPages}
                aria-label="Next appointment page"
              >
                Next
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </nav>
        ) : null}
      </div>
      {historyAppointment ? (
        <TurnHistoryModal
          appointment={historyAppointment}
          timezone={timezone}
          onClose={() => setHistoryAppointment(null)}
        />
      ) : null}
    </>
  );
}
type PastResolutionKind = 'UNSERVED' | 'ASSIGNMENT_GAP' | 'SERVICE_INTERRUPTED' | 'PAYMENT_REVIEW';
type PastUnresolvedItem = {
  appointment: Appointment;
  businessDate: string;
  daysOverdue: number;
  resolutionKind: PastResolutionKind;
  guidance: { label: string; description: string; actionLabel: string };
};
type PastUnresolvedPayload = {
  appointments: PastUnresolvedItem[];
  currentBusinessDate: string;
  hasMore: boolean;
  summary: {
    total: number;
    unserved: number;
    assignmentGap: number;
    serviceInterrupted: number;
    paymentReview: number;
  };
};
type HistoricalStaff = {
  id: string;
  name: string;
  isActive: boolean;
  status: string;
  availability: string;
};

function PastUnresolvedPanel({
  currency,
  refreshToken,
  onPayment,
  onHistory,
  onChanged,
}: {
  currency: string;
  refreshToken: number;
  onPayment: (appointment: Appointment) => void;
  onHistory: (appointment: Appointment) => void;
  onChanged: (message?: string) => void;
}) {
  const [payload, setPayload] = useState<PastUnresolvedPayload | null>(null);
  const [resolutionItem, setResolutionItem] = useState<PastUnresolvedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    void fetch('/api/admin/appointments/past-unresolved', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) =>
        parseAdminJsonResponse<PastUnresolvedPayload>(response, 'Unable to load past appointments'),
      )
      .then((nextPayload) => {
        if (!disposed) {
          setPayload(nextPayload);
          setError('');
        }
      })
      .catch((nextError: unknown) => {
        if (!disposed && !(nextError instanceof DOMException && nextError.name === 'AbortError'))
          setError(
            nextError instanceof Error ? nextError.message : 'Unable to load past appointments',
          );
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [refreshToken, reloadKey]);

  const summary = payload?.summary;
  const hasReviewItems = Boolean(summary?.total);
  const isUnavailable = Boolean(error && !payload);
  return (
    <section
      className="card card-pad past-unresolved-card"
      aria-labelledby="past-unresolved-title"
      aria-busy={loading}
    >
      <div className="past-unresolved-header">
        <div className="past-unresolved-heading">
          <span
            className={`past-unresolved-icon ${hasReviewItems || isUnavailable ? 'has-alert' : 'is-clear'}`}
          >
            {hasReviewItems || isUnavailable ? (
              <AlertCircle size={18} aria-hidden="true" />
            ) : (
              <CheckCircle2 size={18} aria-hidden="true" />
            )}
          </span>
          <div>
            <div className="eyebrow">Manager reconciliation</div>
            <h3 id="past-unresolved-title" className="card-title">
              Past appointments needing review
            </h3>
            <p>
              Historical records stay visible until a manager records what happened. Nothing is
              auto-cancelled or auto-completed.
            </p>
          </div>
        </div>
        <div
          className={`past-unresolved-total ${hasReviewItems || isUnavailable ? 'has-alert' : 'is-clear'}`}
        >
          {loading && !payload
            ? 'Loading…'
            : isUnavailable
              ? 'Unavailable'
              : `${summary?.total ?? 0} open`}
        </div>
      </div>

      {error ? (
        <div className="management-error past-unresolved-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="button button-quiet button-sm"
            onClick={() => setReloadKey((current) => current + 1)}
          >
            Retry
          </button>
        </div>
      ) : null}

      {isUnavailable ? (
        <div className="empty-state past-unresolved-empty" role="status">
          <AlertCircle size={28} aria-hidden="true" />
          <div>
            <strong>Historical review is unavailable</strong>
            <br />
            <span>Retry to load past appointments before making a reconciliation decision.</span>
          </div>
        </div>
      ) : summary?.total ? (
        <>
          <div className="past-unresolved-summary-grid" aria-label="Past appointment summary">
            <div className="past-unresolved-stat">
              <strong>{summary.total}</strong>
              <span>Total open</span>
            </div>
            <div className="past-unresolved-stat">
              <strong>{summary.unserved}</strong>
              <span>Unserved / waiting</span>
            </div>
            <div className="past-unresolved-stat">
              <strong>{summary.assignmentGap}</strong>
              <span>Assigned, not started</span>
            </div>
            <div className="past-unresolved-stat">
              <strong>{summary.serviceInterrupted}</strong>
              <span>Service interrupted</span>
            </div>
            <div className="past-unresolved-stat">
              <strong>{summary.paymentReview}</strong>
              <span>Payment pending</span>
            </div>
          </div>
          <div className="admin-table-wrap past-unresolved-table-wrap">
            <table className="admin-table past-unresolved-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Appointment</th>
                  <th>Assigned</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payload?.appointments.map((item) => {
                  const appointment = item.appointment;
                  const canCollectPayment =
                    item.resolutionKind === 'PAYMENT_REVIEW' &&
                    isPaymentReadyForAdminAppointment(appointment);
                  return (
                    <tr key={appointment.id}>
                      <td data-label="Date">
                        <strong>{item.businessDate}</strong>
                        <span className="table-note">
                          {item.daysOverdue} day{item.daysOverdue === 1 ? '' : 's'} overdue
                        </span>
                      </td>
                      <td data-label="Appointment">
                        <strong>{appointment.code}</strong>
                        <span className="table-note">
                          {appointment.customerName} · {appointment.serviceName}
                          {appointment.services.length > 1
                            ? ` + ${appointment.services.length - 1} more`
                            : ''}
                        </span>
                      </td>
                      <td data-label="Assigned">
                        {appointment.primaryStaff ? (
                          <span>{appointment.primaryStaff.name}</span>
                        ) : (
                          <span className="subtle">Unassigned</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <StatusBadge
                          label={appointment.status.replace('_', ' ')}
                          tone={appointment.status === 'PAYMENT_PENDING' ? 'warning' : 'neutral'}
                        />
                      </td>
                      <td data-label="Actions">
                        <div className="past-unresolved-actions">
                          <button
                            type="button"
                            className={`button button-sm past-unresolved-review-button ${canCollectPayment ? 'button-primary' : 'button-quiet'}`}
                            onClick={() =>
                              canCollectPayment ? onPayment(appointment) : setResolutionItem(item)
                            }
                          >
                            {canCollectPayment ? (
                              <WalletCards size={15} aria-hidden="true" />
                            ) : (
                              <ClipboardCheck size={15} aria-hidden="true" />
                            )}
                            {canCollectPayment ? 'Collect' : 'Review'}
                          </button>
                          <button
                            type="button"
                            className="button button-quiet button-sm past-unresolved-history-button"
                            onClick={() => onHistory(appointment)}
                          >
                            <History size={15} aria-hidden="true" />
                            History
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {payload?.hasMore ? (
            <p className="field-hint past-unresolved-more">
              Showing the oldest 100 records. Resolve these first to reveal the next batch.
            </p>
          ) : null}
        </>
      ) : loading ? (
        <div className="empty-state past-unresolved-empty" role="status">
          Loading historical exceptions…
        </div>
      ) : (
        <div className="empty-state past-unresolved-empty">
          <CheckCircle2 size={28} aria-hidden="true" />
          <div>
            <strong>Everything is reconciled</strong>
            <br />
            <span>No past appointment needs a manager decision.</span>
          </div>
        </div>
      )}

      {resolutionItem ? (
        <PastAppointmentResolutionDialog
          item={resolutionItem}
          currency={currency}
          onClose={() => setResolutionItem(null)}
          onComplete={(message) => {
            setResolutionItem(null);
            onChanged(message);
          }}
        />
      ) : null}
    </section>
  );
}

function PastAppointmentResolutionDialog({
  item,
  currency,
  onClose,
  onComplete,
}: {
  item: PastUnresolvedItem;
  currency: string;
  onClose: () => void;
  onComplete: (message: string) => void;
}) {
  const serviceRows = item.appointment.services.length
    ? item.appointment.services
    : [
        {
          id: `${item.appointment.id}-service`,
          serviceId: item.appointment.serviceId,
          sequence: 1,
          serviceName: item.appointment.serviceName,
          durationMin: item.appointment.durationMin,
          amount: item.appointment.amount,
          status: item.appointment.status,
          primaryStaff: item.appointment.primaryStaff,
          turnExclusions: [],
        },
      ];
  const invalidPaymentPending =
    item.appointment.status === 'PAYMENT_PENDING' &&
    !isAppointmentPaymentReady({ status: item.appointment.status, services: serviceRows });
  const issueLabel = invalidPaymentPending ? 'Payment state needs review' : item.guidance.label;
  const issueDescription = invalidPaymentPending
    ? 'This record is marked payment pending, but no completed service with a specialist is recorded. Reconcile the visit before collecting payment.'
    : item.guidance.description;
  const unfinishedServices = serviceRows.filter(
    (service) =>
      !['COMPLETED', 'CANCELLED'].includes(service.status) &&
      (service.status !== 'PAYMENT_PENDING' || invalidPaymentPending),
  );
  const [action, setAction] = useState<'CANCEL_UNSERVED' | 'MARK_COMPLETED'>('CANCEL_UNSERVED');
  const [serviceId, setServiceId] = useState(
    unfinishedServices.find((service) => service.status === item.appointment.status)?.id ??
      unfinishedServices[0]?.id ??
      serviceRows[0]?.id ??
      '',
  );
  const [staff, setStaff] = useState<HistoricalStaff[]>([]);
  const [staffId, setStaffId] = useState(item.appointment.primaryStaffId ?? '');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const close = useCallback(() => {
    if (!saving) onClose();
  }, [onClose, saving]);
  const dialogRef = useDialogFocus(true, close);
  const selectedService = serviceRows.find((service) => service.id === serviceId) ?? serviceRows[0];
  const isInService = selectedService?.status === 'IN_SERVICE';
  const selectedStaff = staff.find((member) => member.id === staffId);

  useEffect(() => {
    let disposed = false;
    void fetch('/api/admin/staff', { cache: 'no-store' })
      .then((response) =>
        parseAdminJsonResponse<{ staff?: HistoricalStaff[] }>(
          response,
          'Unable to load specialists',
        ),
      )
      .then((nextPayload) => {
        if (disposed) return;
        const nextStaff = nextPayload.staff ?? [];
        setStaff(nextStaff);
        setStaffId(
          (item.appointment.primaryStaffId &&
          nextStaff.some((member) => member.id === item.appointment.primaryStaffId)
            ? item.appointment.primaryStaffId
            : nextStaff.find((member) => member.isActive)?.id) ??
            nextStaff[0]?.id ??
            '',
        );
      })
      .catch((nextError: unknown) => {
        if (!disposed)
          setError(nextError instanceof Error ? nextError.message : 'Unable to load specialists');
      })
      .finally(() => {
        if (!disposed) setLoadingStaff(false);
      });
    return () => {
      disposed = true;
    };
  }, [item.appointment.primaryStaffId]);

  async function submit() {
    if (!selectedService) {
      setError('Choose a service to resolve.');
      return;
    }
    if (!reason.trim()) {
      setError('Add a reason to continue.');
      return;
    }
    if (action === 'MARK_COMPLETED' && !staffId) {
      setError('Choose the specialist who completed the service.');
      return;
    }
    if (action === 'CANCEL_UNSERVED' && isInService && !confirmed) {
      setError('Confirm that this in-service record should be marked unserved.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/appointments/past-unresolved', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appointmentId: item.appointment.id,
          appointmentServiceId: item.appointment.services.length ? selectedService.id : undefined,
          action,
          staffId: action === 'MARK_COMPLETED' ? staffId : undefined,
          reason: reason.trim(),
          confirmed,
          idempotencyKey: `past-resolution-${item.appointment.id}-${selectedService.id}-${action}-${Date.now()}`,
        }),
      });
      const responsePayload = await parseAdminJsonResponse<{ message?: string }>(
        response,
        'Historical resolution could not be recorded',
      );
      onComplete(
        responsePayload.message ??
          `${item.appointment.code} ${action === 'MARK_COMPLETED' ? 'marked completed' : 'marked unserved'}.`,
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Historical resolution failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div
        ref={dialogRef}
        className="modal past-resolution-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-resolution-title"
        aria-busy={saving}
      >
        <div className="modal-header past-resolution-modal-header">
          <div className="past-resolution-heading-copy">
            <div className="past-resolution-kicker">
              <div className="eyebrow">Historical reconciliation</div>
              <span className="past-resolution-header-status">
                <AlertCircle size={13} aria-hidden="true" />
                Manager action
              </span>
            </div>
            <h2 id="past-resolution-title">Resolve past appointment</h2>
            <div className="past-resolution-context" aria-label="Appointment details">
              <span className="past-resolution-context-code">{item.appointment.code}</span>
              <span>{item.appointment.customerName}</span>
              <span>{item.businessDate}</span>
            </div>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close historical resolution"
            onClick={close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div
          className="past-resolution-issue"
          role="note"
          aria-label="Reason this appointment needs review"
        >
          <div className="past-resolution-issue-heading">
            <div className="past-resolution-issue-title">
              <span className="past-resolution-step">WHY</span>
              <h3>Why this needs review</h3>
            </div>
            <span className={`past-unresolved-kind ${item.resolutionKind.toLowerCase()}`}>
              {issueLabel}
            </span>
          </div>
          <p>{issueDescription}</p>
        </div>

        <div className="past-resolution-notice">
          <span className="past-resolution-notice-icon">
            <AlertCircle size={17} aria-hidden="true" />
          </span>
          <span className="past-resolution-notice-copy">
            <strong>Review the historical record carefully.</strong>
            <span>
              This writes a manager decision to the audit trail. It does not change today’s staff
              availability.
            </span>
          </span>
        </div>

        <div className="field past-resolution-field">
          <div className="past-resolution-field-heading">
            <div>
              <span className="past-resolution-step">01</span>
              <label htmlFor="past-resolution-service">Service to resolve</label>
            </div>
            <span className="past-resolution-field-kicker">Required</span>
          </div>
          <select
            id="past-resolution-service"
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setConfirmed(false);
            }}
            disabled={saving}
          >
            {unfinishedServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.sequence}. {service.serviceName} · {service.status.replace('_', ' ')}
              </option>
            ))}
          </select>
          <span className="field-hint">
            {unfinishedServices.length > 1
              ? 'This visit has multiple unfinished services; resolve them one at a time.'
              : 'Choose the unfinished service represented by this historical record.'}
          </span>
        </div>

        <div className="past-resolution-section-heading">
          <span className="past-resolution-step">02</span>
          <div>
            <h3>Choose an outcome</h3>
            <p>Tell us what actually happened during this visit.</p>
          </div>
        </div>

        <div className="past-resolution-choice-grid" role="group" aria-label="Resolution type">
          <button
            type="button"
            className={`past-resolution-choice ${action === 'CANCEL_UNSERVED' ? 'active' : ''}`}
            aria-pressed={action === 'CANCEL_UNSERVED'}
            onClick={() => {
              setAction('CANCEL_UNSERVED');
              setConfirmed(false);
            }}
            disabled={saving}
          >
            <span className="past-resolution-choice-top">
              <span className="past-resolution-choice-icon is-danger">
                <CircleX size={18} aria-hidden="true" />
              </span>
              <span className="past-resolution-choice-indicator" aria-hidden="true" />
            </span>
            <strong>Cancel as unserved</strong>
            <span>No service was delivered; close the record as unserved.</span>
          </button>
          <button
            type="button"
            className={`past-resolution-choice ${action === 'MARK_COMPLETED' ? 'active' : ''}`}
            aria-pressed={action === 'MARK_COMPLETED'}
            onClick={() => setAction('MARK_COMPLETED')}
            disabled={saving}
          >
            <span className="past-resolution-choice-top">
              <span className="past-resolution-choice-icon is-success">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
              <span className="past-resolution-choice-indicator" aria-hidden="true" />
            </span>
            <strong>Mark service completed</strong>
            <span>Use when the guest was served but the final event was missed.</span>
          </button>
        </div>

        {action === 'MARK_COMPLETED' ? (
          <div className="field past-resolution-field">
            <div className="past-resolution-field-heading">
              <div>
                <span className="past-resolution-step">02A</span>
                <label htmlFor="past-resolution-staff">Specialist who completed the service</label>
              </div>
              <span className="past-resolution-field-kicker">Required</span>
            </div>
            <select
              id="past-resolution-staff"
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
              disabled={saving || loadingStaff}
            >
              <option value="">Choose a specialist</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                  {!member.isActive ? ' · inactive' : ''}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {selectedStaff
                ? `Recorded against ${selectedStaff.name}; historical resolution does not assign a new live turn.`
                : loadingStaff
                  ? 'Loading the staff list…'
                  : 'Select the staff member to preserve accurate service attribution.'}
            </span>
          </div>
        ) : null}

        {action === 'CANCEL_UNSERVED' && isInService ? (
          <label className="past-resolution-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={saving}
            />
            <span>
              <strong>Confirm active service cancellation</strong>
              <small>I confirm that no service should remain recorded as delivered.</small>
            </span>
          </label>
        ) : null}

        <div className="field past-resolution-field">
          <div className="past-resolution-field-heading">
            <div>
              <span className="past-resolution-step">03</span>
              <label htmlFor="past-resolution-reason">Reason</label>
            </div>
            <span className="past-resolution-character-count">{reason.length}/200</span>
          </div>
          <textarea
            id="past-resolution-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            rows={3}
            placeholder="Example: Guest left before service started"
            disabled={saving}
          />
          <span className="field-hint">Required. Saved to the appointment audit trail.</span>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="past-resolution-actions-footer">
          <div className="past-resolution-audit-summary" aria-label="Appointment audit summary">
            <span>{formatAdminMoney(item.appointment.amount, currency)}</span>
            <span>
              {item.daysOverdue} day{item.daysOverdue === 1 ? '' : 's'} overdue
            </span>
          </div>
          <div className="past-resolution-footer-actions">
            <button type="button" className="button button-quiet" onClick={close} disabled={saving}>
              <X size={15} aria-hidden="true" />
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => void submit()}
              disabled={saving || !selectedService}
            >
              {action === 'MARK_COMPLETED' ? (
                <CheckCircle2 size={15} aria-hidden="true" />
              ) : (
                <CircleX size={15} aria-hidden="true" />
              )}
              {saving
                ? 'Saving…'
                : action === 'MARK_COMPLETED'
                  ? 'Mark completed'
                  : 'Mark unserved'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type TurnHistoryEvent = {
  id: string;
  appointmentServiceId: string | null;
  turnId: string | null;
  serviceSequence: number | null;
  serviceName: string;
  serviceStatus: string | null;
  eventType: string;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  actorType: string;
  actorId: string | null;
  actorName: string;
  reason: string | null;
  createdAt: string;
};
type TurnHistoryPayload = {
  appointment: { id: string; code: string; customerName: string; phone: string; status: string };
  turnRecordCount: number;
  eventCount: number;
  events: TurnHistoryEvent[];
};
const turnEventLabels: Record<string, string> = {
  WAITING: 'Waiting for staff',
  ASSIGNED: 'Assigned',
  ACCEPTED: 'Accepted',
  SKIPPED: 'Skipped',
  FINISHED: 'Finished',
  REASSIGNED: 'Reassigned',
  CONTINUED_WITH_ME: 'Continued with me',
  SUPPORT_ADDED: 'Support added',
  SUPPORT_RELEASED: 'Support released',
  CANCELLED: 'Cancelled',
};
function turnEventLabel(eventType: string) {
  return (
    turnEventLabels[eventType] ??
    eventType
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase())
  );
}
function formatTurnEventDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}
function TurnHistoryModal({
  appointment,
  timezone,
  onClose,
}: {
  appointment: Appointment;
  timezone: string;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<TurnHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [eventFilter, setEventFilter] = useState('ALL');
  const [requestVersion, setRequestVersion] = useState(0);
  const dialogRef = useDialogFocus(true, onClose);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/appointments/${encodeURIComponent(appointment.id)}/turn-history`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) =>
        parseAdminJsonResponse<TurnHistoryPayload>(response, 'Unable to load appointment history'),
      )
      .then(setPayload)
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(
          fetchError instanceof Error ? fetchError.message : 'Unable to load appointment history',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appointment.id, requestVersion]);

  const serviceFilters = payload
    ? [
        ...new Map(
          payload.events.map((event) => [
            event.appointmentServiceId ?? 'APPOINTMENT',
            {
              value: event.appointmentServiceId ?? 'APPOINTMENT',
              label: event.serviceSequence
                ? `Service ${event.serviceSequence} · ${event.serviceName}`
                : event.serviceName,
            },
          ]),
        ).values(),
      ]
    : [];
  const eventFilters = payload ? [...new Set(payload.events.map((event) => event.eventType))] : [];
  const filteredEvents =
    payload?.events.filter(
      (event) =>
        (serviceFilter === 'ALL' ||
          (event.appointmentServiceId ?? 'APPOINTMENT') === serviceFilter) &&
        (eventFilter === 'ALL' || event.eventType === eventFilter),
    ) ?? [];

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal modal-wide turn-history-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="turn-history-title"
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">Appointment audit</div>
            <h2 id="turn-history-title">Appointment history</h2>
            <p>
              {appointment.code} · {appointment.customerName} · {appointment.phone}
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close appointment history"
            onClick={onClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        {loading ? (
          <div className="history-empty turn-history-empty" role="status">
            <History size={26} aria-hidden="true" />
            <strong>Loading appointment history…</strong>
            <span>Reading the assignment events for this appointment.</span>
          </div>
        ) : error ? (
          <div className="history-empty turn-history-empty" role="alert">
            <X size={26} aria-hidden="true" />
            <strong>Could not load history</strong>
            <span>{error}</span>
            <button
              type="button"
              className="button button-quiet button-sm"
              onClick={() => {
                setLoading(true);
                setError('');
                setPayload(null);
                setRequestVersion((version) => version + 1);
              }}
            >
              <RefreshCcw size={15} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : payload ? (
          <>
            <div className="turn-history-summary" aria-label="Appointment history summary">
              <span className="turn-history-summary-item">
                <strong>{payload.turnRecordCount}</strong> activity record
                {payload.turnRecordCount === 1 ? '' : 's'}
              </span>
              <span className="turn-history-summary-item">
                <strong>{payload.eventCount}</strong> event{payload.eventCount === 1 ? '' : 's'}{' '}
                logged
              </span>
              <StatusBadge
                label={payload.appointment.status.replaceAll('_', ' ')}
                tone={
                  payload.appointment.status === 'COMPLETED'
                    ? 'success'
                    : payload.appointment.status === 'CANCELLED'
                      ? 'neutral'
                      : payload.appointment.status === 'IN_SERVICE'
                        ? 'blue'
                        : 'warning'
                }
              />
            </div>
            <div className="turn-history-filters">
              <div className="field">
                <label htmlFor="turn-history-service-filter">Service</label>
                <select
                  id="turn-history-service-filter"
                  value={serviceFilter}
                  onChange={(event) => setServiceFilter(event.target.value)}
                >
                  <option value="ALL">All services</option>
                  {serviceFilters.map((service) => (
                    <option key={service.value} value={service.value}>
                      {service.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="turn-history-event-filter">Event</label>
                <select
                  id="turn-history-event-filter"
                  value={eventFilter}
                  onChange={(event) => setEventFilter(event.target.value)}
                >
                  <option value="ALL">All events</option>
                  {eventFilters.map((eventType) => (
                    <option key={eventType} value={eventType}>
                      {turnEventLabel(eventType)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {filteredEvents.length ? (
              <ol className="turn-history-timeline" aria-label="Appointment events">
                {filteredEvents.map((event) => (
                  <li
                    className={`turn-history-event turn-history-event-${event.eventType.toLowerCase()}`}
                    key={event.id}
                  >
                    <span className="turn-history-event-icon">
                      <History size={18} aria-hidden="true" />
                    </span>
                    <div className="turn-history-event-card">
                      <div className="turn-history-event-head">
                        <div>
                          <span className="turn-history-event-service">
                            {event.serviceSequence
                              ? `Service ${event.serviceSequence}`
                              : 'Appointment activity'}{' '}
                            · {event.serviceName}
                          </span>
                          <h3>{turnEventLabel(event.eventType)}</h3>
                        </div>
                        <time className="turn-history-event-time" dateTime={event.createdAt}>
                          {formatTurnEventDateTime(event.createdAt, timezone)}
                        </time>
                      </div>
                      <div className="turn-history-event-meta">
                        <div className="turn-history-event-person">
                          <span>Assigned to</span>
                          <strong>{event.assignedStaffName ?? 'Waiting for eligible staff'}</strong>
                        </div>
                        <div className="turn-history-event-person">
                          <span>Performed by</span>
                          <strong>{event.actorName}</strong>
                          {event.actorName === 'Historical record' ? (
                            <small className="turn-history-historical-note">
                              Actor details were not stored before history tracking was added.
                            </small>
                          ) : null}
                        </div>
                      </div>
                      {event.reason ? (
                        <p className="turn-history-event-reason">{event.reason}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="history-empty turn-history-empty">
                <History size={26} aria-hidden="true" />
                <strong>No events match these filters</strong>
                <span>Choose another service or event type to see more activity.</span>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
function formatAppointmentDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
function PaymentsView({
  appointments,
  currency,
  businessDate,
  businessMonth,
  refreshToken,
  onPayment,
  onChanged,
}: {
  appointments: Appointment[];
  currency: string;
  businessDate: string;
  businessMonth: string;
  refreshToken: number;
  onPayment: (appointment: Appointment) => void;
  onChanged: () => Promise<void>;
}) {
  const defaultBusinessDate = businessDate || new Date().toISOString().slice(0, 10);
  const defaultBusinessMonth = businessMonth || defaultBusinessDate.slice(0, 7);
  const initialPaid = appointments
    .filter((appointment) => Boolean(appointment.payment))
    .sort(
      (left, right) =>
        new Date(right.payment?.confirmedAt ?? 0).getTime() -
        new Date(left.payment?.confirmedAt ?? 0).getTime(),
    );
  const [paymentView, setPaymentView] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [historyAppointment, setHistoryAppointment] = useState<Appointment | null>(null);
  const [historyRows, setHistoryRows] = useState<Appointment[]>(initialPaid);
  const [historyDateMode, setHistoryDateMode] = useState<AppointmentDateMode>('DAY');
  const [historyDate, setHistoryDate] = useState(defaultBusinessDate);
  const [historyMonth, setHistoryMonth] = useState(defaultBusinessMonth);
  const [historyFrom, setHistoryFrom] = useState(defaultBusinessDate);
  const [historyTo, setHistoryTo] = useState(defaultBusinessDate);
  const [historySearch, setHistorySearch] = useState('');
  const [historyMethod, setHistoryMethod] = useState<'ALL' | 'CARD' | 'CASH'>('ALL');
  const [historySort, setHistorySort] = useState<
    'PAYMENT_NEWEST' | 'PAYMENT_OLDEST' | 'AMOUNT_DESC'
  >('PAYMENT_NEWEST');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyPagination, setHistoryPagination] = useState<AppointmentPageMeta>({
    page: 1,
    pageSize: 25,
    total: initialPaid.length,
    totalPages: 1,
  });
  const [historySummary, setHistorySummary] = useState<AppointmentSummary>({
    totalRevenue: initialPaid.reduce((total, appointment) => total + appointment.amount, 0),
    totalDuration: 0,
  });
  const historyRequestRef = useRef(0);
  const historyControllerRef = useRef<AbortController | null>(null);
  const lastHistoryRefreshTokenRef = useRef(refreshToken);
  const pending = appointments.filter(
    (appointment) => !appointment.payment && isPaymentReadyForAdminAppointment(appointment),
  );
  const pendingTotal = pending.reduce((total, appointment) => total + appointment.amount, 0);
  const activeHistoryFilterCount = [
    historyDateMode !== 'DAY' ? historyDateMode : '',
    historySearch.trim(),
    historyMethod !== 'ALL' ? historyMethod : '',
    historySort !== 'PAYMENT_NEWEST' ? historySort : '',
  ].filter(Boolean).length;

  useEffect(() => () => historyControllerRef.current?.abort(), []);

  function buildHistoryQuery(page: number) {
    const params = new URLSearchParams();
    if (historyDateMode === 'MONTH') params.set('month', historyMonth);
    else if (historyDateMode === 'RANGE') {
      params.set('from', historyFrom);
      params.set('to', historyTo);
    } else params.set('date', historyDate);
    params.set('payment', 'PAID');
    params.set('page', String(page));
    params.set('pageSize', '25');
    if (historySearch.trim()) params.set('search', historySearch.trim());
    if (historyMethod !== 'ALL') params.set('paymentMethod', historyMethod);
    params.set('sort', historySort);
    return params.toString();
  }

  async function loadPaymentHistory(requestedPage = 1) {
    if (historyDateMode === 'RANGE' && (!historyFrom || !historyTo || historyFrom > historyTo)) {
      setHistoryError('Choose a valid payment date range.');
      return;
    }
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    historyControllerRef.current?.abort();
    const controller = new AbortController();
    historyControllerRef.current = controller;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await fetch(`/api/admin/appointments?${buildHistoryQuery(requestedPage)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Unable to load payment history');
      if (requestId !== historyRequestRef.current) return;
      setHistoryRows(payload.appointments ?? []);
      setHistoryPagination(
        payload.pagination ?? {
          page: 1,
          pageSize: 25,
          total: payload.appointments?.length ?? 0,
          totalPages: 1,
        },
      );
      setHistorySummary(payload.summary ?? { totalRevenue: 0, totalDuration: 0 });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (requestId === historyRequestRef.current)
        setHistoryError(error instanceof Error ? error.message : 'Unable to load payment history');
    } finally {
      if (requestId === historyRequestRef.current) setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (paymentView !== 'HISTORY') return;
    const shouldLoad =
      historyDateMode === 'DAY'
        ? Boolean(historyDate)
        : historyDateMode === 'MONTH'
          ? Boolean(historyMonth)
          : Boolean(historyFrom && historyTo && historyFrom <= historyTo);
    if (!shouldLoad) return;
    const timer = window.setTimeout(
      () => {
        void loadPaymentHistory(1);
      },
      historySearch ? 250 : 0,
    );
    return () => window.clearTimeout(timer);
    // The filter controls are the deliberate triggers for this server-backed payment history query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paymentView,
    historyDateMode,
    historyDate,
    historyMonth,
    historyFrom,
    historyTo,
    historySearch,
    historyMethod,
    historySort,
  ]);

  useEffect(() => {
    if (refreshToken === 0 || refreshToken === lastHistoryRefreshTokenRef.current) return;
    lastHistoryRefreshTokenRef.current = refreshToken;
    if (paymentView !== 'HISTORY') return;
    // The parent refresh is the deliberate signal for this server-backed query.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPaymentHistory(historyPagination.page);
    // Parent refreshes are the deliberate signal after payment mutations or polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken, paymentView]);

  function clearHistoryFilters() {
    setHistoryDateMode('DAY');
    setHistoryDate(defaultBusinessDate);
    setHistoryMonth(defaultBusinessMonth);
    setHistoryFrom(defaultBusinessDate);
    setHistoryTo(defaultBusinessDate);
    setHistorySearch('');
    setHistoryMethod('ALL');
    setHistorySort('PAYMENT_NEWEST');
    setHistoryError('');
  }

  const pendingLabel =
    pending.length === 0
      ? 'All clear'
      : `${pending.length} action${pending.length === 1 ? '' : 's'} needed`;

  return (
    <>
      <SectionHeader
        eyebrow="Payment collection"
        title="Payments"
        description="Confirm the final amount after collection, then adjust the record later if needed."
        action={<StatusBadge label={pendingLabel} tone={pending.length ? 'warning' : 'success'} />}
      />
      <div className="card card-pad payment-screen-card">
        <div className="payment-tabs" role="tablist" aria-label="Payment views">
          <button
            type="button"
            id="payments-tab-pending"
            className={`payment-tab ${paymentView === 'PENDING' ? 'active' : ''}`}
            role="tab"
            aria-selected={paymentView === 'PENDING'}
            aria-controls="payments-panel-pending"
            tabIndex={paymentView === 'PENDING' ? 0 : -1}
            onClick={() => setPaymentView('PENDING')}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const nextView =
                event.key === 'Home'
                  ? 'PENDING'
                  : event.key === 'End'
                    ? 'HISTORY'
                    : paymentView === 'PENDING'
                      ? 'HISTORY'
                      : 'PENDING';
              setPaymentView(nextView);
              document
                .getElementById(
                  nextView === 'PENDING' ? 'payments-tab-pending' : 'payments-tab-history',
                )
                ?.focus();
            }}
          >
            <CreditCard size={16} aria-hidden="true" />
            <span>To collect</span>
            <span className="payment-tab-count" aria-hidden="true">
              {pending.length}
            </span>
          </button>
          <button
            type="button"
            id="payments-tab-history"
            className={`payment-tab ${paymentView === 'HISTORY' ? 'active' : ''}`}
            role="tab"
            aria-selected={paymentView === 'HISTORY'}
            aria-controls="payments-panel-history"
            tabIndex={paymentView === 'HISTORY' ? 0 : -1}
            onClick={() => setPaymentView('HISTORY')}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const nextView =
                event.key === 'Home'
                  ? 'PENDING'
                  : event.key === 'End'
                    ? 'HISTORY'
                    : paymentView === 'PENDING'
                      ? 'HISTORY'
                      : 'PENDING';
              setPaymentView(nextView);
              document
                .getElementById(
                  nextView === 'PENDING' ? 'payments-tab-pending' : 'payments-tab-history',
                )
                ?.focus();
            }}
          >
            <History size={16} aria-hidden="true" />
            <span>History</span>
            <span className="payment-tab-count" aria-hidden="true">
              {historyPagination.total}
            </span>
          </button>
        </div>
        <section
          id="payments-panel-pending"
          className="payment-panel payment-pending-section"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="payments-tab-pending"
          hidden={paymentView !== 'PENDING'}
        >
          <div className="payment-collection-overview" role="status" aria-live="polite">
            <div className="payment-collection-overview-copy">
              <span className="eyebrow">Action queue</span>
              <strong>
                {pending.length
                  ? `${pending.length} collection${pending.length === 1 ? '' : 's'} to complete`
                  : 'All collections are caught up'}
              </strong>
              <span>
                {pending.length
                  ? 'Review the amount, collect in person, then confirm it here.'
                  : 'New payment tasks will appear here after a service is finished.'}
              </span>
            </div>
            <div className="payment-collection-overview-total">
              <span>Open value</span>
              <strong>{formatAdminMoney(pendingTotal, currency)}</strong>
            </div>
          </div>
          <div className="card-title-row">
            <div>
              <h2 id="pending-payments-title" className="card-title">
                To collect
              </h2>
              <p>Confirm only after the terminal or cash collection is complete.</p>
            </div>
          </div>
          {pending.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table payment-pending-table">
                <thead>
                  <tr>
                    <th>Turn</th>
                    <th>Guest</th>
                    <th>Services</th>
                    <th>Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((appointment) => (
                    <tr key={appointment.id}>
                      <td data-label="Turn">
                        <strong>{appointment.code}</strong>
                      </td>
                      <td data-label="Guest">{appointment.customerName}</td>
                      <td data-label="Services">
                        {appointment.services.map((service) => service.serviceName).join(' + ')}
                      </td>
                      <td data-label="Total">
                        <strong>{formatAdminMoney(appointment.amount, currency)}</strong>
                      </td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="button button-primary button-sm payment-pending-confirm-button"
                          aria-haspopup="dialog"
                          aria-label="Confirm payment"
                          title="Confirm payment"
                          onClick={() => onPayment(appointment)}
                        >
                          <CreditCard size={15} aria-hidden="true" /> Confirm
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state payment-empty-state">
              <CheckCircle2 size={28} aria-hidden="true" />
              <div>
                <strong>All clear</strong>
                <br />
                <span>No appointments are waiting for payment.</span>
              </div>
            </div>
          )}
        </section>
        <section
          id="payments-panel-history"
          className="payment-panel payment-history-section"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="payments-tab-history"
          hidden={paymentView !== 'HISTORY'}
        >
          <div className="card-title-row">
            <div>
              <h2 id="payment-history-title" className="card-title">
                Payment history
              </h2>
              <p>
                The service fee stays as the original snapshot; the final collected amount and any
                adjustments remain in the audit trail.
              </p>
            </div>
          </div>
          <div className="payment-history-filter-panel">
            <div className="payment-history-filter-top">
              <PaymentHistoryPeriodFilter
                mode={historyDateMode}
                date={historyDate}
                month={historyMonth}
                from={historyFrom}
                to={historyTo}
                onModeChange={(mode) => {
                  setHistoryDateMode(mode);
                  setHistoryError('');
                }}
                onDateChange={(value) => {
                  setHistoryDate(value);
                  setHistoryError('');
                }}
                onMonthChange={(value) => {
                  setHistoryMonth(value);
                  setHistoryError('');
                }}
                onFromChange={(value) => {
                  setHistoryFrom(value);
                  setHistoryError('');
                }}
                onToChange={(value) => {
                  setHistoryTo(value);
                  setHistoryError('');
                }}
                loading={historyLoading}
                error={
                  historyDateMode === 'RANGE' &&
                  (!historyFrom || !historyTo || historyFrom > historyTo)
                    ? historyError
                    : ''
                }
              />
              {historyLoading ? (
                <span className="payment-history-loading" role="status" aria-live="polite">
                  <RefreshCcw size={15} aria-hidden="true" className="spin" />
                  Updating history…
                </span>
              ) : null}
            </div>
            <div className="payment-history-filter-grid">
              <div className="field payment-history-search-field">
                <label htmlFor="payment-history-search">Search payment history</label>
                <div className="input-with-icon">
                  <Search size={16} aria-hidden="true" />
                  <input
                    id="payment-history-search"
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Code, customer, phone"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="payment-history-method">Payment method</label>
                <select
                  id="payment-history-method"
                  value={historyMethod}
                  onChange={(event) => setHistoryMethod(event.target.value as typeof historyMethod)}
                >
                  <option value="ALL">All methods</option>
                  <option value="CARD">Card</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="payment-history-sort">Sort by</label>
                <select
                  id="payment-history-sort"
                  value={historySort}
                  onChange={(event) => setHistorySort(event.target.value as typeof historySort)}
                >
                  <option value="PAYMENT_NEWEST">Newest confirmed</option>
                  <option value="PAYMENT_OLDEST">Oldest confirmed</option>
                  <option value="AMOUNT_DESC">Highest amount</option>
                </select>
              </div>
            </div>
            <div className="appointment-filter-footer">
              <div className="appointment-summary">
                <strong>{historyPagination.total}</strong> recorded ·{' '}
                <strong>{formatAdminMoney(historySummary.totalRevenue, currency)}</strong> service
                total
              </div>
              <div className="appointment-filter-actions">
                <span className="subtle" role="status" aria-live="polite">
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  {activeHistoryFilterCount
                    ? `${activeHistoryFilterCount} filters active`
                    : 'No filters applied'}
                </span>
                {activeHistoryFilterCount ? (
                  <button
                    type="button"
                    className="button button-quiet button-sm"
                    onClick={clearHistoryFilters}
                  >
                    <X size={15} aria-hidden="true" />
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {historyError ? (
            <div className="management-error payment-history-error" role="alert">
              <span>{historyError}</span>
              <button
                type="button"
                className="button button-quiet button-sm"
                onClick={() => void loadPaymentHistory(historyPagination.page)}
              >
                Retry
              </button>
            </div>
          ) : null}
          {historyRows.length ? (
            <div className="admin-table-wrap" aria-busy={historyLoading}>
              <table className="admin-table payment-history-table">
                <thead>
                  <tr>
                    <th>Turn</th>
                    <th>Guest</th>
                    <th>Collected</th>
                    <th>Method</th>
                    <th>Confirmed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((appointment) => (
                    <tr key={appointment.id}>
                      <td data-label="Turn">
                        <strong>{appointment.code}</strong>
                      </td>
                      <td data-label="Guest">{appointment.customerName}</td>
                      <td data-label="Collected">
                        <strong>
                          {formatAdminMoney(
                            (appointment.payment?.amount ?? appointment.amount) +
                              (appointment.payment?.tip ?? 0),
                            currency,
                          )}
                        </strong>
                      </td>
                      <td data-label="Method">
                        <span className="payment-method-label-inline">
                          {appointment.payment?.method === 'CARD' ? (
                            <CreditCard size={15} aria-hidden="true" />
                          ) : (
                            <Banknote size={15} aria-hidden="true" />
                          )}
                          {appointment.payment?.method === 'CARD' ? 'Card' : 'Cash'}
                        </span>
                      </td>
                      <td data-label="Confirmed" className="subtle">
                        {appointment.payment?.confirmedAt
                          ? formatAppointmentDateTime(appointment.payment.confirmedAt)
                          : '—'}
                      </td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="button button-quiet button-sm"
                          onClick={() => setHistoryAppointment(appointment)}
                        >
                          <History size={15} aria-hidden="true" /> View history
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : historyLoading ? (
            <div className="empty-state payment-empty-state" role="status">
              <RefreshCcw size={28} aria-hidden="true" className="spin" />
              <div>
                <strong>Loading payment history…</strong>
                <br />
                <span>Applying the selected filters.</span>
              </div>
            </div>
          ) : (
            <div className="empty-state payment-empty-state">
              <History size={28} aria-hidden="true" />
              <div>
                <strong>No payment history matches</strong>
                <br />
                <span>Try another date, method, or search term.</span>
              </div>
            </div>
          )}
          {historyPagination.total > historyPagination.pageSize ? (
            <nav className="appointment-pagination" aria-label="Payment history pagination">
              <span className="subtle">
                Showing {(historyPagination.page - 1) * historyPagination.pageSize + 1}–
                {Math.min(
                  historyPagination.page * historyPagination.pageSize,
                  historyPagination.total,
                )}{' '}
                of {historyPagination.total}
              </span>
              <div className="appointment-pagination-actions">
                <button
                  type="button"
                  className="button button-quiet button-sm"
                  onClick={() => void loadPaymentHistory(historyPagination.page - 1)}
                  disabled={historyLoading || historyPagination.page <= 1}
                  aria-label="Previous payment history page"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  Previous
                </button>
                <span className="subtle" aria-live="polite">
                  Page {historyPagination.page} of {historyPagination.totalPages}
                </span>
                <button
                  type="button"
                  className="button button-quiet button-sm"
                  onClick={() => void loadPaymentHistory(historyPagination.page + 1)}
                  disabled={
                    historyLoading || historyPagination.page >= historyPagination.totalPages
                  }
                  aria-label="Next payment history page"
                >
                  Next
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </nav>
          ) : null}
        </section>
      </div>
      {historyAppointment ? (
        <PaymentHistoryModal
          appointment={historyAppointment}
          currency={currency}
          onClose={() => setHistoryAppointment(null)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}

function paymentMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function paymentEventTitle(action: string) {
  if (action === 'payment.confirmed') return 'Payment recorded';
  if (action === 'payment.adjusted') return 'Payment adjusted';
  if (action === 'payment.corrected') return 'Payment record corrected';
  if (action === 'payment.refunded') return 'Refund recorded';
  return action.replace('payment.', '').replaceAll('_', ' ');
}

function paymentEventSummary(event: PaymentHistoryEvent, currency: string) {
  const metadata = paymentMetadataObject(event.metadata);
  if (event.action === 'payment.adjusted') {
    const previous = paymentMetadataObject(metadata.previous);
    const current = paymentMetadataObject(metadata.current);
    const previousMethod = previous.method === 'CARD' ? 'Card' : 'Cash';
    const currentMethod = current.method === 'CARD' ? 'Card' : 'Cash';
    const previousAmount = Number(previous.amount ?? 0);
    const currentAmount = Number(current.amount ?? 0);
    const previousTip = Number(previous.tip ?? 0);
    const currentTip = Number(current.tip ?? 0);
    const cashSummary =
      current.cashReceived !== null && current.cashReceived !== undefined
        ? ` · cash ${formatAdminMoney(Number(current.cashReceived ?? 0), currency)} · change ${formatAdminMoney(Number(current.changeGiven ?? 0), currency)}`
        : '';
    return `amount ${formatAdminMoney(previousAmount, currency)} → ${formatAdminMoney(currentAmount, currency)} · ${previousMethod} → ${currentMethod} · tip ${formatAdminMoney(previousTip, currency)} → ${formatAdminMoney(currentTip, currency)}${cashSummary}${typeof metadata.reason === 'string' ? ` · ${metadata.reason}` : ''}`;
  }
  if (event.action === 'payment.corrected') {
    const previous = paymentMetadataObject(metadata.previous);
    const current = paymentMetadataObject(metadata.current);
    const previousMethod = previous.method === 'CARD' ? 'Card' : 'Cash';
    const currentMethod = current.method === 'CARD' ? 'Card' : 'Cash';
    const previousTip = Number(previous.tip ?? 0);
    const currentTip = Number(current.tip ?? 0);
    return `${previousMethod} → ${currentMethod} · tip ${formatAdminMoney(previousTip, currency)} → ${formatAdminMoney(currentTip, currency)}${typeof metadata.reason === 'string' ? ` · ${metadata.reason}` : ''}`;
  }
  if (event.action === 'payment.refunded') {
    const refundMethod =
      metadata.refundMethod === 'CARD'
        ? 'Card'
        : metadata.refundMethod === 'CASH'
          ? 'Cash'
          : 'original method';
    return `${formatAdminMoney(Number(metadata.amount ?? 0), currency)} returned via ${refundMethod}${typeof metadata.reason === 'string' ? ` · ${metadata.reason}` : ''}`;
  }
  const method = metadata.method === 'CARD' ? 'Card' : 'Cash';
  const amount = Number(metadata.amount ?? metadata.originalAmount ?? 0);
  const originalAmount = Number(metadata.originalAmount ?? amount);
  const tip = Number(metadata.tip ?? 0);
  const cashSummary =
    metadata.cashReceived !== null && metadata.cashReceived !== undefined
      ? ` · cash ${formatAdminMoney(Number(metadata.cashReceived ?? 0), currency)} · change ${formatAdminMoney(Number(metadata.changeGiven ?? 0), currency)}`
      : '';
  const amountSummary =
    Math.abs(originalAmount - amount) > 0.005
      ? `service fee ${formatAdminMoney(originalAmount, currency)} → ${formatAdminMoney(amount, currency)}`
      : formatAdminMoney(amount, currency);
  return `${method} · ${amountSummary}${tip ? ` + ${formatAdminMoney(tip, currency)} tip` : ''}${cashSummary}`;
}

function PaymentHistoryModal({
  appointment,
  currency,
  onClose,
  onChanged,
}: {
  appointment: Appointment;
  currency: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [payload, setPayload] = useState<PaymentHistoryPayload | null>(null);
  const [mode, setMode] = useState<'VIEW' | 'ADJUST'>('VIEW');
  const [method, setMethod] = useState<'CARD' | 'CASH'>('CARD');
  const [amount, setAmount] = useState('0');
  const [tip, setTip] = useState('0');
  const [cashReceived, setCashReceived] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialogRef = useDialogFocus(true, onClose);

  const loadHistory = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/admin/payments/${encodeURIComponent(appointment.id)}/history`,
          { cache: 'no-store', signal },
        );
        const nextPayload = await response.json();
        if (!response.ok) throw new Error(nextPayload.error ?? 'Unable to load payment history');
        setPayload(nextPayload as PaymentHistoryPayload);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(
          fetchError instanceof Error ? fetchError.message : 'Unable to load payment history',
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [appointment.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    // Opening the modal intentionally starts the external payment history request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadHistory(controller.signal);
    return () => controller.abort();
  }, [loadHistory]);

  function startAdjustment() {
    if (!payload) return;
    setMethod(payload.payment.method);
    setAmount(String(payload.payment.amount));
    setTip(String(payload.payment.tip));
    setCashReceived(
      payload.payment.cashReceived === null ? '' : String(payload.payment.cashReceived),
    );
    setReason('');
    setNotice('');
    setError('');
    setMode('ADJUST');
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload) return;
    const numericAmount = Number(amount);
    const numericTip = Number(tip);
    const numericCashReceived = cashReceived.trim() ? Number(cashReceived) : undefined;
    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setError('Enter a valid non-negative final amount.');
      return;
    }
    if (!Number.isFinite(numericTip) || numericTip < 0) {
      setError('Enter a valid non-negative tip.');
      return;
    }
    if (
      method === 'CASH' &&
      numericCashReceived !== undefined &&
      (!Number.isFinite(numericCashReceived) || numericCashReceived < numericAmount + numericTip)
    ) {
      setError('Cash received cannot be less than the total due.');
      return;
    }
    if (reason.trim().length < 2) {
      setError('Enter a reason before saving.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/payments/adjust', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointment.id,
          method,
          amount: numericAmount,
          tip: numericTip,
          cashReceived: method === 'CASH' ? numericCashReceived : undefined,
          reason: reason.trim(),
          idempotencyKey: `payment-adjustment-${appointment.id}-${Date.now()}`,
        }),
      });
      const responsePayload = await response.json();
      if (!response.ok)
        throw new Error(responsePayload.error ?? 'Payment action could not be completed');
      setNotice(responsePayload.message ?? 'Payment updated.');
      setReason('');
      setMode('VIEW');
      await onChanged();
      await loadHistory();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : 'Payment action could not be completed',
      );
    } finally {
      setBusy(false);
    }
  }

  const statusTone =
    payload?.payment.status === 'PAID'
      ? 'success'
      : payload?.payment.status === 'REFUNDED'
        ? 'neutral'
        : 'warning';
  return (
    <div className="modal-backdrop">
      <div
        className="modal payment-history-modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-history-modal-title"
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow">Payment audit</div>
            <h2 id="payment-history-modal-title">{appointment.code} payment history</h2>
            <p>
              {appointment.customerName} ·{' '}
              {appointment.services.map((service) => service.serviceName).join(' + ')}
            </p>
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close payment history"
            onClick={onClose}
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>
        {loading ? (
          <div className="history-empty" role="status">
            <History size={26} aria-hidden="true" />
            <strong>Loading payment history…</strong>
            <span>Reading confirmed and adjusted events.</span>
          </div>
        ) : error && !payload ? (
          <div className="history-empty" role="alert">
            <X size={26} aria-hidden="true" />
            <strong>Could not load payment history</strong>
            <span>{error}</span>
            <button
              type="button"
              className="button button-quiet button-sm"
              onClick={() => void loadHistory()}
            >
              <RefreshCcw size={15} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : payload ? (
          <>
            <div className="payment-history-summary">
              <div>
                <span>Original fee</span>
                <strong>{formatAdminMoney(payload.payment.originalAmount, currency)}</strong>
              </div>
              <div>
                <span>Final amount</span>
                <strong>{formatAdminMoney(payload.payment.amount, currency)}</strong>
              </div>
              <div>
                <span>Tip</span>
                <strong>{formatAdminMoney(payload.payment.tip, currency)}</strong>
              </div>
              <div>
                <span>Paid via</span>
                <strong>{payload.payment.method === 'CARD' ? 'Card' : 'Cash'}</strong>
              </div>
              {payload.payment.method === 'CASH' && payload.payment.cashReceived !== null ? (
                <div>
                  <span>Change</span>
                  <strong>{formatAdminMoney(payload.payment.changeGiven, currency)}</strong>
                </div>
              ) : null}
              <StatusBadge label={payload.payment.status.replaceAll('_', ' ')} tone={statusTone} />
            </div>
            {notice ? (
              <div className="payment-action-notice" role="status">
                {notice}
              </div>
            ) : null}
            {mode === 'VIEW' ? (
              <>
                <div className="payment-history-timeline" aria-label="Payment events">
                  {payload.events
                    .slice()
                    .reverse()
                    .map((event) => (
                      <article className="payment-history-event" key={event.id}>
                        <span className="payment-history-event-icon">
                          {event.action === 'payment.refunded' ? (
                            <Undo2 size={17} aria-hidden="true" />
                          ) : event.action === 'payment.adjusted' ||
                            event.action === 'payment.corrected' ? (
                            <Pencil size={17} aria-hidden="true" />
                          ) : (
                            <CheckCircle2 size={17} aria-hidden="true" />
                          )}
                        </span>
                        <div>
                          <div className="payment-history-event-head">
                            <strong>{paymentEventTitle(event.action)}</strong>
                            <time dateTime={event.createdAt}>
                              {formatAppointmentDateTime(event.createdAt)}
                            </time>
                          </div>
                          <p>{paymentEventSummary(event, currency)}</p>
                          <small>Performed by {event.actorName}</small>
                        </div>
                      </article>
                    ))}
                </div>
                <p className="field-hint payment-history-help">
                  Adjust payment updates the saved final amount, method, tip, or cash details.
                  Before/after values, reason, and the admin who made the change remain in history.
                </p>
                <div className="form-actions">
                  <button type="button" className="button button-quiet" onClick={onClose}>
                    Close
                  </button>
                  <button type="button" className="button button-primary" onClick={startAdjustment}>
                    <Pencil size={15} aria-hidden="true" /> Adjust payment
                  </button>
                </div>
              </>
            ) : (
              <form className="payment-action-form" onSubmit={submitAction}>
                <div className="payment-action-banner">
                  <strong>Adjust saved payment</strong>
                  <span>
                    Update the final collected amount, payment method, tip, or cash details. The
                    original service fee stays unchanged for audit and reporting.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="payment-adjustment-amount">Final amount ({currency})</label>
                  <input
                    id="payment-adjustment-amount"
                    type="number"
                    min="0"
                    max="100000"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                  <span className="field-hint">
                    Original service fee:{' '}
                    {formatAdminMoney(payload.payment.originalAmount, currency)}.
                  </span>
                </div>
                <div className="field payment-method-field">
                  <span id="payment-adjustment-method-label" className="payment-method-label">
                    Payment method
                  </span>
                  <div
                    className="payment-method-options"
                    role="group"
                    aria-labelledby="payment-adjustment-method-label"
                  >
                    <button
                      type="button"
                      className={`payment-method-option ${method === 'CASH' ? 'active' : ''}`}
                      aria-pressed={method === 'CASH'}
                      disabled={busy}
                      onClick={() => setMethod('CASH')}
                    >
                      <Banknote size={20} aria-hidden="true" />
                      Cash
                    </button>
                    <button
                      type="button"
                      className={`payment-method-option ${method === 'CARD' ? 'active' : ''}`}
                      aria-pressed={method === 'CARD'}
                      disabled={busy}
                      onClick={() => setMethod('CARD')}
                    >
                      <CreditCard size={20} aria-hidden="true" />
                      Card
                    </button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="payment-adjustment-tip">Tip ({currency})</label>
                  <input
                    id="payment-adjustment-tip"
                    type="number"
                    min="0"
                    max="100000"
                    step="0.01"
                    inputMode="decimal"
                    value={tip}
                    onChange={(event) => setTip(event.target.value)}
                  />
                  <span className="field-hint">Recorded separately from the service amount.</span>
                </div>
                {method === 'CASH' ? (
                  <div className="field">
                    <label htmlFor="payment-adjustment-cash">Cash received ({currency})</label>
                    <input
                      id="payment-adjustment-cash"
                      type="number"
                      min="0"
                      max="100000"
                      step="0.01"
                      inputMode="decimal"
                      value={cashReceived}
                      onChange={(event) => setCashReceived(event.target.value)}
                      placeholder="Leave blank to use exact cash"
                    />
                    <span className="field-hint">
                      Must cover the final amount plus tip. Change is calculated automatically.
                    </span>
                  </div>
                ) : null}
                <PaymentPreview
                  amount={amount}
                  tip={tip}
                  method={method}
                  cashReceived={cashReceived}
                  currency={currency}
                />
                <div className="field">
                  <label htmlFor="payment-action-reason">Reason for adjustment</label>
                  <textarea
                    id="payment-action-reason"
                    rows={3}
                    maxLength={200}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Discount, wrong amount, wrong method, or cash correction…"
                    required
                  />
                  <span className="field-hint">
                    Required so the next admin can understand what changed.
                  </span>
                </div>
                {error ? (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="form-actions">
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => {
                      setMode('VIEW');
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="button button-primary" disabled={busy}>
                    {busy ? 'Saving…' : 'Save adjustment'}
                  </button>
                </div>
              </form>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

type AppointmentActionMode = 'CANCEL' | 'CHANGE_SERVICE' | 'REASSIGN' | 'OVERRIDE_EXCLUSION';
function AppointmentActionMenu({
  appointmentCode,
  hasPendingPayment,
  canCancel,
  canChangeService,
  canReassign,
  hasExclusion,
  onHistory,
  onPayment,
  onAction,
}: {
  appointmentCode: string;
  hasPendingPayment: boolean;
  canCancel: boolean;
  canChangeService: boolean;
  canReassign: boolean;
  hasExclusion: boolean;
  onHistory: () => void;
  onPayment: () => void;
  onAction: (mode: AppointmentActionMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const positionMenu = useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuWidth = menuRef.current?.offsetWidth ?? 240;
    const menuHeight = menuRef.current?.offsetHeight ?? 260;
    const viewportPadding = 12;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding);
    const left = Math.min(Math.max(viewportPadding, triggerRect.right - menuWidth), maxLeft);
    const opensBelow = triggerRect.bottom + 8 + menuHeight <= window.innerHeight - viewportPadding;
    const top = opensBelow
      ? triggerRect.bottom + 8
      : Math.max(viewportPadding, triggerRect.top - menuHeight - 8);
    setPosition({ top, left });
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const reposition = () => positionMenu();
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) closeMenu();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
      );
      if (!items.length) return;
      const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        items[(currentIndex + offset + items.length) % items.length]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    const frame = window.requestAnimationFrame(() => {
      reposition();
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.cancelAnimationFrame(frame);
    };
  }, [closeMenu, open, positionMenu]);

  function run(action: () => void) {
    closeMenu();
    action();
  }
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="appointment-action-trigger"
        aria-label={`Open actions for appointment ${appointmentCode}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Appointment actions"
        onClick={() => {
          if (open) closeMenu();
          else {
            positionMenu();
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!open) {
              positionMenu();
              setOpen(true);
            }
          }
        }}
      >
        <MoreHorizontal size={21} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={menuRef}
          className="appointment-action-menu"
          role="menu"
          aria-label={`Actions for appointment ${appointmentCode}`}
          style={{ top: position.top, left: position.left }}
        >
          {hasPendingPayment ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="appointment-action-menu-item appointment-action-menu-primary"
                onClick={() => run(onPayment)}
              >
                <CreditCard size={17} aria-hidden="true" />
                <span>Confirm payment</span>
              </button>
              <div className="appointment-action-menu-divider" role="separator" />
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="appointment-action-menu-item"
            onClick={() => run(onHistory)}
          >
            <History size={17} aria-hidden="true" />
            <span>History</span>
          </button>
          {canChangeService ? (
            <button
              type="button"
              role="menuitem"
              className="appointment-action-menu-item"
              onClick={() => run(() => onAction('CHANGE_SERVICE'))}
            >
              <Scissors size={17} aria-hidden="true" />
              <span>Change service</span>
            </button>
          ) : null}
          {canReassign ? (
            <button
              type="button"
              role="menuitem"
              className="appointment-action-menu-item"
              onClick={() => run(() => onAction('REASSIGN'))}
            >
              <UserCog size={17} aria-hidden="true" />
              <span>Reassign staff</span>
            </button>
          ) : null}
          {hasExclusion ? (
            <button
              type="button"
              role="menuitem"
              className="appointment-action-menu-item"
              onClick={() => run(() => onAction('OVERRIDE_EXCLUSION'))}
            >
              <SlidersHorizontal size={17} aria-hidden="true" />
              <span>Override skip</span>
            </button>
          ) : null}
          {canCancel ? (
            <>
              <div className="appointment-action-menu-divider" role="separator" />
              <button
                type="button"
                role="menuitem"
                className="appointment-action-menu-item appointment-action-menu-danger"
                onClick={() => run(() => onAction('CANCEL'))}
              >
                <X size={17} aria-hidden="true" />
                <span>Cancel appointment</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
