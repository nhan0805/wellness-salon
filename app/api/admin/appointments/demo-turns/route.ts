import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { observeApiRequest } from '@/src/server/observability';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import {
  backfillDbDemoAppointmentTurns,
} from '@/src/server/services/prisma-operations';
import { adminDemoTurnBackfillSchema } from '@/src/server/validation';

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/appointments/demo-turns', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminDemoTurnBackfillSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success)
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid demo turn backfill request', 422);
    if (!parsed.data.dryRun && !parsed.data.confirm)
      return jsonError('Set confirm=true to apply the demo turn backfill', 422);
    try {
      return NextResponse.json(
        await backfillDbDemoAppointmentTurns({
          dryRun: parsed.data.dryRun,
          adminId: actor.id,
        }),
      );
    } catch (error) {
      return jsonError(
        error instanceof Error ? error.message : 'Unable to backfill demo appointment turns',
        409,
      );
    }
  });
}
