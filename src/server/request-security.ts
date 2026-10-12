export function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const requestUrl = new URL(request.url);
  const requestOrigin = requestUrl.origin;
  const configuredOrigin = process.env.NEXTAUTH_URL;
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const requestHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ?? request.headers.get('host')?.trim();
  const requestProtocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);
  const hostOrigin = requestHost ? `${requestProtocol}://${requestHost}` : null;

  // Behind a reverse proxy or a LAN-accessible container, request.url can
  // resolve to the internal host while the browser sends the public host in
  // Origin. The host header is the canonical origin the browser addressed.
  if (origin === requestOrigin || origin === configuredOrigin || origin === hostOrigin) return true;
  if (process.env.NODE_ENV !== 'production') {
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

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
