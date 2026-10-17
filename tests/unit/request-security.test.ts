import { describe, expect, it } from 'vitest';
import { hasTrustedOrigin } from '@/src/server/request-security';

describe('trusted request origins', () => {
  it('rejects a mutation without an origin header', () => {
    const request = new Request('http://localhost:3000/api/test', { method: 'POST' });

    expect(hasTrustedOrigin(request)).toBe(false);
  });

  it('allows a read without an origin header', () => {
    const request = new Request('http://localhost:3000/api/test');

    expect(hasTrustedOrigin(request)).toBe(true);
  });

  it('accepts the host the browser used when the app URL is internal', () => {
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        origin: 'http://192.168.1.207:3000',
        host: '192.168.1.207:3000',
      },
    });

    expect(hasTrustedOrigin(request)).toBe(true);
  });

  it('rejects an unrelated origin', () => {
    const request = new Request('http://localhost:3000/api/test', {
      headers: {
        origin: 'https://malicious.example',
        host: '192.168.1.207:3000',
      },
    });

    expect(hasTrustedOrigin(request)).toBe(false);
  });
});
