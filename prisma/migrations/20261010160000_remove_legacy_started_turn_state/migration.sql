-- Remove historical appointments that only exist in the deprecated Start flow.
-- Do not silently destroy a paid appointment if a future database contains one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments" p
    JOIN "appointments" a ON a."id" = p."appointment_id"
    JOIN "turns" t ON t."appointment_id" = a."id"
    WHERE t."status" = 'STARTED'::"TurnStatus"
  ) THEN
    RAISE EXCEPTION 'Cannot remove legacy STARTED appointments because at least one has a payment';
  END IF;
END $$;

DELETE FROM "appointments"
WHERE "id" IN (
  SELECT DISTINCT "appointment_id"
  FROM "turns"
  WHERE "status" = 'STARTED'::"TurnStatus"
);

-- PostgreSQL does not support dropping one enum value in place. Recreate the
-- type after the legacy rows are gone, keeping ACCEPTED for the active turn
-- marker used by the current Accept -> in-service flow.
ALTER TABLE "turns"
  ALTER COLUMN "status" TYPE TEXT
  USING "status"::text;

DROP TYPE "TurnStatus";

CREATE TYPE "TurnStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'SKIPPED', 'FINISHED');

ALTER TABLE "turns"
  ALTER COLUMN "status" TYPE "TurnStatus"
  USING "status"::"TurnStatus";
