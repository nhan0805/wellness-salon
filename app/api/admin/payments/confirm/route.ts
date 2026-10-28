import { NextResponse } from 'next/server';
import { confirmPaymentSchema } from '@/src/server/validation';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { auth } from '@/src/server/auth';
import { confirmDbPayment } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';


async function adminIdForRequest() {
  const session = await auth();
  return session?.user?.role === 'ADMIN' ? session.user.id : null;
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/payments/confirm', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const adminId = await adminIdForRequest();
    if (adminId === null) return jsonError('Admin authorization required', 403);
    const parsed = confirmPaymentSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payment' }, { status: 422 });
    try {
      return NextResponse.json(await confirmDbPayment({ ...parsed.data, adminId: adminId! }));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to confirm payment', 409);
    }
  });
}
