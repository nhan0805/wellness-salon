-- Keep high-frequency demo paths bounded on the Workers Free plan.
ALTER TABLE "appointments" ADD COLUMN "service_count" INTEGER NOT NULL DEFAULT 1;

UPDATE "appointments"
SET "service_count" = COALESCE(
  (SELECT COUNT(*) FROM "appointment_services"
   WHERE "appointment_services"."appointment_id" = "appointments"."id"),
  1
);

CREATE INDEX "appointments_business_date_service_count_created_at_idx"
  ON "appointments" ("business_date", "service_count", "created_at");

CREATE TABLE "appointment_counters" (
  "business_date" DATETIME NOT NULL PRIMARY KEY,
  "next_sequence" INTEGER NOT NULL
);

INSERT INTO "appointment_counters" ("business_date", "next_sequence")
SELECT "business_date",
       MAX(CASE WHEN "code" LIKE 'A%' THEN CAST(SUBSTR("code", 2) AS INTEGER) ELSE 0 END) + 1
FROM "appointments"
GROUP BY "business_date";

CREATE INDEX "audit_events_entity_action_ts_idx"
  ON "audit_events" ("entity", "action", "ts");
