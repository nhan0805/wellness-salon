import { NextResponse } from 'next/server';
import { correctPaymentSchema } from '@/src/server/validation';
import { getAdminActor } from '@/src/server/admin-auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { correctDbPayment } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const actor = await getAdminActor();
  if (!actor) return jsonError('Admin authorization required', 403);
  const parsed = correctPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payment correction' }, { status: 422 });
  try {
    return NextResponse.json(await correctDbPayment({ ...parsed.data, adminId: actor.id }));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to correct payment record', 409);
  }
}
