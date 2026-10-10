-- Preserve supporting-technician participation while distinguishing released work.
ALTER TABLE "appointment_supporting_staff"
  ADD COLUMN IF NOT EXISTS "released_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "appointment_supporting_staff_staff_id_released_at_idx"
  ON "appointment_supporting_staff"("staff_id", "released_at");
CREATE INDEX IF NOT EXISTS "appointment_supporting_staff_appointment_id_released_at_idx"
  ON "appointment_supporting_staff"("appointment_id", "released_at");
