import { NextResponse } from 'next/server';
import { auth } from '@/src/server/auth';
import { staffActionSchema } from '@/src/server/validation';
import { hasTrustedOrigin, jsonError } from '@/src/server/request-security';
import { getDbBoardState, staffActionDb } from '@/src/server/services/prisma-operations';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  const role = session?.user?.role;
  const isStaffViewer = ['STATION', 'ADMIN'].includes(role ?? '');
  return NextResponse.json({ ...(await getDbBoardState({ publicView: !isStaffViewer })), viewerRole: isStaffViewer ? role : null });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return jsonError('Invalid request origin', 403);
  const session = await auth();
  const stationUserId = session?.user?.id;
  if (!['STATION', 'ADMIN'].includes(session?.user?.role ?? '') || !stationUserId) return jsonError('Station authorization required', 403);
  const parsed = staffActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid action' }, { status: 422 });
  try {
    const verifiedSessionId = request.headers.get('cookie')?.match(/(?:^|; )(?:__Host-)?verified-staff-session=([^;]+)/)?.[1];
    const result = await staffActionDb(parsed.data, stationUserId, verifiedSessionId);
    const response = NextResponse.json(result);
    const secure = process.env.NODE_ENV === 'production' && process.env.AUTH_COOKIE_SECURE !== 'false';
    if (result.verifiedStaffSessionId) response.cookies.set(secure ? '__Host-verified-staff-session' : 'verified-staff-session', result.verifiedStaffSessionId, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 5 * 60 });
    return response;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unable to complete board action', 409);
  }
}
