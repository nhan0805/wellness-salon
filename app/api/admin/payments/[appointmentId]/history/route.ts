import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { getDbPaymentHistory } from '@/src/server/services/prisma-operations';
import { jsonError } from '@/src/server/request-security';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ appointmentId: string }> }) {
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);

  const { appointmentId } = await params;
  try {
    return NextResponse.json(await getDbPaymentHistory(appointmentId));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to load payment history', 404);
  }
}
