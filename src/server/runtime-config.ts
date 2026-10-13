type RuntimeEnvironment = Record<string, unknown>;

function processValue(name: string) {
  if (typeof process === 'undefined') return undefined;
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function getRuntimeEnvironment(): Promise<RuntimeEnvironment> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env ?? {}) as RuntimeEnvironment;
  } catch (error) {
    if (error instanceof Error && /cloudflare:workers|Cannot find module|external module/.test(error.message)) return {};
    throw error;
  }
}

export async function getRuntimeValue(name: string, fallback?: string) {
  const workerValue = (await getRuntimeEnvironment())[name];
  if (typeof workerValue === 'string' && workerValue.trim()) return workerValue.trim();
  return processValue(name) ?? fallback;
}

export function getBuildTimeValue(name: string, fallback?: string) {
  return processValue(name) ?? fallback;
}

export function isProductionRuntime() {
  return getBuildTimeValue('NODE_ENV') === 'production';
}
