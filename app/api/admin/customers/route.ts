import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { adminCustomerCreateSchema, adminCustomerUpdateSchema } from '@/src/server/validation';
import { createDbAdminCustomer, deleteDbAdminCustomer, getDbAdminCustomersPage, updateDbAdminCustomer } from '@/src/server/services/admin-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/customers', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const searchParams = new URL(request.url).searchParams;
    const page = Number(searchParams.get('page') ?? '1');
    const pageSize = Number(searchParams.get('pageSize') ?? '50');
    const result = await getDbAdminCustomersPage({
      search: searchParams.get('search') ?? undefined,
      page: Number.isInteger(page) && page > 0 ? page : 1,
      pageSize: Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 50,
    });
    return NextResponse.json(result);
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/customers', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminCustomerCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid customer', 422);
    try {
      const customer = await createDbAdminCustomer({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ customer }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to create customer', 409);
    }
  });
}

export async function PATCH(request: Request) {
  return observeApiRequest(request, 'PATCH /api/admin/customers', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminCustomerUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid customer', 422);
    try {
      const customer = await updateDbAdminCustomer({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ customer });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update customer', 409);
    }
  });
}

export async function DELETE(request: Request) {
  return observeApiRequest(request, 'DELETE /api/admin/customers', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return jsonError('Customer id is required', 422);
    try {
      const result = await deleteDbAdminCustomer({ id, adminId: actor.id });
      return NextResponse.json(result);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to delete customer', 409);
    }
  });
}
