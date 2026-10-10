import '@testing-library/jest-dom/vitest';

// Database tests must opt into a separate disposable database. Keeping the
// application URL untouched prevents an accidental test run against a live DB.
const applicationDatabaseUrl = process.env.APPLICATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (process.env.RUN_DB_TESTS === 'true' && process.env.TEST_DATABASE_URL && applicationDatabaseUrl && process.env.TEST_DATABASE_URL !== applicationDatabaseUrl) {
  process.env.APPLICATION_DATABASE_URL = applicationDatabaseUrl;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
