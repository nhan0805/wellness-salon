type LogContext = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: 'info' | 'warn' | 'error', event: string, context: LogContext = {}) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level, service: 'nail-shop-management', event, ...context })}\n`);
}
