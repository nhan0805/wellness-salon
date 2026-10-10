import { describe, expect, it } from 'vitest';

describe('PostgreSQL integration gate', () => {
  it('documents the real database suite as an opt-in CI job', () => {
    expect(['false', 'true']).toContain(process.env.RUN_DB_TESTS ?? 'false');
  });
});
