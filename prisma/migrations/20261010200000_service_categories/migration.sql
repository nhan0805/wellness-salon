CREATE TABLE "service_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_categories_name_key" ON "service_categories"("name");
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");
CREATE INDEX "service_categories_is_active_sort_order_idx" ON "service_categories"("is_active", "sort_order");

INSERT INTO "service_categories" ("id", "name", "slug", "sort_order", "is_active", "updated_at") VALUES
  ('category-manicure', 'Manicure', 'manicure', 0, true, CURRENT_TIMESTAMP),
  ('category-pedicure', 'Pedicure', 'pedicure', 1, true, CURRENT_TIMESTAMP),
  ('category-nail-enhancements', 'Nail Enhancements', 'nail-enhancements', 2, true, CURRENT_TIMESTAMP),
  ('category-nail-art-add-ons', 'Nail Art & Add-ons', 'nail-art-add-ons', 3, true, CURRENT_TIMESTAMP),
  ('category-waxing', 'Waxing', 'waxing', 4, true, CURRENT_TIMESTAMP),
  ('category-kids-services', 'Kids Services', 'kids-services', 5, true, CURRENT_TIMESTAMP),
  ('category-combos-packages', 'Combos & Packages', 'combos-packages', 6, true, CURRENT_TIMESTAMP);

ALTER TABLE "services" ADD COLUMN "category_id" TEXT;

UPDATE "services"
SET "category_id" = 'category-manicure'
WHERE "category_id" IS NULL AND LOWER("name") LIKE '%manicure%';

UPDATE "services"
SET "category_id" = 'category-pedicure'
WHERE "category_id" IS NULL AND LOWER("name") LIKE '%pedicure%';

UPDATE "services"
SET "category_id" = 'category-nail-art-add-ons'
WHERE "category_id" IS NULL AND LOWER("name") LIKE '%nail art%';

UPDATE "services"
SET "category_id" = 'category-nail-enhancements'
WHERE "category_id" IS NULL;

ALTER TABLE "services" ALTER COLUMN "category_id" SET NOT NULL;
CREATE INDEX "services_category_id_is_active_idx" ON "services"("category_id", "is_active");
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
