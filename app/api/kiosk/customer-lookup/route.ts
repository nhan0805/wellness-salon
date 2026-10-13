import { NextResponse } from 'next/server';
import { kioskCustomerLookupSchema } from '@/src/server/validation';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { lookupDbCustomerByPhone } from '@/src/server/services/prisma-operations';
import { observeApiRequest } from '@/src/server/observability';


function privateLookupResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export async function GET(request: Request) {
  return observeApiRequest(request, 'GET /api/kiosk/customer-lookup', async () => {
    if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);

    const phone = new URL(request.url).searchParams.get('phone') ?? '';
    const parsed = kioskCustomerLookupSchema.safeParse({ phone });
    if (!parsed.success) {
      return privateLookupResponse({
        found: false,
        name: null,
        ready: false,
        error: parsed.error.issues[0]?.message ?? 'Enter a valid phone number',
      }, { status: 422 });
    }

    try {
      return privateLookupResponse({ ...(await lookupDbCustomerByPhone(parsed.data.phone)), ready: true });
    } catch {
      return privateLookupResponse({ error: 'Unable to look up this number right now' }, { status: 503 });
    }
  });
}
