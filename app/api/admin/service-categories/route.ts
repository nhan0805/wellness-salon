import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { adminServiceCategoryCreateSchema, adminServiceCategoryUpdateSchema } from '@/src/server/validation';
import { createDbAdminServiceCategory, deactivateDbAdminServiceCategory, getDbAdminServiceCategories, updateDbAdminServiceCategory } from '@/src/server/services/admin-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/service-categories', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    return NextResponse.json({ categories: await getDbAdminServiceCategories() });
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/service-categories', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminServiceCategoryCreateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid service category', 422);
    try {
      const category = await createDbAdminServiceCategory({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ category }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to create service category', 409);
    }
  });
}

export async function PATCH(request: Request) {
  return observeApiRequest(request, 'PATCH /api/admin/service-categories', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminServiceCategoryUpdateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid service category', 422);
    try {
      const category = await updateDbAdminServiceCategory({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ category });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update service category', 409);
    }
  });
}

export async function DELETE(request: Request) {
  return observeApiRequest(request, 'DELETE /api/admin/service-categories', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return jsonError('Service category id is required', 422);
    try {
      const result = await deactivateDbAdminServiceCategory({ id, adminId: actor.id });
      return NextResponse.json(result);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to archive service category', 409);
    }
  });
}
