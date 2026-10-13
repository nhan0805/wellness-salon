import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { getDbAppointmentTurnHistory } from '@/src/server/services/prisma-operations';
import { jsonError } from '@/src/server/request-security';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return observeApiRequest(request, 'GET /api/admin/appointments/:id/turn-history', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);

    const { id } = await params;
    try {
      return NextResponse.json(await getDbAppointmentTurnHistory(id));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to load appointment history', 404);
    }
  });
}
