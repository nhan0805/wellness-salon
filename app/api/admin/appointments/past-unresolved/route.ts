import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import {
  getDbPastUnresolvedAppointments,
  resolveDbPastAppointment,
} from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { adminPastAppointmentResolutionSchema } from '@/src/server/validation';
import { withPrismaRuntime } from '@/src/server/db';

export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/appointments/past-unresolved', async () => {
    try {
      const actor = await getAdminActor();
      if (!actor) return jsonError('Admin authorization required', 403);
      const payload = await withPrismaRuntime(
        'admin.past-unresolved.read',
        async ({ client }) => getDbPastUnresolvedAppointments(client),
      );
      return NextResponse.json(payload);
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Unable to load past appointments',
        500,
      );
    }
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/appointments/past-unresolved', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminPastAppointmentResolutionSchema.safeParse(
      await readJsonBodyOrNull(request),
    );
    if (!parsed.success)
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid historical resolution', 422);
    try {
      return NextResponse.json(
        await resolveDbPastAppointment({ ...parsed.data, adminId: actor.id }),
      );
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Unable to resolve historical appointment',
        409,
      );
    }
  });
}
