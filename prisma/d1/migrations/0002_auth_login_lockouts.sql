-- Persisted account login throttling for the Worker runtime.
CREATE TABLE "auth_login_lockouts" (
    "email" TEXT NOT NULL PRIMARY KEY,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "updated_at" DATETIME NOT NULL
);
