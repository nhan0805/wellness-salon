import { NextResponse } from 'next/server';
import { refundPaymentSchema } from '@/src/server/validation';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { refundDbPayment } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/payments/refund', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = refundPaymentSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid refund' }, { status: 422 });
    try {
      return NextResponse.json(await refundDbPayment({ ...parsed.data, adminId: actor.id }));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to record refund', 409);
    }
  });
}
