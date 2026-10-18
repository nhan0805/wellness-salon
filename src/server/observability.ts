import { logEvent } from '@/src/server/logger';
import { randomId } from '@/src/server/web-crypto';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFrom(request: Request) {
  const candidate = request.headers.get('x-request-id')?.trim();
  return candidate && requestIdPattern.test(candidate) ? candidate : randomId();
}

export async function observeApiRequest(request: Request, route: string, handler: () => Promise<Response>) {
  const requestId = requestIdFrom(request);
  const startedAt = performance.now();
  try {
    const response = await handler();
    response.headers.set('x-request-id', requestId);
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const existingServerTiming = response.headers.get('server-timing');
    response.headers.set(
      'server-timing',
      `${existingServerTiming ? `${existingServerTiming}, ` : ''}api;dur=${durationMs}`,
    );
    response.headers.set('x-response-time-ms', String(durationMs));
    const isRoutineRead =
      request.method === 'GET' &&
      response.status < 400 &&
      (response.status === 304 || route === 'GET /api/board' || route === 'GET /api/sse/board');
    if (!isRoutineRead || durationMs >= 1000)
      logEvent(response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info', 'api.request.completed', {
        requestId,
        method: request.method,
        route,
        status: response.status,
        durationMs,
        slow: durationMs >= 1000,
        outcome: response.status >= 400 ? 'rejected' : 'success',
      });
    if (response.status >= 400 && request.method !== 'GET') {
      logEvent('warn', 'command.rejected', { requestId, method: request.method, route, status: response.status });
    }
    return response;
  } catch (error) {
    logEvent('error', 'api.request.failed', {
      requestId,
      method: request.method,
      route,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
