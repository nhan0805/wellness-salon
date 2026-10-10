import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { autoCloseDbAttendance } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAccess = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret);
  const session = hasCronAccess ? null : await auth();
  if (!hasCronAccess && session?.user?.role !== 'ADMIN') return jsonError('Admin or scheduler authorization required', 403);
  try {
    return NextResponse.json(await autoCloseDbAttendance());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to close attendance', 409);
  }
}
