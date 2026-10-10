UPDATE "appointment_services" AS appointment_service
SET "status" = 'COMPLETED', "completed_at" = COALESCE(appointment_service."completed_at", appointment."completed_at")
FROM "appointments" AS appointment
WHERE appointment_service."appointment_id" = appointment."id"
  AND appointment."status" IN ('PAYMENT_PENDING', 'COMPLETED')
  AND appointment_service."status" <> 'COMPLETED';
