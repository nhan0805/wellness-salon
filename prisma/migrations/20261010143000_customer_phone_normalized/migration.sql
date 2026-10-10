ALTER TABLE "customers" ADD COLUMN "phone_normalized" TEXT;

UPDATE "customers"
SET "phone_normalized" = regexp_replace("phone", '[^0-9]', '', 'g');

ALTER TABLE "customers" ALTER COLUMN "phone_normalized" SET NOT NULL;

CREATE UNIQUE INDEX "customers_phone_normalized_key" ON "customers"("phone_normalized");
