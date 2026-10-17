-- P0 hardening: retain the currency used by each historical record and keep
-- anonymous kiosk traffic bounded without storing raw IP addresses.
ALTER TABLE "appointments" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "appointment_services" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "service_change_events" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "payments" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "payment_items" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD';

UPDATE "appointments"
SET "currency" = COALESCE((SELECT "currency" FROM "shop_config" WHERE "id" = 1), 'USD');
UPDATE "appointment_services"
SET "currency" = COALESCE((SELECT "currency" FROM "shop_config" WHERE "id" = 1), 'USD');
UPDATE "service_change_events"
SET "currency" = COALESCE((SELECT "currency" FROM "shop_config" WHERE "id" = 1), 'USD');
UPDATE "payments"
SET "currency" = COALESCE((SELECT "currency" FROM "shop_config" WHERE "id" = 1), 'USD');
UPDATE "payment_items"
SET "currency" = COALESCE((SELECT "currency" FROM "shop_config" WHERE "id" = 1), 'USD');

CREATE TABLE "kiosk_rate_limits" (
    "rate_key" TEXT NOT NULL PRIMARY KEY,
    "window_started_at" DATETIME NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" DATETIME NOT NULL
);

CREATE INDEX "kiosk_rate_limits_updated_at_idx"
  ON "kiosk_rate_limits" ("updated_at");
