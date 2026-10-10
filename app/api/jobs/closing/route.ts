import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { autoCloseDbAttendance, ShiftClosingBlockedError } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAccess = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret);
  const session = hasCronAccess ? null : await auth();
  if (!hasCronAccess && session?.user?.role !== 'ADMIN') return jsonError('Admin or scheduler authorization required', 403);
  try {
    const payload = await request.json().catch(() => ({}));
    return NextResponse.json(await autoCloseDbAttendance({ force: !hasCronAccess && payload?.force === true }));
  } catch (error) {
    if (error instanceof ShiftClosingBlockedError) {
      return NextResponse.json({ error: error.message, code: error.code, businessDate: error.businessDate, blockers: error.blockers }, { status: 409 });
    }
    return jsonError(error instanceof Error ? error.message : 'Unable to close attendance', 409);
  }
}
