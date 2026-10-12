ALTER TABLE "services" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';

UPDATE "services"
SET "description" = 'A restorative treatment for hands and feet'
WHERE LOWER("name") LIKE '%pedicure%' OR LOWER("name") LIKE '%spa%';

UPDATE "services"
SET "description" = 'A playful finish with room for your signature style'
WHERE "description" = '' AND LOWER("name") LIKE '%art%';

UPDATE "services"
SET "description" = 'A polished, personalized treatment for your visit'
WHERE "description" = '';
