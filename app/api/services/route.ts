import { NextResponse } from 'next/server';
import { getDbServices, getDbShopConfig } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [services, shop] = await Promise.all([getDbServices(), getDbShopConfig()]);
  return NextResponse.json({ services, shop: { timezone: shop.timezone, openingTime: shop.openingTime, closingTime: shop.closingTime, currency: shop.currency } });
}
