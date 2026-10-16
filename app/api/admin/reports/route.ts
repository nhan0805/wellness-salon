import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { calculateReconciliation } from '@/src/domain/reconciliation';
import { currentDbBusinessDate, getDbMonthlyReport, getDbReport, parseBusinessDate, parseBusinessMonth } from '@/src/server/services/prisma-operations';
import { withPrismaRuntime, type D1PrismaRuntime } from '@/src/server/db';
import { jsonError } from '@/src/server/request-security';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/reports', () => handleGet(request));
}

async function handleGet(request: Request) {
  if ((await auth())?.user?.role !== 'ADMIN') return jsonError('Admin authorization required', 403);
  return withPrismaRuntime('admin.report.read', ({ client }) =>
    handleGetWithClient(request, client),
  );
}

async function handleGetWithClient(request: Request, client: D1PrismaRuntime) {
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get('period') === 'month') {
    const currentDate = await currentDbBusinessDate(new Date(), client);
    const monthStart = parseBusinessMonth(searchParams.get('month') ?? currentDate.toISOString().slice(0, 7));
    if (!monthStart) return jsonError('Invalid business month. Use YYYY-MM.', 400);
    const report = await getDbMonthlyReport(monthStart, client);
    return NextResponse.json({ ...report, reconciliation: calculateReconciliation(report) });
  }
  const dateParam = searchParams.get('date');
  const businessDate = dateParam
    ? parseBusinessDate(dateParam)
    : await currentDbBusinessDate(new Date(), client);
  if (!businessDate) return jsonError('Invalid business date. Use YYYY-MM-DD.', 400);
  const report = await getDbReport(businessDate, client);
  return NextResponse.json({ ...report, reconciliation: calculateReconciliation(report) });
}
