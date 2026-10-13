import { NextResponse } from 'next/server';
import { adjustPaymentSchema } from '@/src/server/validation';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { adjustDbPayment } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/payments/adjust', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adjustPaymentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payment adjustment' }, { status: 422 });
    try {
      return NextResponse.json(await adjustDbPayment({ ...parsed.data, adminId: actor.id }));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to adjust payment', 409);
    }
  });
}
