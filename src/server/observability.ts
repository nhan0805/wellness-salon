import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { logEvent } from '@/src/server/logger';

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;

export function requestIdFrom(request: Request) {
  const candidate = request.headers.get('x-request-id')?.trim();
  return candidate && requestIdPattern.test(candidate) ? candidate : randomUUID();
}

export async function observeApiRequest(request: Request, route: string, handler: () => Promise<Response>) {
  const requestId = requestIdFrom(request);
  const startedAt = performance.now();
  try {
    const response = await handler();
    response.headers.set('x-request-id', requestId);
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    logEvent(response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info', 'api.request.completed', {
      requestId,
      method: request.method,
      route,
      status: response.status,
      durationMs,
    });
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
