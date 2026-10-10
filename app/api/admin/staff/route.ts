import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { adminStaffCreateSchema, adminStaffUpdateSchema } from '@/src/server/validation';
import { createDbAdminStaff, deactivateDbAdminStaff, getDbAdminStaff, updateDbAdminStaff } from '@/src/server/services/admin-operations';

export const runtime = 'nodejs';

export async function GET() {
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);
  return NextResponse.json(await getDbAdminStaff());
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);
  const parsed = adminStaffCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid staff record', 422);
  try {
    const staff = await createDbAdminStaff({ ...parsed.data, adminId: actor.id });
    return NextResponse.json({ staff }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to create staff', 409);
  }
}

export async function PATCH(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);
  const parsed = adminStaffUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid staff record', 422);
  try {
    const staff = await updateDbAdminStaff({ ...parsed.data, adminId: actor.id });
    return NextResponse.json({ staff });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to update staff', 409);
  }
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Staff id is required', 422);
  try {
    const result = await deactivateDbAdminStaff({ id, adminId: actor.id });
    return NextResponse.json({ staff: result });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to deactivate staff', 409);
  }
}
