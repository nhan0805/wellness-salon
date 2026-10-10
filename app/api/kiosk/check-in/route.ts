import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { checkInSchema } from '@/src/server/validation';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { createDbCheckIn } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/kiosk/check-in', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
    try {
      return NextResponse.json(await createDbCheckIn(parsed.data), { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return jsonError('A turn number conflict occurred. Please try joining again.', 409);
      }
      return jsonError(error instanceof Error && error.message === 'Service is unavailable' ? error.message : 'Unable to check in right now', 409);
    }
  });
}
