-- Persisted account login throttling for the PostgreSQL runtime.
CREATE TABLE "auth_login_lockouts" (
    "email" TEXT NOT NULL,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_login_lockouts_pkey" PRIMARY KEY ("email")
);
