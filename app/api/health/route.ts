import { NextResponse } from 'next/server';
import { prisma } from '@/src/server/db';
import { logEvent } from '@/src/server/logger';
import { observeApiRequest } from '@/src/server/observability';


export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/health', async () => {
    const checkedAt = new Date().toISOString();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return NextResponse.json({ status: 'ok', service: 'nail-shop-management', checkedAt });
    } catch (error) {
      logEvent('error', 'health.database_unavailable', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ status: 'degraded', service: 'nail-shop-management', checkedAt }, { status: 503 });
    }
  });
}
