import { normalizePhoneNumber } from '@/src/domain/phone';
import { getD1Database } from '@/src/server/db';
import { getBuildTimeValue } from '@/src/server/runtime-config';
import { sha256Hex } from '@/src/server/web-crypto';

const IP_WINDOW_SECONDS = 5 * 60;
const IP_LIMIT = 60;
const PHONE_WINDOW_SECONDS = 15 * 60;
const PHONE_LIMIT = 10;
const RATE_LIMIT_PREFIX = 'wellness-salon:kiosk-rate:v2:';

function clientAddress(request: Request) {
  const trustProxyHeaders = getBuildTimeValue('TRUST_PROXY_HEADERS') === 'true';
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    (trustProxyHeaders ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : undefined) ||
    (trustProxyHeaders ? request.headers.get('x-real-ip')?.trim() : undefined) ||
    'unknown'
  );
}

function windowStart(now: number, windowSeconds: number) {
  return Math.floor(now / windowSeconds) * windowSeconds;
}

async function incrementRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  now = Date.now(),
) {
  const database = await getD1Database();
  const currentWindow = windowStart(Math.floor(now / 1000), windowSeconds);
  const rateKey = await sha256Hex(`${RATE_LIMIT_PREFIX}${key}`);
  const windowStartedAt = new Date(currentWindow * 1000).toISOString();
  const nowIso = new Date(now).toISOString();

  const row = await database
    .prepare(
      `INSERT INTO kiosk_rate_limits (rate_key, window_started_at, request_count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(rate_key) DO UPDATE SET
         request_count = CASE
           WHEN window_started_at = ? THEN MIN(request_count + 1, ?)
           ELSE 1
         END,
         window_started_at = CASE
           WHEN window_started_at = ? THEN window_started_at
           ELSE excluded.window_started_at
         END,
         updated_at = excluded.updated_at
       RETURNING request_count`,
    )
    .bind(rateKey, windowStartedAt, nowIso, windowStartedAt, limit + 1, windowStartedAt)
    .first<{ request_count: number }>();
  if (!row) throw new Error('Unable to update kiosk rate limit');
  if (row.request_count <= limit) return { allowed: true, retryAfterSeconds: 0 };

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, currentWindow + windowSeconds - Math.floor(now / 1000)),
  };
}

export async function checkKioskRateLimits(request: Request, phone: string) {
  const ipResult = await incrementRateLimit(`ip:${clientAddress(request)}`, IP_LIMIT, IP_WINDOW_SECONDS);
  if (!ipResult.allowed) return ipResult;
  return incrementRateLimit(`phone:${normalizePhoneNumber(phone)}`, PHONE_LIMIT, PHONE_WINDOW_SECONDS);
}
