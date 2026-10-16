-- Keep date-scoped queue/history reads ordered without sorting the full
-- appointments table in memory. This complements the existing
-- (business_date, status) index used by status filters.
CREATE INDEX "appointments_business_date_created_at_idx"
  ON "appointments" ("business_date", "created_at");
