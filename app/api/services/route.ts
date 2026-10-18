import { NextResponse } from 'next/server';
import { getDbServices, getDbShopConfig } from '@/src/server/services/prisma-operations';
import { withPrismaRuntime } from '@/src/server/db';
import { observeApiRequest } from '@/src/server/observability';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/services', async () => {
    return withPrismaRuntime('catalog.read', async ({ client }) => {
      const [services, shop] = await Promise.all([
        getDbServices(client),
        getDbShopConfig(client),
      ]);
      return NextResponse.json(
        {
          services,
          shop: {
            timezone: shop.timezone,
            openingTime: shop.openingTime,
            closingTime: shop.closingTime,
            currency: shop.currency,
          },
        },
        { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' } },
      );
    });
  });
}
