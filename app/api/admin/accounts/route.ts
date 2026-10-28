import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { adminAccountCreateSchema, adminAccountUpdateSchema } from '@/src/server/validation';
import { createDbAdminAccount, deleteDbAdminAccount, getDbAdminAccounts, updateDbAdminAccount } from '@/src/server/services/admin-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/accounts', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    return NextResponse.json({ accounts: await getDbAdminAccounts(actor.id) });
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/accounts', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminAccountCreateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid account', 422);
    try {
      const account = await createDbAdminAccount({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ account }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to create account', 409);
    }
  });
}

export async function PATCH(request: Request) {
  return observeApiRequest(request, 'PATCH /api/admin/accounts', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminAccountUpdateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid account', 422);
    try {
      const account = await updateDbAdminAccount({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ account });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update account', 409);
    }
  });
}

export async function DELETE(request: Request) {
  return observeApiRequest(request, 'DELETE /api/admin/accounts', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return jsonError('Account id is required', 422);
    try {
      return NextResponse.json(await deleteDbAdminAccount({ id, adminId: actor.id }));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to delete account', 409);
    }
  });
}
