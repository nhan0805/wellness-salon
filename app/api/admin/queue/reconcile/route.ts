import { NextResponse } from 'next/server';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { reconcileDbAssignments } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);
  try {
    const result = await reconcileDbAssignments(undefined, actor.id);
    return NextResponse.json({ ...result, repairedBy: actor.id });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to reconcile queue', 409);
  }
}
