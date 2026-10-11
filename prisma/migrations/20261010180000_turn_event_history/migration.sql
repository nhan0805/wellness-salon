CREATE TYPE "TurnEventType" AS ENUM (
    'WAITING',
    'ASSIGNED',
    'ACCEPTED',
    'SKIPPED',
    'FINISHED',
    'REASSIGNED',
    'CONTINUED_WITH_ME',
    'SUPPORT_ADDED',
    'SUPPORT_RELEASED',
    'CANCELLED'
);

CREATE TABLE "turn_events" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "appointment_service_id" TEXT,
    "turn_id" TEXT,
    "event_type" "TurnEventType" NOT NULL,
    "assigned_staff_id" TEXT,
    "assigned_staff_name_snapshot" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "actor_id" TEXT,
    "actor_name_snapshot" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turn_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "turn_events_appointment_id_created_at_idx"
    ON "turn_events"("appointment_id", "created_at");
CREATE INDEX "turn_events_appointment_service_id_created_at_idx"
    ON "turn_events"("appointment_service_id", "created_at");
CREATE INDEX "turn_events_turn_id_created_at_idx"
    ON "turn_events"("turn_id", "created_at");

ALTER TABLE "turn_events"
    ADD CONSTRAINT "turn_events_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "turn_events"
    ADD CONSTRAINT "turn_events_appointment_service_id_fkey"
    FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "turn_events"
    ADD CONSTRAINT "turn_events_turn_id_fkey"
    FOREIGN KEY ("turn_id") REFERENCES "turns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve assignment records that existed before the event ledger was added.
-- Their original actor was not stored, so the UI labels those actors as historical.
INSERT INTO "turn_events" (
    "id", "appointment_id", "appointment_service_id", "turn_id", "event_type",
    "assigned_staff_id", "assigned_staff_name_snapshot", "actor_type",
    "actor_name_snapshot", "reason", "created_at"
)
SELECT
    md5('legacy-turn-assigned:' || turn."id"),
    turn."appointment_id",
    turn."appointment_service_id",
    turn."id",
    CASE WHEN turn."assigned_staff_id" IS NULL THEN 'WAITING'::"TurnEventType" ELSE 'ASSIGNED'::"TurnEventType" END,
    turn."assigned_staff_id",
    staff."name",
    'SYSTEM'::"ActorType",
    'Historical record',
    COALESCE(turn."reason", 'Imported from the existing turn record'),
    turn."created_at"
FROM "turns" AS turn
LEFT JOIN "staff" AS staff ON staff."id" = turn."assigned_staff_id";

INSERT INTO "turn_events" (
    "id", "appointment_id", "appointment_service_id", "turn_id", "event_type",
    "assigned_staff_id", "assigned_staff_name_snapshot", "actor_type",
    "actor_name_snapshot", "reason", "created_at"
)
SELECT
    md5('legacy-turn-status:' || turn."id"),
    turn."appointment_id",
    turn."appointment_service_id",
    turn."id",
    CASE turn."status"
      WHEN 'ACCEPTED' THEN 'ACCEPTED'::"TurnEventType"
      WHEN 'SKIPPED' THEN 'SKIPPED'::"TurnEventType"
      WHEN 'FINISHED' THEN 'FINISHED'::"TurnEventType"
    END,
    turn."assigned_staff_id",
    staff."name",
    'SYSTEM'::"ActorType",
    'Historical record',
    COALESCE(turn."reason", 'Imported from the existing turn record'),
    COALESCE(turn."ended_at", turn."created_at")
FROM "turns" AS turn
LEFT JOIN "staff" AS staff ON staff."id" = turn."assigned_staff_id"
WHERE turn."status" IN ('ACCEPTED', 'SKIPPED', 'FINISHED');
