-- Operational safety additions for the authorized MVP implementation.
-- This migration is additive and deliberately preserves appointment/turn history.

ALTER TYPE "AppointmentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "auth_users"
  ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_by_type" "ActorType",
  ADD COLUMN IF NOT EXISTS "cancelled_by_id" TEXT;

ALTER TABLE "appointment_services"
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_by_type" "ActorType",
  ADD COLUMN IF NOT EXISTS "cancelled_by_id" TEXT;

ALTER TABLE "turns"
  ADD COLUMN IF NOT EXISTS "skip_reason_id" TEXT,
  ADD COLUMN IF NOT EXISTS "skip_reason_name_snapshot" TEXT;

ALTER TABLE "verified_staff_sessions"
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revoked_reason" TEXT;

ALTER TABLE "command_receipts"
  ADD COLUMN IF NOT EXISTS "request_hash" TEXT;

ALTER TABLE "shop_config"
  ADD COLUMN IF NOT EXISTS "opening_time" TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS "state_version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "skip_reasons" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "skip_reasons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "skip_reasons_name_key" ON "skip_reasons"("name");
CREATE INDEX IF NOT EXISTS "skip_reasons_is_active_sort_order_idx" ON "skip_reasons"("is_active", "sort_order");

CREATE TABLE IF NOT EXISTS "turn_exclusions" (
  "id" TEXT NOT NULL,
  "appointment_service_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "overridden_at" TIMESTAMP(3),
  "override_reason" TEXT,
  "overridden_by_id" TEXT,
  CONSTRAINT "turn_exclusions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "turn_exclusions_appointment_service_id_staff_id_key" ON "turn_exclusions"("appointment_service_id", "staff_id");
CREATE INDEX IF NOT EXISTS "turn_exclusions_appointment_service_id_overridden_at_idx" ON "turn_exclusions"("appointment_service_id", "overridden_at");
CREATE INDEX IF NOT EXISTS "turn_exclusions_staff_id_created_at_idx" ON "turn_exclusions"("staff_id", "created_at");

CREATE TABLE IF NOT EXISTS "service_change_events" (
  "id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "appointment_service_id" TEXT NOT NULL,
  "old_service_id" TEXT NOT NULL,
  "old_service_name" TEXT NOT NULL,
  "old_duration_min" INTEGER NOT NULL,
  "old_amount" DECIMAL(10,2) NOT NULL,
  "new_service_id" TEXT NOT NULL,
  "new_service_name" TEXT NOT NULL,
  "new_duration_min" INTEGER NOT NULL,
  "new_amount" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_change_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "service_change_events_appointment_id_created_at_idx" ON "service_change_events"("appointment_id", "created_at");
CREATE INDEX IF NOT EXISTS "service_change_events_appointment_service_id_created_at_idx" ON "service_change_events"("appointment_service_id", "created_at");

CREATE TABLE IF NOT EXISTS "staff_pin_lockouts" (
  "staff_id" TEXT NOT NULL,
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_pin_lockouts_pkey" PRIMARY KEY ("staff_id")
);

CREATE INDEX IF NOT EXISTS "appointment_services_primary_staff_id_status_idx" ON "appointment_services"("primary_staff_id", "status");
CREATE INDEX IF NOT EXISTS "appointment_supporting_staff_staff_id_idx" ON "appointment_supporting_staff"("staff_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'turns_skip_reason_id_fkey') THEN
    ALTER TABLE "turns"
      ADD CONSTRAINT "turns_skip_reason_id_fkey"
      FOREIGN KEY ("skip_reason_id") REFERENCES "skip_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'turn_exclusions_appointment_service_id_fkey') THEN
    ALTER TABLE "turn_exclusions"
      ADD CONSTRAINT "turn_exclusions_appointment_service_id_fkey"
      FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'turn_exclusions_staff_id_fkey') THEN
    ALTER TABLE "turn_exclusions"
      ADD CONSTRAINT "turn_exclusions_staff_id_fkey"
      FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_change_events_appointment_id_fkey') THEN
    ALTER TABLE "service_change_events"
      ADD CONSTRAINT "service_change_events_appointment_id_fkey"
      FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_change_events_appointment_service_id_fkey') THEN
    ALTER TABLE "service_change_events"
      ADD CONSTRAINT "service_change_events_appointment_service_id_fkey"
      FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_pin_lockouts_staff_id_fkey') THEN
    ALTER TABLE "staff_pin_lockouts"
      ADD CONSTRAINT "staff_pin_lockouts_staff_id_fkey"
      FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
