import { AppointmentStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { parseBusinessDate } from '@/src/server/services/prisma-operations';
import { getDbAdminCustomerHistory } from '@/src/server/services/admin-operations';
import { jsonError } from '@/src/server/request-security';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);

  const { id } = await params;
  const searchParams = new URL(request.url).searchParams;
  const fromValue = searchParams.get('from')?.trim() || undefined;
  const toValue = searchParams.get('to')?.trim() || undefined;
  const statusValue = searchParams.get('status')?.trim() || undefined;
  const fromDate = fromValue ? parseBusinessDate(fromValue) : undefined;
  const toDate = toValue ? parseBusinessDate(toValue) : undefined;

  if ((fromValue && !fromDate) || (toValue && !toDate)) return jsonError('Use valid dates in YYYY-MM-DD format', 422);
  const from = fromDate ?? undefined;
  const to = toDate ?? undefined;
  if (from && to && from > to) return jsonError('The start date must be before the end date', 422);
  if (statusValue && !Object.values(AppointmentStatus).includes(statusValue as AppointmentStatus)) return jsonError('Invalid appointment status', 422);

  try {
    const history = await getDbAdminCustomerHistory(id, { from, to, status: statusValue as AppointmentStatus | undefined });
    return NextResponse.json(history);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to load customer history', 404);
  }
}
