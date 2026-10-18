import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { adminAppointmentCancelSchema } from '@/src/server/validation';
import { cancelDbAppointment } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/appointments/cancel', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminAppointmentCancelSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid cancellation', 422);
    try {
      return NextResponse.json(await cancelDbAppointment({ ...parsed.data, adminId: actor.id }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel appointment';
      const response = jsonError(message, /D1 command lock is busy/i.test(message) ? 503 : 409);
      if (/D1 command lock is busy/i.test(message)) response.headers.set('retry-after', '1');
      return response;
    }
  });
}
