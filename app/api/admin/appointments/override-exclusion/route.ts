import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { adminTurnExclusionOverrideSchema } from '@/src/server/validation';
import { overrideDbTurnExclusion } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);
  const parsed = adminTurnExclusionOverrideSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? 'Invalid exclusion override', 422);
  try {
    return NextResponse.json(await overrideDbTurnExclusion({ ...parsed.data, adminId: actor.id }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to override turn exclusion', 409);
  }
}
