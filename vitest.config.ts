import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'cloudflare:workers': path.resolve(__dirname, 'tests/shims/cloudflare-workers.ts'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    // Database integration suites share one disposable PostgreSQL database.
    // Keep those files serial so routing fixtures cannot affect each other.
    fileParallelism: process.env.RUN_DB_TESTS !== 'true',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/types/**', 'prisma/**'],
    },
  },
});
