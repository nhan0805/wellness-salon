ALTER TABLE "appointments"
ADD COLUMN "service_name_snapshot" TEXT,
ADD COLUMN "duration_min_snapshot" INTEGER;

UPDATE "appointments" AS appointment
SET
  "service_name_snapshot" = service."name",
  "duration_min_snapshot" = service."duration_min"
FROM "services" AS service
WHERE appointment."service_id" = service."id";

ALTER TABLE "appointments"
ALTER COLUMN "service_name_snapshot" SET NOT NULL,
ALTER COLUMN "duration_min_snapshot" SET NOT NULL;

ALTER TABLE "payments"
ADD COLUMN "service_name_snapshot" TEXT,
ADD COLUMN "staff_name_snapshot" TEXT;

UPDATE "payments" AS payment
SET
  "service_name_snapshot" = appointment."service_name_snapshot",
  "staff_name_snapshot" = staff."name"
FROM "appointments" AS appointment
LEFT JOIN "staff" AS staff ON appointment."primary_staff_id" = staff."id"
WHERE payment."appointment_id" = appointment."id";

ALTER TABLE "payments"
ALTER COLUMN "service_name_snapshot" SET NOT NULL;
