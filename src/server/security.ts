import argon2 from 'argon2';

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashSecret(secret: string) {
  return argon2.hash(secret, ARGON_OPTIONS);
}

export function verifySecret(hash: string, secret: string) {
  return argon2.verify(hash, secret);
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
