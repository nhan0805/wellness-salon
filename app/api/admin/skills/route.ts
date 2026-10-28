import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { adminSkillCreateSchema, adminSkillUpdateSchema } from '@/src/server/validation';
import { createDbAdminSkill, deleteDbAdminSkill, getDbAdminSkillManagement, updateDbAdminSkill } from '@/src/server/services/admin-operations';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/admin/skills', async () => {
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    return NextResponse.json({ skills: await getDbAdminSkillManagement() });
  });
}

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/admin/skills', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminSkillCreateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid skill', 422);
    try {
      const skill = await createDbAdminSkill({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ skill }, { status: 201 });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to create skill', 409);
    }
  });
}

export async function PATCH(request: Request) {
  return observeApiRequest(request, 'PATCH /api/admin/skills', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const parsed = adminSkillUpdateSchema.safeParse(await readJsonBodyOrNull(request));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid skill', 422);
    try {
      const skill = await updateDbAdminSkill({ ...parsed.data, adminId: actor.id });
      return NextResponse.json({ skill });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to update skill', 409);
    }
  });
}

export async function DELETE(request: Request) {
  return observeApiRequest(request, 'DELETE /api/admin/skills', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const actor = await getAdminActor();
    if (!actor) return jsonError('Admin authorization required', 403);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return jsonError('Skill id is required', 422);
    try {
      return NextResponse.json(await deleteDbAdminSkill({ id, adminId: actor.id }));
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unable to delete skill', 409);
    }
  });
}
