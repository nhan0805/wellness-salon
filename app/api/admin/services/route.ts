import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { adminServiceCreateSchema, adminServiceUpdateSchema } from '@/src/server/validation';
import { createDbAdminService, deactivateDbAdminService, getDbAdminServices, updateDbAdminService } from '@/src/server/services/admin-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/services', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    return NextResponse.json(await getDbAdminServices());
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/services', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminServiceCreateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid service', 422);
    try {
      const service = await createDbAdminService({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ service }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to create service', 409);
    }
  });
}

export async function PATCH(request: Request) {
  return observeApiRequest(request, 'PATCH /api/admin/services', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminServiceUpdateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid service', 422);
    try {
      const service = await updateDbAdminService({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ service });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update service', 409);
    }
  });
}

export async function DELETE(request: Request) {
  return observeApiRequest(request, 'DELETE /api/admin/services', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return jsonError('Service id is required', 422);
    try {
      const result = await deactivateDbAdminService({ id, adminId: actor.id });
      return NextResponse.json(result);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to archive service', 409);
    }
  });
}
