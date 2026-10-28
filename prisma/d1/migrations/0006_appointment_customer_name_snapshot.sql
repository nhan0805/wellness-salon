-- Preserve the name entered for each visit independently from the reusable
-- customer profile. This keeps kiosk visits historically accurate when a
-- returning guest uses a different name.
ALTER TABLE "appointments" ADD COLUMN "customer_name_snapshot" TEXT NOT NULL DEFAULT '';

UPDATE "appointments"
SET "customer_name_snapshot" = COALESCE(
  (SELECT "name" FROM "customers" WHERE "customers"."id" = "appointments"."customer_id"),
  ''
)
WHERE "customer_name_snapshot" = '';
