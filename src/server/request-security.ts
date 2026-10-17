import { getBuildTimeValue } from '@/src/server/runtime-config';

export function hasTrustedOrigin(request: Request, options: { allowMissing?: boolean } = {}) {
  const origin = request.headers.get('origin');
  if (!origin) {
    if (options.allowMissing !== undefined) return options.allowMissing;
    return request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS';
  }
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const configuredOrigin = getBuildTimeValue('NEXTAUTH_URL');
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const requestHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host')?.trim();
  const requestProtocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);
  const hostOrigin = requestHost ? `${requestProtocol}://${requestHost}` : null;

  // Behind a reverse proxy or a LAN-accessible container, request.url can
  // resolve to the internal host while the browser sends the public host in
  // Origin. The host header is the canonical origin the browser addressed.
  if (origin === requestOrigin || origin === configuredOrigin || origin === hostOrigin) return true;
  if (getBuildTimeValue('NODE_ENV') !== 'production') {
    try {
      const candidate = new URL(origin);
      const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
      return candidate.protocol === requestUrl.protocol && candidate.port === requestUrl.port && localHosts.has(candidate.hostname) && localHosts.has(requestUrl.hostname);
    } catch {
      return false;
    }
  }
  return false;
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large');
    this.name = 'RequestBodyTooLargeError';
  }
}

export async function readJsonBody(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new RequestBodyTooLargeError();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
