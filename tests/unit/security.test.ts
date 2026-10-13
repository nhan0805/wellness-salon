import { describe, expect, it } from 'vitest';
import { hashSecret, verifySecret } from '@/src/server/security';

describe('Worker-compatible secret hashing', () => {
  it('round-trips a PBKDF2 password without exposing the secret in the hash', async () => {
    const secret = 'unit-test-password-123!';
    const hash = await hashSecret(secret);

    expect(hash).toMatch(/^pbkdf2-sha256\$100000\$/);
    expect(hash).not.toContain(secret);
    await expect(verifySecret(hash, secret)).resolves.toBe(true);
    await expect(verifySecret(hash, `${secret}-wrong`)).resolves.toBe(false);
  });

  it('rejects malformed or unsupported password hashes', async () => {
    await expect(verifySecret('not-a-password-hash', 'anything')).resolves.toBe(false);
    await expect(verifySecret('pbkdf2-sha256$not-a-number$salt$digest', 'anything')).resolves.toBe(false);
  });
});
