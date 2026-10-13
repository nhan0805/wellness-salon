import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { currentDbBusinessDate, formatBusinessDate, formatBusinessMonth, getDbAppointmentFilterOptions, getDbAppointmentsFiltered, getDbAppointmentsPage, getDbLiveAppointments, parseBusinessDate, parseBusinessMonth } from '@/src/server/services/prisma-operations';
import { jsonError } from '@/src/server/request-security';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/appointments', () => handleGet(request));
}

async function handleGet(request: Request) {
  if ((await auth())?.user?.role !== 'ADMIN') return jsonError('Admin authorization required', 403);
  const searchParams = new URL(request.url).searchParams;
  const month = searchParams.get('month');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  let start;
  let end;
  let period: 'day' | 'month' | 'range' = 'day';
  if (month !== null) {
    const currentDate = await currentDbBusinessDate();
    const monthStart = parseBusinessMonth(month ?? currentDate.toISOString().slice(0, 7));
    if (!monthStart) return jsonError('Invalid business month. Use YYYY-MM.', 400);
    start = monthStart;
    end = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
    period = 'month';
  } else if (from !== null || to !== null) {
    if (!from || !to) return jsonError('Both from and to are required for a date range.', 400);
    const rangeStart = parseBusinessDate(from);
    const rangeEnd = parseBusinessDate(to);
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return jsonError('Invalid date range. Use from/to as YYYY-MM-DD.', 400);
    start = rangeStart;
    end = new Date(rangeEnd.getTime() + 24 * 60 * 60 * 1000);
    period = 'range';
  } else {
    const dateParam = searchParams.get('date');
    const businessDate = dateParam ? parseBusinessDate(dateParam) : await currentDbBusinessDate();
    if (!businessDate) return jsonError('Invalid business date. Use YYYY-MM-DD.', 400);
    start = businessDate;
    end = new Date(businessDate.getTime() + 24 * 60 * 60 * 1000);
  }
  const status = searchParams.get('status') ?? undefined;
  const payment = searchParams.get('payment');
  const paymentMethod = searchParams.get('paymentMethod');
  const serviceCount = searchParams.get('serviceCount');
  const sort = searchParams.get('sort');
  const filters = {
    start,
    end,
    search: searchParams.get('search') ?? undefined,
    status,
    payment: payment === 'PAID' || payment === 'UNPAID' ? payment : undefined,
    paymentMethod: paymentMethod === 'CARD' || paymentMethod === 'CASH' ? paymentMethod : undefined,
    staffId: searchParams.get('staffId') ?? undefined,
    serviceId: searchParams.get('serviceId') ?? undefined,
    serviceStatus: searchParams.get('serviceStatus') ?? undefined,
    serviceCount: serviceCount === 'SINGLE' || serviceCount === 'MULTI' ? serviceCount : undefined,
    sort: sort === 'OLDEST' || sort === 'AMOUNT_DESC' || sort === 'DURATION_DESC' || sort === 'PAYMENT_NEWEST' || sort === 'PAYMENT_OLDEST' ? sort : 'NEWEST',
  } as const;
  const requestedPage = Number(searchParams.get('page') ?? '');
  const requestedPageSize = Number(searchParams.get('pageSize') ?? '');
  const isPaginated = searchParams.has('page') || searchParams.has('pageSize');
  if (isPaginated) {
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, 50) : 25;
    const [result, filterOptions] = await Promise.all([getDbAppointmentsPage(filters, page, pageSize), getDbAppointmentFilterOptions()]);
    return NextResponse.json({
      ...(period === 'month' ? { businessMonth: formatBusinessMonth(start) } : {}),
      ...(period === 'day' ? { businessDate: formatBusinessDate(start) } : {}),
      ...(period === 'range' ? { from: formatBusinessDate(start), to: formatBusinessDate(new Date(end.getTime() - 24 * 60 * 60 * 1000)) } : {}),
      appointments: result.appointments,
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
      summary: { totalRevenue: result.totalRevenue, totalDuration: result.totalDuration },
      filterOptions,
    });
  }
  const isLiveSnapshot =
    period === 'day' &&
    !filters.search &&
    !filters.status &&
    !filters.payment &&
    !filters.paymentMethod &&
    !filters.staffId &&
    !filters.serviceId &&
    !filters.serviceStatus &&
    !filters.serviceCount;
  const appointments = isLiveSnapshot
    ? await getDbLiveAppointments(start)
    : await getDbAppointmentsFiltered(filters);
  return NextResponse.json({
    ...(period === 'month' ? { businessMonth: formatBusinessMonth(start) } : {}),
    ...(period === 'day' ? { businessDate: formatBusinessDate(start) } : {}),
    ...(period === 'range' ? { from: formatBusinessDate(start), to: formatBusinessDate(new Date(end.getTime() - 24 * 60 * 60 * 1000)) } : {}),
    appointments,
  });
}
