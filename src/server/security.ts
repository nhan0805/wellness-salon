import { argon2Verify } from 'hash-wasm';
import { getD1Database, prisma, withD1Lease } from '@/src/server/db';
import { decodeBase64Url, encodeBase64Url } from '@/src/server/web-crypto';

// Web Crypto PBKDF2 is available in Workers without dynamically compiling a
// native module. D1 bootstrap and account-management writes use this format.
// Cloudflare Workers Web Crypto currently rejects PBKDF2 iteration counts
// above 100,000. Keep the application and D1 bootstrap on the same maximum
// supported value so credentials can be verified in production.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH_LENGTH = 32;

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePbkdf2(secret: string, salt: Uint8Array, iterations: number) {
  const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, PBKDF2_HASH_LENGTH * 8);
  return new Uint8Array(bits);
}

export async function hashSecret(secret: string) {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const digest = await derivePbkdf2(secret, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(digest)}`;
}

async function verifyPbkdf2(hash: string, secret: string) {
  const [algorithm, iterationText, saltText, digestText] = hash.split('$');
  const iterations = Number(iterationText);
  if (algorithm !== 'pbkdf2-sha256' || !Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 2_000_000 || !saltText || !digestText) return false;
  try {
    const expected = decodeBase64Url(digestText);
    const salt = decodeBase64Url(saltText);
    const actual = await derivePbkdf2(secret, salt, iterations);
    const valid = constantTimeEqual(actual, expected);
    return valid;
  } catch (error) {
    return false;
  }
}

export async function verifySecret(hash: string, secret: string) {
  if (hash.startsWith('pbkdf2-sha256$')) return verifyPbkdf2(hash, secret);
  if (!hash.startsWith('$argon2')) return false;
  try {
    return await argon2Verify({ hash, password: secret });
  } catch {
    return false;
  }
}

type AttemptState = { failures: number; lockedUntil: number };
const pinAttempts = new Map<string, AttemptState>();

export function assertPinNotLocked(staffId: string, now = Date.now()) {
  const state = pinAttempts.get(staffId);
  if (state && state.lockedUntil > now) throw new Error('PIN temporarily locked. Try again shortly.');
}

export function recordPinAttempt(staffId: string, successful: boolean, now = Date.now()) {
  if (successful) {
    pinAttempts.delete(staffId);
    return;
  }
  const state = pinAttempts.get(staffId) ?? { failures: 0, lockedUntil: 0 };
  const failures = state.failures + 1;
  pinAttempts.set(staffId, { failures, lockedUntil: failures >= 5 ? now + 60_000 : 0 });
}

export function resetPinAttemptsForTests() {
  pinAttempts.clear();
}

/**
 * The in-memory limiter gives immediate protection on a single process. The
 * database record makes the same lockout survive a restart and apply across
 * multiple tablet/API processes.
 */
export async function assertDbPinNotLocked(staffId: string, now = new Date()) {
  assertPinNotLocked(staffId, now.getTime());
  const state = await prisma.staffPinLockout.findUnique({ where: { staffId }, select: { lockedUntil: true } });
  if (state?.lockedUntil && state.lockedUntil > now) throw new Error('PIN temporarily locked. Try again shortly.');
}

export async function recordDbPinAttempt(staffId: string, successful: boolean, now = new Date()) {
  recordPinAttempt(staffId, successful, now.getTime());
  return withD1Lease(async (database) => {
    if (successful) {
      await database.prepare('DELETE FROM staff_pin_lockouts WHERE staff_id = ?').bind(staffId).run();
      return;
    }
    const current = await database
      .prepare('SELECT failure_count FROM staff_pin_lockouts WHERE staff_id = ?')
      .bind(staffId)
      .first<{ failure_count: number }>();
    const failureCount = Number(current?.failure_count ?? 0) + 1;
    const lockedUntil = failureCount >= 5 ? new Date(now.getTime() + 60_000).toISOString().replace('Z', '+00:00') : null;
    const nowIso = now.toISOString().replace('Z', '+00:00');
    await database
      .prepare(`INSERT INTO staff_pin_lockouts (staff_id, failure_count, locked_until, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(staff_id) DO UPDATE SET failure_count = excluded.failure_count, locked_until = excluded.locked_until, updated_at = excluded.updated_at`)
      .bind(staffId, failureCount, lockedUntil, nowIso)
      .run();
  });
}

const LOGIN_LOCK_FAILURES = 5;
const LOGIN_LOCK_DURATION_MS = 60_000;

function normalizeLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function assertDbLoginNotLocked(email: string, now = new Date()) {
  const normalizedEmail = normalizeLoginEmail(email);
  const database = await getD1Database();
  const state = await database
    .prepare('SELECT locked_until FROM auth_login_lockouts WHERE email = ? LIMIT 1')
    .bind(normalizedEmail)
    .first<{ locked_until: string | null }>();
  if (state?.locked_until && new Date(state.locked_until) > now) throw new Error('Account temporarily locked. Try again shortly.');
}

export async function recordDbLoginAttempt(email: string, successful: boolean, now = new Date()) {
  const normalizedEmail = normalizeLoginEmail(email);
  return withD1Lease(async (database) => {
    if (successful) {
      await database.prepare('DELETE FROM auth_login_lockouts WHERE email = ?').bind(normalizedEmail).run();
      return;
    }
    const current = await database
      .prepare('SELECT failure_count FROM auth_login_lockouts WHERE email = ?')
      .bind(normalizedEmail)
      .first<{ failure_count: number }>();
    const failureCount = Number(current?.failure_count ?? 0) + 1;
    const lockedUntil = failureCount >= LOGIN_LOCK_FAILURES ? new Date(now.getTime() + LOGIN_LOCK_DURATION_MS).toISOString().replace('Z', '+00:00') : null;
    const nowIso = now.toISOString().replace('Z', '+00:00');
    await database
      .prepare(`INSERT INTO auth_login_lockouts (email, failure_count, locked_until, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET failure_count = excluded.failure_count, locked_until = excluded.locked_until, updated_at = excluded.updated_at`)
      .bind(normalizedEmail, failureCount, lockedUntil, nowIso)
      .run();
  });
}
