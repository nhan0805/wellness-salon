CREATE TABLE "command_receipts" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "command_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "command_receipts_scope_key_key" ON "command_receipts"("scope", "key");
CREATE INDEX "command_receipts_created_at_idx" ON "command_receipts"("created_at");
