import { NextResponse } from 'next/server';
import { ActorType } from '@prisma/d1-client';
import { auth } from '@/src/server/auth';
import { hasTrustedOrigin, jsonError, readJsonBodyOrNull } from '@/src/server/request-security';
import { cleanupDbOperationalData } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';
import { logEvent } from '@/src/server/logger';
import { getRuntimeValue } from '@/src/server/runtime-config';


export async function POST(request: Request) {
  return observeApiRequest(request, 'POST /api/jobs/retention', async () => {
    const cronSecret = await getRuntimeValue('CRON_SECRET');
    const hasCronAccess = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret);
    if (!hasTrustedOrigin(request, { allowMissing: hasCronAccess })) return jsonError('Invalid request origin', 403);
    const session = hasCronAccess ? null : await auth();
    if (!hasCronAccess && session?.user?.role !== 'ADMIN') return jsonError('Admin or scheduler authorization required', 403);

    try {
      const payload = ((await readJsonBodyOrNull(request)) ?? {}) as { retentionDays?: unknown };
      const requestedRetentionDays = payload.retentionDays === undefined
        ? undefined
        : typeof payload.retentionDays === 'number'
          ? payload.retentionDays
          : null;
      if (requestedRetentionDays === null || (requestedRetentionDays !== undefined && (!Number.isInteger(requestedRetentionDays) || requestedRetentionDays < 30 || requestedRetentionDays > 3650))) {
        return jsonError('retentionDays must be an integer from 30 to 3650', 400);
      }
      const result = await cleanupDbOperationalData(
        requestedRetentionDays ?? 90,
        {
          actorType: hasCronAccess ? ActorType.SYSTEM : ActorType.ADMIN,
          actorId: hasCronAccess ? undefined : session?.user?.id,
        },
      );
      logEvent('info', 'job.retention.completed', { retentionDays: result.retentionDays, expiredSessions: result.expiredSessions, oldReceipts: result.oldReceipts, oldLockouts: result.oldLockouts, oldRateLimitRows: result.oldRateLimitRows });
      return NextResponse.json(result);
    } catch (error) {
      logEvent('error', 'job.retention.failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      return jsonError(error instanceof Error ? error.message : 'Unable to clean operational data', 409);
    }
  });
}
