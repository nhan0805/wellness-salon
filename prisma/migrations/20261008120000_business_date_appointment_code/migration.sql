DROP INDEX "appointments_code_key";
CREATE UNIQUE INDEX "appointments_business_date_code_key" ON "appointments"("business_date", "code");
