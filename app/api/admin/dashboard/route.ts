import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { calculateReconciliation } from '@/src/domain/reconciliation';
import {
  currentBusinessDate,
  formatBusinessDate,
  formatBusinessMonth,
  getDbAppointmentFilterOptions,
  getDbAppointmentsPage,
  getDbLiveAppointments,
  getDbMonthlyReport,
  getDbReport,
  getDbShopConfig,
  parseBusinessDate,
  parseBusinessMonth,
  type AdminAppointmentFilters,
} from '@/src/server/services/prisma-operations';
import { withPrismaRuntime, type D1PrismaRuntime } from '@/src/server/db';
import { jsonError } from '@/src/server/request-security';
import { observeApiRequest } from '@/src/server/observability';
import { logEvent } from '@/src/server/logger';

type DashboardSection = 'live' | 'appointments' | 'reports' | 'config';

const dashboardSections = new Set<DashboardSection>(['live', 'appointments', 'reports', 'config']);

function requestedSections(searchParams: URLSearchParams) {
  const raw = searchParams.get('include');
  if (!raw) return new Set<DashboardSection>(dashboardSections);
  const sections = new Set<DashboardSection>();
  for (const value of raw.split(',')) {
    if (dashboardSections.has(value as DashboardSection)) sections.add(value as DashboardSection);
  }
  return sections.size ? sections : new Set<DashboardSection>(dashboardSections);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to load dashboard data';
}

async function handleGet(request: Request, client: D1PrismaRuntime) {
  const searchParams = new URL(request.url).searchParams;
  const sections = requestedSections(searchParams);
  const period = searchParams.get('period') === 'month' ? 'month' : 'day';
  const dateParam = searchParams.get('date');
  const monthParam = searchParams.get('month');
  let shopConfigPromise: ReturnType<typeof getDbShopConfig> | undefined;
  const getShopConfig = () => (shopConfigPromise ??= getDbShopConfig(client));
  let currentDatePromise: Promise<Date> | undefined;
  const getCurrentBusinessDate = () =>
    (currentDatePromise ??=
      getShopConfig().then((shop) => currentBusinessDate(new Date(), shop.timezone)));

  let scope: { start: Date; end: Date; period: 'day' | 'month' } | undefined;
  if (sections.has('appointments') || sections.has('reports')) {
    if (period === 'month') {
      const currentDate = await getCurrentBusinessDate();
      const monthStart = parseBusinessMonth(monthParam ?? currentDate.toISOString().slice(0, 7));
      if (!monthStart) return jsonError('Invalid business month. Use YYYY-MM.', 400);
      scope = {
        start: monthStart,
        end: new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1)),
        period: 'month',
      };
    } else {
      const businessDate = dateParam ? parseBusinessDate(dateParam) : await getCurrentBusinessDate();
      if (!businessDate) return jsonError('Invalid business date. Use YYYY-MM-DD.', 400);
      scope = {
        start: businessDate,
        end: new Date(businessDate.getTime() + 24 * 60 * 60 * 1000),
        period: 'day',
      };
    }
  }

  const tasks = new Map<DashboardSection, Promise<unknown>>();

  if (sections.has('live')) {
    tasks.set(
      'live',
      getCurrentBusinessDate().then((businessDate) =>
        getDbLiveAppointments(businessDate, client).then((appointments) => ({ appointments })),
      ),
    );
  }

  if (scope && sections.has('appointments')) {
    const start = scope.start;
    const end = scope.end;
    const filters: AdminAppointmentFilters = {
      start,
      end,
      search: searchParams.get('search') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      payment:
        searchParams.get('payment') === 'PAID' || searchParams.get('payment') === 'UNPAID'
          ? (searchParams.get('payment') as 'PAID' | 'UNPAID')
          : undefined,
      paymentMethod:
        searchParams.get('paymentMethod') === 'CARD' || searchParams.get('paymentMethod') === 'CASH'
          ? (searchParams.get('paymentMethod') as 'CARD' | 'CASH')
          : undefined,
      staffId: searchParams.get('staffId') ?? undefined,
      serviceId: searchParams.get('serviceId') ?? undefined,
      serviceStatus: searchParams.get('serviceStatus') ?? undefined,
      serviceCount:
        searchParams.get('serviceCount') === 'SINGLE' || searchParams.get('serviceCount') === 'MULTI'
          ? (searchParams.get('serviceCount') as 'SINGLE' | 'MULTI')
          : undefined,
      sort:
        searchParams.get('sort') === 'OLDEST' ||
        searchParams.get('sort') === 'AMOUNT_DESC' ||
        searchParams.get('sort') === 'DURATION_DESC' ||
        searchParams.get('sort') === 'PAYMENT_NEWEST' ||
        searchParams.get('sort') === 'PAYMENT_OLDEST'
          ? (searchParams.get('sort') as AdminAppointmentFilters['sort'])
          : 'NEWEST',
    };
    const requestedPage = Number(searchParams.get('page') ?? '1');
    const requestedPageSize = Number(searchParams.get('pageSize') ?? '3');
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 50) : 3;
    tasks.set(
      'appointments',
      Promise.all([
        getDbAppointmentsPage(filters, page, pageSize, client),
        getDbAppointmentFilterOptions(client),
      ]).then(
        ([result, filterOptions]) => ({
          ...(scope.period === 'month' ? { businessMonth: formatBusinessMonth(start) } : { businessDate: formatBusinessDate(start) }),
          appointments: result.appointments,
          pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
          summary: { totalRevenue: result.totalRevenue, totalDuration: result.totalDuration },
          filterOptions,
        }),
      ),
    );
  }

  if (scope && sections.has('reports')) {
    tasks.set(
      'reports',
      (scope.period === 'month'
        ? getDbMonthlyReport(scope.start, client)
        : getDbReport(scope.start, client)).then((report) => ({
        ...report,
        reconciliation: calculateReconciliation(report),
      })),
    );
  }

  if (sections.has('config')) {
    tasks.set(
      'config',
      getShopConfig().then((shop) => ({
        shop: {
          timezone: shop.timezone,
          openingTime: shop.openingTime,
          closingTime: shop.closingTime,
          currency: shop.currency,
        },
      })),
    );
  }

  const entries = [...tasks.entries()];
  const results = await Promise.allSettled(entries.map(([, task]) => task));
  const response: Record<string, unknown> = {};
  const errors: Array<{ section: DashboardSection; message: string }> = [];
  results.forEach((result, index) => {
    const [section] = entries[index];
    if (result.status === 'fulfilled') response[section] = result.value;
    else errors.push({ section, message: errorMessage(result.reason) });
  });
  if (errors.length) response.errors = errors;
  if (errors.length) {
    logEvent('warn', 'admin.dashboard.partial', {
      failedSections: errors.map((error) => error.section).join(','),
      failedCount: errors.length,
    });
  }
  return NextResponse.json(response);
}

export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/dashboard', async () => {
    if ((await auth())?.user?.role !== 'ADMIN') return jsonError('Admin authorization required', 403);
    return withPrismaRuntime('admin.dashboard', ({ client }) => handleGet(request, client));
  });
}
