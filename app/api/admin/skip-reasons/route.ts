import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { adminSkipReasonCreateSchema, adminSkipReasonUpdateSchema } from '@/src/server/validation';
import { createDbAdminSkipReason, deleteDbAdminSkipReason, getDbAdminSkipReasons, updateDbAdminSkipReason } from '@/src/server/services/admin-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/skip-reasons', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    return NextResponse.json({ skipReasons: await getDbAdminSkipReasons() });
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/skip-reasons', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminSkipReasonCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid skip reason', 422);
    try {
      return NextResponse.json({ skipReason: await createDbAdminSkipReason({ ...parsed.data, adminId: actor.id }) }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to create skip reason', 409);
    }
  });
}

export async function PATCH(request: Request) {
  return observeApiRequest(request, 'PATCH /api/admin/skip-reasons', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminSkipReasonUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid skip reason', 422);
    try {
      return NextResponse.json({ skipReason: await updateDbAdminSkipReason({ ...parsed.data, adminId: actor.id }) });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update skip reason', 409);
    }
  });
}

export async function DELETE(request: Request) {
  return observeApiRequest(request, 'DELETE /api/admin/skip-reasons', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return jsonError('Skip reason id is required', 422);
    try {
      return NextResponse.json(await deleteDbAdminSkipReason({ id, adminId: actor.id }));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to delete skip reason', 409);
    }
  });
}
