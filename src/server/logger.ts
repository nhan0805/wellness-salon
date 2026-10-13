type LogContext = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: 'info' | 'warn' | 'error', event: string, context: LogContext = {}) {
  const record = JSON.stringify({ ts: new Date().toISOString(), level, service: 'nail-shop-management', event, ...context });
  if (level === 'error') console.error(record);
  else if (level === 'warn') console.warn(record);
  else console.log(record);
}
