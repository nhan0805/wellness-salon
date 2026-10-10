export function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.NEXTAUTH_URL;
  if (origin === requestOrigin || origin === configuredOrigin) return true;
  if (process.env.NODE_ENV !== 'production') {
    try {
      const candidate = new URL(origin);
      const requestUrl = new URL(request.url);
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
