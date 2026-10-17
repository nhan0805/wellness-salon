import { normalizePhoneNumber } from '@/src/domain/phone';
import { getD1Database } from '@/src/server/db';
import { randomId, sha256Hex } from '@/src/server/web-crypto';

const IP_WINDOW_SECONDS = 5 * 60;
const IP_LIMIT = 60;
const PHONE_WINDOW_SECONDS = 15 * 60;
const PHONE_LIMIT = 10;
const RATE_LIMIT_PREFIX = 'wellness-salon:kiosk-rate:v1:';

function clientAddress(request: Request) {
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
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
  const scope = `kiosk-rate:${windowSeconds}:${new Date(currentWindow * 1000).toISOString()}`;
  const rateKey = await sha256Hex(`${RATE_LIMIT_PREFIX}${key}`);
  const nowIso = new Date(now).toISOString();

  const inserted = await database
    .prepare(
      `INSERT INTO command_receipts (id, scope, key, response, request_hash, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)
       ON CONFLICT(scope, key) DO NOTHING`,
    )
    .bind(randomId(), scope, rateKey, JSON.stringify({ count: 1 }), nowIso)
    .run();
  if ((inserted.meta?.changes ?? 0) === 1) return { allowed: true, retryAfterSeconds: 0 };

  const incremented = await database
    .prepare(
      `UPDATE command_receipts
       SET response = json_set(response, '$.count', CAST(json_extract(response, '$.count') AS INTEGER) + 1), created_at = ?
       WHERE scope = ? AND key = ?
         AND CAST(json_extract(response, '$.count') AS INTEGER) < ?`,
    )
    .bind(nowIso, scope, rateKey, limit)
    .run();
  if ((incremented.meta?.changes ?? 0) === 1) return { allowed: true, retryAfterSeconds: 0 };

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
