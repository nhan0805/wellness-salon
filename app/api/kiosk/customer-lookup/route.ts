import { NextResponse } from 'next/server';
import { kioskCustomerLookupSchema } from '@/src/server/validation';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { lookupDbCustomerByPhone } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);

  const phone = new URL(request.url).searchParams.get('phone') ?? '';
  const parsed = kioskCustomerLookupSchema.safeParse({ phone });
  if (!parsed.success) {
    return NextResponse.json({
      found: false,
      name: null,
      ready: false,
      error: parsed.error.issues[0]?.message ?? 'Enter a valid phone number',
    }, { status: 422 });
  }

  try {
    return NextResponse.json({ ...(await lookupDbCustomerByPhone(parsed.data.phone)), ready: true });
  } catch {
    return jsonError('Unable to look up this number right now', 503);
  }
}
