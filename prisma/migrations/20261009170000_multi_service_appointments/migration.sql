CREATE TABLE "appointment_services" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "duration_min_snapshot" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "primary_staff_id" TEXT,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "appointment_services_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "turns" ADD COLUMN "appointment_service_id" TEXT;

CREATE TABLE "payment_items" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "appointment_service_id" TEXT NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "staff_name_snapshot" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "payment_items_pkey" PRIMARY KEY ("id")
);

INSERT INTO "appointment_services" (
    "id", "appointment_id", "service_id", "sequence", "service_name_snapshot",
    "duration_min_snapshot", "amount", "status", "primary_staff_id", "completed_at"
)
SELECT
    md5('legacy-appointment-service:' || appointment."id"),
    appointment."id",
    appointment."service_id",
    1,
    appointment."service_name_snapshot",
    appointment."duration_min_snapshot",
    appointment."amount",
    appointment."status",
    appointment."primary_staff_id",
    appointment."completed_at"
FROM "appointments" AS appointment;

UPDATE "turns" AS turn
SET "appointment_service_id" = service."id"
FROM "appointment_services" AS service
WHERE service."appointment_id" = turn."appointment_id";

INSERT INTO "payment_items" (
    "id", "payment_id", "appointment_service_id", "service_name_snapshot", "staff_name_snapshot", "amount"
)
SELECT
    md5('legacy-payment-item:' || payment."id"),
    payment."id",
    service."id",
    payment."service_name_snapshot",
    payment."staff_name_snapshot",
    payment."amount"
FROM "payments" AS payment
JOIN "appointment_services" AS service ON service."appointment_id" = payment."appointment_id";

CREATE UNIQUE INDEX "appointment_services_appointment_id_sequence_key"
    ON "appointment_services"("appointment_id", "sequence");
CREATE INDEX "appointment_services_appointment_id_status_sequence_idx"
    ON "appointment_services"("appointment_id", "status", "sequence");
CREATE INDEX "turns_appointment_service_id_created_at_idx"
    ON "turns"("appointment_service_id", "created_at");
CREATE UNIQUE INDEX "payment_items_payment_id_appointment_service_id_key"
    ON "payment_items"("payment_id", "appointment_service_id");
CREATE INDEX "payment_items_appointment_service_id_idx"
    ON "payment_items"("appointment_service_id");

ALTER TABLE "appointment_services"
    ADD CONSTRAINT "appointment_services_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_services"
    ADD CONSTRAINT "appointment_services_service_id_fkey"
    FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointment_services"
    ADD CONSTRAINT "appointment_services_primary_staff_id_fkey"
    FOREIGN KEY ("primary_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "turns"
    ADD CONSTRAINT "turns_appointment_service_id_fkey"
    FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_items"
    ADD CONSTRAINT "payment_items_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_items"
    ADD CONSTRAINT "payment_items_appointment_service_id_fkey"
    FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
