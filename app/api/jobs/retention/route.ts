import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { prisma } from '@/src/server/db';
import { cleanupDbOperationalData } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const cronSecret = process.env.CRON_SECRET;
  const hasCronAccess = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret);
  const session = hasCronAccess ? null : await auth();
  if (!hasCronAccess && session?.user?.role !== 'ADMIN') return jsonError('Admin or scheduler authorization required', 403);

  try {
    const payload = await request.json().catch(() => ({}));
    const requestedRetentionDays = payload?.retentionDays;
    if (requestedRetentionDays !== undefined && (!Number.isInteger(requestedRetentionDays) || requestedRetentionDays < 30 || requestedRetentionDays > 3650)) {
      return jsonError('retentionDays must be an integer from 30 to 3650', 400);
    }
    const result = await cleanupDbOperationalData(requestedRetentionDays ?? 90);
    await prisma.auditEvent.create({
      data: {
        actorType: hasCronAccess ? 'SYSTEM' : 'ADMIN',
        actorId: hasCronAccess ? undefined : session?.user?.id,
        action: 'operational_data.retention_cleanup',
        entity: 'OperationalData',
        metadata: result,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to clean operational data', 409);
  }
}
