import type { PrismaClient as D1PrismaClient } from '@prisma/d1-client';
import { logEvent } from '@/src/server/logger';

type PrismaCompilerWasm = {
  getRuntime: () => Promise<unknown>;
  getQueryCompilerWasmModule: () => Promise<WebAssembly.Module>;
};

export type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<{ meta?: { changes?: number } }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all: <T = Record<string, unknown>>() => Promise<{ results: T[]; meta?: { changes?: number } }>;
};

export type D1DatabaseLike = {
  prepare: (query: string) => D1Statement;
  batch: <T = unknown>(statements: D1Statement[]) => Promise<T[]>;
};

export type D1PrismaRuntime = D1PrismaClient;

type RuntimePrisma = D1PrismaRuntime;

type Runtime = {
  client: RuntimePrisma;
  database: D1DatabaseLike;
};

/**
 * A runtime must never outlive the request that supplied its D1 binding.
 *
 * Cloudflare D1 objects carry request-local I/O context. Keeping either the
 * binding or a Prisma client that wraps it in module state lets a later
 * request resume work in the wrong context. That is the source of the
 * intermittent Worker cancellations that previously appeared as dashboard
 * timeouts. Each Prisma operation therefore gets a fresh client and is
 * disconnected before its request-local work is released.
 */
async function getRuntime(): Promise<Runtime> {
  return initializeRuntime();
}

async function withRuntime<T>(operationName: string, operation: (runtime: Runtime) => Promise<T>): Promise<T> {
  const runtime = await getRuntime();
  const startedAt = performance.now();
  let operationError: unknown;
  try {
    return await operation(runtime);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await runtime.client.$disconnect();
    } catch (error) {
      if (!operationError) throw error;
    }
    const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
    if (durationMs >= 250 || operationError) {
      logEvent(operationError ? 'error' : 'warn', 'db.prisma.operation', {
        operation: operationName,
        durationMs,
        outcome: operationError ? 'failed' : 'slow',
        error: operationError instanceof Error ? operationError.message : undefined,
      });
    }
  }
}

/**
 * Run a group of related reads/writes with one request-local Prisma runtime.
 *
 * The runtime is still created and disposed per request. Sharing it inside a
 * request avoids recompiling the Prisma query compiler for every individual
 * read while preserving the D1 binding isolation required by Workers.
 */
export async function withPrismaRuntime<T>(
  operationName: string,
  operation: (runtime: { client: D1PrismaRuntime; database: D1DatabaseLike }) => Promise<T>,
): Promise<T> {
  return withRuntime(operationName, operation);
}

export async function isD1Runtime() {
  const database = await getCloudflareDatabase();
  if (!database) throw new Error('Cloudflare D1 database binding is not available');
  return true;
}

export async function getD1Database(): Promise<D1DatabaseLike> {
  const database = await getCloudflareDatabase();
  if (!database) throw new Error('Cloudflare D1 database binding is not available');
  return database;
}

async function initializeRuntime(): Promise<Runtime> {
  const database = await getCloudflareDatabase();
  if (!database) throw new Error('Cloudflare D1 database binding is not available');

  // The generated D1 client main entrypoint selects Prisma's driver-adapter
  // compatible WASM runtime under Cloudflare's workerd conditions. The
  // `/edge` entrypoint is incompatible with Prisma driver adapters.
  // Use the generated adapter-compatible WASM entrypoint explicitly. The
  // package root can resolve to the Node entrypoint under Vite's dynamic
  // import analysis, which falls back to a filesystem read of the compiler.
  const { PrismaClient } = await import('@prisma/d1-client/wasm.js');
  const { PrismaD1 } = await import('@prisma/adapter-d1');
  const [{ default: compilerWasm }, compilerRuntime] = await Promise.all([
    import('@prisma/d1-client/query_compiler_bg.wasm?module') as Promise<{ default: WebAssembly.Module }>,
    import('@prisma/d1-client/query_compiler_bg.js'),
  ]);
  const compiler: PrismaCompilerWasm = {
    getRuntime: async () => compilerRuntime,
    getQueryCompilerWasmModule: async () => compilerWasm,
  };
  const clientOptions = {
    adapter: new PrismaD1(database as never),
    // Prisma 6's generated D1 client type does not expose the internal
    // compiler override used by the adapter-compatible WASM entrypoint.
    // Keep the runtime override isolated at this boundary until Prisma's
    // generated D1 client exposes a typed hook.
    __internal: {
      configOverride: (config: { compilerWasm?: PrismaCompilerWasm }) => ({ ...config, compilerWasm: compiler }),
    },
  } as never;
  return {
    client: new PrismaClient(clientOptions),
    database,
  };
}

