import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { adminAppointmentReassignSchema } from '@/src/server/validation';
import { reassignDbAppointmentService } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/appointments/reassign', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminAppointmentReassignSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid reassignment', 422);
    try {
      return NextResponse.json(await reassignDbAppointmentService({ ...parsed.data, adminId: actor.id }));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to reassign appointment service', 409);
    }
  });
}
