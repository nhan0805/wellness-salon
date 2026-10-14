import { Prisma } from '@prisma/d1-client';
import { NextResponse } from 'next/server';
import { checkInSchema } from '@/src/server/validation';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { createDbCheckIn, KioskCheckInClosedError } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';
import { logEvent } from '@/src/server/logger';


export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/kiosk/check-in', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
    const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
    try {
      return NextResponse.json(await createDbCheckIn(parsed.data), { status: 201 });
    } catch (error) {
      if (error instanceof KioskCheckInClosedError) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
            openingTime: error.openingTime,
            closingTime: error.closingTime,
            timezone: error.timezone,
          },
          { status: 409 },
        );
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return jsonError('A turn number conflict occurred. Please try joining again.', 409);
      }
      logEvent('error', 'kiosk.check_in.failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return jsonError(error instanceof Error && error.message === 'Service is unavailable' ? error.message : 'Unable to check in right now', 409);
    }
  });
}
