import { headers } from 'next/headers';
import { z } from 'zod';
import { getD1Database } from '@/src/server/db';
import { logEvent } from '@/src/server/logger';
import { hasTrustedOrigin, readJsonBodyOrNull } from '@/src/server/request-security';
import { assertDbLoginNotLocked, recordDbLoginAttempt, verifySecret } from '@/src/server/security';
import { getRuntimeValue, isProductionRuntime } from '@/src/server/runtime-config';
import { signHs256, verifyHs256 } from '@/src/server/web-crypto';

export type AuthRole = 'ADMIN' | 'STATION';

export type AuthUser = { id: string; email: string; name: string; role: AuthRole };
export type AuthSession = { user: AuthUser };

type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string | null;
  passwordHash: string;
  role: AuthRole;
  isActive: boolean;
  sessionVersion: number;
};

type AuthClaims = {
  sub: string;
  email: string;
  name: string;
  role: AuthRole;
  sessionVersion: number;
  iat: number;
  exp: number;
};

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

async function currentCookieHeader(request?: Request) {
  if (request) return request.headers.get('cookie');
  try {
    return (await headers()).get('cookie');
  } catch {
    return null;
  }
}

function readCookie(value: string | null, name: string) {
  if (!value) return null;
  const prefix = `${name}=`;
  const item = value.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : null;
}

async function cookieName() {
  const secure = isProductionRuntime() && (await getRuntimeValue('AUTH_COOKIE_SECURE', 'true')) !== 'false';
  return secure ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

async function authSecret() {
  const secret = await getRuntimeValue('AUTH_SECRET');
  if (!secret || secret.length < 32) return null;
  return secret;
}

function safeDisplayName(displayName: string | null | undefined, role: AuthRole) {
  return displayName?.trim() || (role === 'ADMIN' ? 'Administrator' : 'Station account');
}

async function findAuthUser(where: { id?: string; email?: string }): Promise<AuthUserRecord | null> {
  const database = await getD1Database();
  const column = where.id ? 'id' : 'email';
  const value = where.id ?? where.email;
  const row = await database
    .prepare(`SELECT id, email, display_name, password_hash, role, is_active, session_version FROM auth_users WHERE ${column} = ? LIMIT 1`)
    .bind(value)
    .first<{ id: string; email: string; display_name: string | null; password_hash: string; role: AuthRole; is_active: number; session_version: number }>();
  return row
    ? { id: row.id, email: row.email, displayName: row.display_name, passwordHash: row.password_hash, role: row.role, isActive: Boolean(row.is_active), sessionVersion: Number(row.session_version) }
    : null;
}

async function currentUserFromClaims(claims: AuthClaims): Promise<AuthSession | null> {
  if (!claims.sub || !claims.email || !claims.role || claims.exp <= Math.floor(Date.now() / 1000)) return null;
  const current = await findAuthUser({ id: claims.sub });
  if (!current?.isActive || current.role !== claims.role || current.sessionVersion !== claims.sessionVersion) return null;
  return { user: { id: current.id, email: current.email, name: safeDisplayName(current.displayName, current.role), role: current.role } };
}

export async function auth(request?: Request): Promise<AuthSession | null> {
  const secret = await authSecret();
  if (!secret) return null;
  const token = readCookie(await currentCookieHeader(request), await cookieName());
  if (!token) return null;
  const claims = await verifyHs256<AuthClaims>(token, secret);
  return claims ? currentUserFromClaims(claims) : null;
}

async function authenticateCredentials(rawCredentials: unknown) {
  const parsed = credentialsSchema.safeParse(rawCredentials);
  if (!parsed.success) return null;
  const email = parsed.data.email.trim().toLowerCase();
  await assertDbLoginNotLocked(email);
  const user = await findAuthUser({ email });
  if (!user?.isActive) return null;
  const valid = await verifySecret(user.passwordHash, parsed.data.password);
  if (!valid) {
    await recordDbLoginAttempt(email, false);
    return null;
  }
  try {
    // Clearing an expired lockout is housekeeping. Do not let a temporary D1
    // write/quota failure block a credential that has already been verified.
    await recordDbLoginAttempt(email, true);
  } catch {
    logEvent('warn', 'auth.login_lockout_cleanup_skipped', { reason: 'd1_write_unavailable' });
  }
  return { id: user.id, email: user.email, name: safeDisplayName(user.displayName, user.role), role: user.role, sessionVersion: user.sessionVersion };
}

async function sessionToken(user: { id: string; email: string; name: string; role: AuthRole; sessionVersion: number }) {
  const secret = await authSecret();
  if (!secret) throw new Error('AUTH_SECRET must be configured with at least 32 characters');
  const now = Math.floor(Date.now() / 1000);
  return signHs256({ sub: user.id, email: user.email, name: user.name, role: user.role, sessionVersion: user.sessionVersion, iat: now, exp: now + SESSION_MAX_AGE_SECONDS } satisfies AuthClaims, secret);
}

function appendCookie(response: Response, name: string, value: string, maxAge: number, secure: boolean) {
  const attributes = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (secure) attributes.push('Secure');
  response.headers.append('set-cookie', attributes.join('; '));
}

async function authResponseCookieConfig() {
  return { name: await cookieName(), secure: isProductionRuntime() && (await getRuntimeValue('AUTH_COOKIE_SECURE', 'true')) !== 'false' };
}

async function login(request: Request) {
  if (!hasTrustedOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  let body: unknown;
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    body = { email: form.get('email'), password: form.get('password') };
  } else body = await readJsonBodyOrNull(request);
  try {
    const user = await authenticateCredentials(body);
    if (!user) return Response.json({ error: 'Unable to sign in. Check your email and password and try again.' }, { status: 401 });
    const response = Response.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    const config = await authResponseCookieConfig();
    appendCookie(response, config.name, await sessionToken(user), SESSION_MAX_AGE_SECONDS, config.secure);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message.includes('temporarily locked')) return Response.json({ error: 'Unable to sign in. Check your email and password and try again.' }, { status: 429 });
    throw error;
  }
}

async function logout(request: Request) {
  if (!hasTrustedOrigin(request)) return Response.json({ error: 'Invalid request origin' }, { status: 403 });
  const response = Response.json({ ok: true });
  const config = await authResponseCookieConfig();
  appendCookie(response, config.name, '', 0, config.secure);
  return response;
}

export async function handleAuthRequest(request: Request) {
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path.endsWith('/session')) {
    const session = await auth(request);
    const response = Response.json(session ?? {});
    response.headers.set('cache-control', 'no-store');
    return response;
  }
  if (request.method === 'GET' && path.endsWith('/csrf')) return Response.json({ csrfToken: 'same-origin' });
  if (request.method === 'POST' && (path.endsWith('/login') || path.endsWith('/callback/credentials'))) return login(request);
  if (request.method === 'POST' && (path.endsWith('/logout') || path.endsWith('/signout'))) return logout(request);
  return Response.json({ error: 'Not found' }, { status: 404 });
}
