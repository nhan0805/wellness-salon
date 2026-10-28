import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { adminAttendanceSchema } from '@/src/server/validation';
import { getDbAdminAttendance } from '@/src/server/services/admin-operations';
import { staffActionDb } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/attendance', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    return NextResponse.json({ attendance: await getDbAdminAttendance() });
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/attendance', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminAttendanceSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid attendance action', 422);
    try {
      await staffActionDb(parsed.data, actor.id!, undefined, true);
      return NextResponse.json({ attendance: await getDbAdminAttendance() });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update attendance', 409);
    }
  });
}
