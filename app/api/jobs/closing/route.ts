import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { autoCloseDbAttendance, parseBusinessDate, ShiftClosingBlockedError } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';
import { logEvent } from '@/src/server/logger';
import { getRuntimeValue } from '@/src/server/runtime-config';


export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/jobs/closing', async () => {
    const cronSecret = await getRuntimeValue('CRON_SECRET');
    const hasCronAccess = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret);
    if (!hasTrustedOrigin(request, { allowMissing: hasCronAccess })) return jsonError('Invalid request origin', 403);
    const session = hasCronAccess ? null : await auth();
    if (!hasCronAccess && session?.user?.role !== 'ADMIN') return jsonError('Admin or scheduler authorization required', 403);
    try {
      const payload = ((await readJsonBodyOrNull(request)) ?? {}) as { businessDate?: unknown; force?: unknown };
      const requestedBusinessDate = hasCronAccess && typeof payload?.businessDate === 'string'
        ? parseBusinessDate(payload.businessDate)
        : undefined;
      if (hasCronAccess && payload?.businessDate !== undefined && !requestedBusinessDate)
        return jsonError('businessDate must use YYYY-MM-DD', 400);
      const result = await autoCloseDbAttendance({
        force: !hasCronAccess && payload?.force === true,
        businessDate: requestedBusinessDate ?? undefined,
      });
      logEvent('info', 'job.closing.completed', { businessDate: result.businessDate, closedCount: result.closedCount, deferredCount: result.deferredCount, skipped: result.skipped });
      return NextResponse.json(result);
    } catch (error) {
      if (error instanceof ShiftClosingBlockedError) {
        logEvent('warn', 'job.closing.blocked', { businessDate: error.businessDate, blockerCount: error.blockers.length });
        return NextResponse.json({ error: error.message, code: error.code, businessDate: error.businessDate, blockers: error.blockers }, { status: 409 });
      }
      logEvent('error', 'job.closing.failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return jsonError(error instanceof Error ? error.message : 'Unable to close attendance', 409);
    }
  });
}
