import { NextResponse } from 'next/server';
import { getDbServices } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ services: await getDbServices() });
}
