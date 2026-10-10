CREATE TYPE "ServiceCategory" AS ENUM ('MANICURE', 'PEDICURE', 'NAIL_ART', 'OTHER');
CREATE TYPE "AuthRole" AS ENUM ('ADMIN', 'STATION');
CREATE TYPE "AppointmentStatus" AS ENUM ('CREATED', 'WAITING', 'ASSIGNED', 'IN_SERVICE', 'PAYMENT_PENDING', 'COMPLETED');
CREATE TYPE "TurnStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'STARTED', 'SKIPPED', 'FINISHED');
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'CHECKED_OUT', 'ABSENT');
CREATE TYPE "AttendanceClosedBy" AS ENUM ('STAFF', 'ADMIN', 'AUTO');
CREATE TYPE "Availability" AS ENUM ('AVAILABLE', 'BUSY');
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'CASH');
CREATE TYPE "ActorType" AS ENUM ('ADMIN', 'STATION', 'STAFF', 'SYSTEM');

CREATE TABLE "skills" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

CREATE TABLE "services" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "ServiceCategory" NOT NULL,
  "duration_min" INTEGER NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "required_skill_id" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "services_is_active_idx" ON "services"("is_active");

CREATE TABLE "staff" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "initials" TEXT NOT NULL,
  "pin_hash" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_is_active_idx" ON "staff"("is_active");

CREATE TABLE "staff_skills" (
  "staff_id" TEXT NOT NULL,
  "skill_id" TEXT NOT NULL,
  CONSTRAINT "staff_skills_pkey" PRIMARY KEY ("staff_id", "skill_id")
);

CREATE TABLE "auth_users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "AuthRole" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");
CREATE INDEX "auth_users_role_is_active_idx" ON "auth_users"("role", "is_active");

CREATE TABLE "customers" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");
CREATE INDEX "customers_name_idx" ON "customers"("name");

CREATE TABLE "appointments" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "service_id" TEXT NOT NULL,
  "status" "AppointmentStatus" NOT NULL,
  "primary_staff_id" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "business_date" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "appointments_code_key" ON "appointments"("code");
CREATE INDEX "appointments_business_date_status_idx" ON "appointments"("business_date", "status");
CREATE INDEX "appointments_customer_id_created_at_idx" ON "appointments"("customer_id", "created_at");

CREATE TABLE "turns" (
  "id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "assigned_staff_id" TEXT,
  "status" "TurnStatus" NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  CONSTRAINT "turns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "turns_appointment_id_created_at_idx" ON "turns"("appointment_id", "created_at");
CREATE INDEX "turns_assigned_staff_id_status_idx" ON "turns"("assigned_staff_id", "status");

CREATE TABLE "appointment_supporting_staff" (
  "appointment_id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_supporting_staff_pkey" PRIMARY KEY ("appointment_id", "staff_id")
);

CREATE TABLE "attendance" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "business_date" DATE NOT NULL,
  "check_in_at" TIMESTAMP(3),
  "check_out_at" TIMESTAMP(3),
  "status" "AttendanceStatus" NOT NULL,
  "closed_by" "AttendanceClosedBy",
  CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_staff_id_business_date_key" ON "attendance"("staff_id", "business_date");
CREATE INDEX "attendance_business_date_status_idx" ON "attendance"("business_date", "status");

CREATE TABLE "staff_service_state" (
  "staff_id" TEXT NOT NULL,
  "last_service_finished_at" TIMESTAMP(3),
  "availability" "Availability" NOT NULL DEFAULT 'AVAILABLE',
  "last_assigned_at" TIMESTAMP(3),
  CONSTRAINT "staff_service_state_pkey" PRIMARY KEY ("staff_id")
);

CREATE TABLE "payments" (
  "id" TEXT NOT NULL,
  "appointment_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "confirmed_by_admin_id" TEXT,
  "confirmed_at" TIMESTAMP(3),
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payments_appointment_id_key" ON "payments"("appointment_id");
CREATE INDEX "payments_confirmed_at_method_idx" ON "payments"("confirmed_at", "method");

CREATE TABLE "verified_staff_sessions" (
  "id" TEXT NOT NULL,
  "staff_id" TEXT NOT NULL,
  "station_user_id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "verified_staff_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verified_staff_sessions_station_user_id_expires_at_idx" ON "verified_staff_sessions"("station_user_id", "expires_at");
CREATE INDEX "verified_staff_sessions_staff_id_expires_at_idx" ON "verified_staff_sessions"("staff_id", "expires_at");

CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL,
  "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_type" "ActorType" NOT NULL,
  "actor_id" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT,
  "metadata" JSONB,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_events_entity_entity_id_ts_idx" ON "audit_events"("entity", "entity_id", "ts");
CREATE INDEX "audit_events_actor_type_actor_id_ts_idx" ON "audit_events"("actor_type", "actor_id", "ts");

CREATE TABLE "shop_config" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "closing_time" TEXT NOT NULL DEFAULT '21:00',
  "verified_session_ttl_min" INTEGER NOT NULL DEFAULT 3,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "round_robin_enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shop_config_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "services" ADD CONSTRAINT "services_required_skill_id_fkey" FOREIGN KEY ("required_skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_primary_staff_id_fkey" FOREIGN KEY ("primary_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "turns" ADD CONSTRAINT "turns_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "turns" ADD CONSTRAINT "turns_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment_supporting_staff" ADD CONSTRAINT "appointment_supporting_staff_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_supporting_staff" ADD CONSTRAINT "appointment_supporting_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_service_state" ADD CONSTRAINT "staff_service_state_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_admin_id_fkey" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "verified_staff_sessions" ADD CONSTRAINT "verified_staff_sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verified_staff_sessions" ADD CONSTRAINT "verified_staff_sessions_station_user_id_fkey" FOREIGN KEY ("station_user_id") REFERENCES "auth_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
