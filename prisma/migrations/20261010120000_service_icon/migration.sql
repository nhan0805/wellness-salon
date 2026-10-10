ALTER TABLE "services" ADD COLUMN "icon_key" TEXT NOT NULL DEFAULT 'sparkles';

UPDATE "services"
SET "icon_key" = 'flower-2'
WHERE LOWER("name") LIKE '%pedicure%' OR LOWER("name") LIKE '%spa%';

UPDATE "services"
SET "icon_key" = 'sparkles'
WHERE LOWER("name") LIKE '%art%';

UPDATE "services"
SET "icon_key" = 'hand'
WHERE "icon_key" = 'sparkles'
  AND LOWER("name") NOT LIKE '%art%';
