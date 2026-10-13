-- Generated from prisma/d1/schema.prisma with Prisma 6.19.3.
-- Apply with the local D1 workflow first; no remote database is referenced here.

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon_key" TEXT NOT NULL DEFAULT 'sparkles',
    "category_id" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "price" DECIMAL NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "service_skills" (
    "service_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    PRIMARY KEY ("service_id", "skill_id"),
    CONSTRAINT "service_skills_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "service_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "staff_skills" (
    "staff_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    PRIMARY KEY ("staff_id", "skill_id"),
    CONSTRAINT "staff_skills_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "staff_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "session_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "phone" TEXT NOT NULL,
    "phone_normalized" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "duration_min_snapshot" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "primary_staff_id" TEXT,
    "amount" DECIMAL NOT NULL,
    "business_date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATETIME,
    "cancelled_at" DATETIME,
    "cancelled_reason" TEXT,
    "cancelled_by_type" TEXT,
    "cancelled_by_id" TEXT,
    CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointments_primary_staff_id_fkey" FOREIGN KEY ("primary_staff_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "appointment_services" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointment_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "duration_min_snapshot" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    "primary_staff_id" TEXT,
    "completed_at" DATETIME,
    "cancelled_at" DATETIME,
    "cancelled_reason" TEXT,
    "cancelled_by_type" TEXT,
    "cancelled_by_id" TEXT,
    CONSTRAINT "appointment_services_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appointment_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "appointment_services_primary_staff_id_fkey" FOREIGN KEY ("primary_staff_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "turns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointment_id" TEXT NOT NULL,
    "appointment_service_id" TEXT,
    "assigned_staff_id" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "skip_reason_id" TEXT,
    "skip_reason_name_snapshot" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "turns_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "turns_appointment_service_id_fkey" FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "turns_assigned_staff_id_fkey" FOREIGN KEY ("assigned_staff_id") REFERENCES "staff" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "turns_skip_reason_id_fkey" FOREIGN KEY ("skip_reason_id") REFERENCES "skip_reasons" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "turn_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointment_id" TEXT NOT NULL,
    "appointment_service_id" TEXT,
    "turn_id" TEXT,
    "event_type" TEXT NOT NULL,
    "assigned_staff_id" TEXT,
    "assigned_staff_name_snapshot" TEXT,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name_snapshot" TEXT,
    "reason" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "turn_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "turn_events_appointment_service_id_fkey" FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "turn_events_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "turns" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "appointment_supporting_staff" (
    "appointment_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "added_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" DATETIME,
    PRIMARY KEY ("appointment_id", "staff_id"),
    CONSTRAINT "appointment_supporting_staff_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "appointment_supporting_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "skip_reasons" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "turn_exclusions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointment_service_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overridden_at" DATETIME,
    "override_reason" TEXT,
    "overridden_by_id" TEXT,
    CONSTRAINT "turn_exclusions_appointment_service_id_fkey" FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "turn_exclusions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "service_change_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointment_id" TEXT NOT NULL,
    "appointment_service_id" TEXT NOT NULL,
    "old_service_id" TEXT NOT NULL,
    "old_service_name" TEXT NOT NULL,
    "old_duration_min" INTEGER NOT NULL,
    "old_amount" DECIMAL NOT NULL,
    "new_service_id" TEXT NOT NULL,
    "new_service_name" TEXT NOT NULL,
    "new_duration_min" INTEGER NOT NULL,
    "new_amount" DECIMAL NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_change_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "service_change_events_appointment_service_id_fkey" FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staff_id" TEXT NOT NULL,
    "business_date" DATETIME NOT NULL,
    "check_in_at" DATETIME,
    "check_out_at" DATETIME,
    "status" TEXT NOT NULL,
    "closed_by" TEXT,
    CONSTRAINT "attendance_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "staff_service_state" (
    "staff_id" TEXT NOT NULL PRIMARY KEY,
    "last_service_finished_at" DATETIME,
    "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "last_assigned_at" DATETIME,
    CONSTRAINT "staff_service_state_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointment_id" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "tip" DECIMAL NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "staff_name_snapshot" TEXT,
    "confirmed_by_admin_id" TEXT,
    "confirmed_at" DATETIME,
    CONSTRAINT "payments_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_confirmed_by_admin_id_fkey" FOREIGN KEY ("confirmed_by_admin_id") REFERENCES "auth_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "payment_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payment_id" TEXT NOT NULL,
    "appointment_service_id" TEXT NOT NULL,
    "service_name_snapshot" TEXT NOT NULL,
    "staff_name_snapshot" TEXT,
    "amount" DECIMAL NOT NULL,
    CONSTRAINT "payment_items_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payment_items_appointment_service_id_fkey" FOREIGN KEY ("appointment_service_id") REFERENCES "appointment_services" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verified_staff_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staff_id" TEXT NOT NULL,
    "station_user_id" TEXT NOT NULL,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL,
    "revoked_at" DATETIME,
    "revoked_reason" TEXT,
    CONSTRAINT "verified_staff_sessions_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "verified_staff_sessions_station_user_id_fkey" FOREIGN KEY ("station_user_id") REFERENCES "auth_users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB
);

-- CreateTable
CREATE TABLE "command_receipts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "request_hash" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "shop_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "opening_time" TEXT NOT NULL DEFAULT '09:00',
    "closing_time" TEXT NOT NULL DEFAULT '21:00',
    "verified_session_ttl_min" INTEGER NOT NULL DEFAULT 3,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "round_robin_enabled" BOOLEAN NOT NULL DEFAULT true,
    "state_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "staff_pin_lockouts" (
    "staff_id" TEXT NOT NULL PRIMARY KEY,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" DATETIME,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "staff_pin_lockouts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "__app_locks" (
    "lock_key" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "expires_at" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");
CREATE UNIQUE INDEX "service_categories_name_key" ON "service_categories"("name");
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");
CREATE INDEX "service_categories_is_active_sort_order_idx" ON "service_categories"("is_active", "sort_order");
CREATE INDEX "services_is_active_idx" ON "services"("is_active");
CREATE INDEX "services_category_id_is_active_idx" ON "services"("category_id", "is_active");
CREATE INDEX "service_skills_skill_id_idx" ON "service_skills"("skill_id");
CREATE INDEX "staff_is_active_idx" ON "staff"("is_active");
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");
CREATE INDEX "auth_users_role_is_active_idx" ON "auth_users"("role", "is_active");
CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");
CREATE UNIQUE INDEX "customers_phone_normalized_key" ON "customers"("phone_normalized");
CREATE INDEX "customers_name_idx" ON "customers"("name");
CREATE INDEX "appointments_business_date_status_idx" ON "appointments"("business_date", "status");
CREATE INDEX "appointments_customer_id_created_at_idx" ON "appointments"("customer_id", "created_at");
CREATE UNIQUE INDEX "appointments_business_date_code_key" ON "appointments"("business_date", "code");
CREATE INDEX "appointment_services_appointment_id_status_sequence_idx" ON "appointment_services"("appointment_id", "status", "sequence");
CREATE INDEX "appointment_services_primary_staff_id_status_idx" ON "appointment_services"("primary_staff_id", "status");
CREATE UNIQUE INDEX "appointment_services_appointment_id_sequence_key" ON "appointment_services"("appointment_id", "sequence");
CREATE INDEX "turns_appointment_id_created_at_idx" ON "turns"("appointment_id", "created_at");
CREATE INDEX "turns_appointment_service_id_created_at_idx" ON "turns"("appointment_service_id", "created_at");
CREATE INDEX "turns_assigned_staff_id_status_idx" ON "turns"("assigned_staff_id", "status");
CREATE INDEX "turn_events_appointment_id_created_at_idx" ON "turn_events"("appointment_id", "created_at");
CREATE INDEX "turn_events_appointment_service_id_created_at_idx" ON "turn_events"("appointment_service_id", "created_at");
CREATE INDEX "turn_events_turn_id_created_at_idx" ON "turn_events"("turn_id", "created_at");
CREATE INDEX "appointment_supporting_staff_staff_id_released_at_idx" ON "appointment_supporting_staff"("staff_id", "released_at");
CREATE INDEX "appointment_supporting_staff_appointment_id_released_at_idx" ON "appointment_supporting_staff"("appointment_id", "released_at");
CREATE UNIQUE INDEX "skip_reasons_name_key" ON "skip_reasons"("name");
CREATE INDEX "skip_reasons_is_active_sort_order_idx" ON "skip_reasons"("is_active", "sort_order");
CREATE INDEX "turn_exclusions_appointment_service_id_overridden_at_idx" ON "turn_exclusions"("appointment_service_id", "overridden_at");
CREATE INDEX "turn_exclusions_staff_id_created_at_idx" ON "turn_exclusions"("staff_id", "created_at");
CREATE UNIQUE INDEX "turn_exclusions_appointment_service_id_staff_id_key" ON "turn_exclusions"("appointment_service_id", "staff_id");
CREATE INDEX "service_change_events_appointment_id_created_at_idx" ON "service_change_events"("appointment_id", "created_at");
CREATE INDEX "service_change_events_appointment_service_id_created_at_idx" ON "service_change_events"("appointment_service_id", "created_at");
CREATE INDEX "attendance_business_date_status_idx" ON "attendance"("business_date", "status");
CREATE UNIQUE INDEX "attendance_staff_id_business_date_key" ON "attendance"("staff_id", "business_date");
CREATE UNIQUE INDEX "payments_appointment_id_key" ON "payments"("appointment_id");
CREATE INDEX "payments_confirmed_at_method_idx" ON "payments"("confirmed_at", "method");
CREATE INDEX "payment_items_appointment_service_id_idx" ON "payment_items"("appointment_service_id");
CREATE UNIQUE INDEX "payment_items_payment_id_appointment_service_id_key" ON "payment_items"("payment_id", "appointment_service_id");
CREATE INDEX "verified_staff_sessions_station_user_id_expires_at_idx" ON "verified_staff_sessions"("station_user_id", "expires_at");
CREATE INDEX "verified_staff_sessions_staff_id_expires_at_idx" ON "verified_staff_sessions"("staff_id", "expires_at");
CREATE INDEX "audit_events_entity_entity_id_ts_idx" ON "audit_events"("entity", "entity_id", "ts");
CREATE INDEX "audit_events_actor_type_actor_id_ts_idx" ON "audit_events"("actor_type", "actor_id", "ts");
CREATE INDEX "command_receipts_created_at_idx" ON "command_receipts"("created_at");
CREATE UNIQUE INDEX "command_receipts_scope_key_key" ON "command_receipts"("scope", "key");