async function getCloudflareDatabase(): Promise<D1DatabaseLike | undefined> {
  try {
    // Keep the platform-only module out of the build graph at evaluation time.
    // Vinext/Workers resolves this import at request time.
    const { env } = await import('cloudflare:workers');
    return (env as { DB?: D1DatabaseLike }).DB;
  } catch (error) {
    if (error instanceof Error && /cloudflare:workers|Cannot find module|external module/.test(error.message)) return undefined;
    throw error;
  }
}

async function acquireD1Lease(database: D1DatabaseLike) {
  const owner = globalThis.crypto.randomUUID();
  const lockKey = 'wellness-salon:shop';
  const timeoutAt = Date.now() + 5_000;

  while (Date.now() < timeoutAt) {
    const now = Math.floor(Date.now() / 1_000);
    const expiresAt = now + 15;
    const result = await database
      .prepare(
        `INSERT INTO "__app_locks" (lock_key, owner, expires_at)
         VALUES (?, ?, ?)
         ON CONFLICT(lock_key) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at
         WHERE "__app_locks".expires_at <= ?`,
      )
      .bind(lockKey, owner, expiresAt, now)
      .run();

    if ((result.meta?.changes ?? 0) > 0) {
      return async () => {
        await database.prepare('DELETE FROM "__app_locks" WHERE lock_key = ? AND owner = ?').bind(lockKey, owner).run();
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('D1 command lock is busy; retry the request safely.');
}

async function runD1Transaction<T>(database: D1DatabaseLike, operation: () => Promise<T>): Promise<T> {
  const release = await acquireD1Lease(database);
  try {
    return await operation();
  } finally {
    await release();
  }
}

export async function withD1Lease<T>(operation: (database: D1DatabaseLike) => Promise<T>) {
  const database = await getD1Database();
  if (!database) throw new Error('D1 database binding is not available');
  return runD1Transaction(database, () => operation(database));
}

export async function runD1Batch(statements: D1Statement[]) {
  const database = await getD1Database();
  if (!database) throw new Error('D1 database binding is not available');
  return database.batch(statements);
}

const proxyTarget = {} as D1PrismaClient;

function delegateProxy(model: PropertyKey) {
  return new Proxy(
    {},
    {
      get(_target, method) {
        return (...args: unknown[]) =>
          withRuntime(`${String(model)}.${String(method)}`, async (runtime) => {
            const delegate = (runtime.client as unknown as Record<PropertyKey, Record<PropertyKey, (...values: unknown[]) => unknown>>)[model];
            return Promise.resolve(delegate[method](...args));
          });
      },
    },
  );
}

export const prisma = new Proxy(proxyTarget, {
  get(_target, property) {
    if (property === 'then') return undefined;
    if (property === '$transaction') {
      return async (operation: unknown) =>
        withRuntime('$transaction', async (runtime) =>
          runD1Transaction(runtime.database, async () => {
            if (Array.isArray(operation)) {
              const results = [];
              for (const query of operation) results.push(await query);
              return results;
            }

            return (operation as (client: RuntimePrisma) => Promise<unknown>)(runtime.client);
          }),
        );
    }

    if (typeof property === 'string' && property.startsWith('$')) {
      return (...args: unknown[]) =>
        withRuntime(property, async (runtime) => {
          const method = (runtime.client as unknown as Record<PropertyKey, (...values: unknown[]) => unknown>)[property];
          return Promise.resolve(method.apply(runtime.client, args));
        });
    }

    return delegateProxy(property);
  },
}) as unknown as D1PrismaClient;
