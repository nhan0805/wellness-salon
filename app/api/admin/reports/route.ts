import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { calculateReconciliation } from '@/src/domain/reconciliation';
import { getDbMonthlyReport, getDbReport, parseBusinessDate, parseBusinessMonth } from '@/src/server/services/prisma-operations';
import { jsonError } from '@/src/server/request-security';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if ((await auth())?.user?.role !== 'ADMIN') return jsonError('Admin authorization required', 403);
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get('period') === 'month') {
    const monthStart = parseBusinessMonth(searchParams.get('month'));
    if (!monthStart) return jsonError('Invalid business month. Use YYYY-MM.', 400);
    const report = await getDbMonthlyReport(monthStart);
    return NextResponse.json({ ...report, reconciliation: calculateReconciliation(report) });
  }
  const businessDate = parseBusinessDate(searchParams.get('date'));
  if (!businessDate) return jsonError('Invalid business date. Use YYYY-MM-DD.', 400);
  const report = await getDbReport(businessDate);
  return NextResponse.json({ ...report, reconciliation: calculateReconciliation(report) });
}
