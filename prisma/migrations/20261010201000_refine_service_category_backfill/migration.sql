UPDATE "services"
SET "category_id" = 'category-waxing'
WHERE LOWER("name") LIKE '%wax%';

UPDATE "services"
SET "category_id" = 'category-kids-services'
WHERE LOWER("name") LIKE '%kid%';

UPDATE "services"
SET "category_id" = 'category-combos-packages'
WHERE LOWER("name") LIKE '%combo%' OR LOWER("name") LIKE '%package%';

UPDATE "services"
SET "category_id" = 'category-nail-art-add-ons'
WHERE LOWER("name") LIKE '%nail art%'
   OR LOWER("name") LIKE '%chrome%'
   OR LOWER("name") LIKE '%cat eye%'
   OR LOWER("name") LIKE '%ombre%'
   OR LOWER("name") LIKE '%marble%'
   OR LOWER("name") LIKE '%rhinestone%'
   OR LOWER("name") LIKE '%3d%'
   OR LOWER("name") LIKE '%matte%'
   OR LOWER("name") LIKE '%charm%'
   OR LOWER("name") LIKE '%extra nail length%'
   OR LOWER("name") LIKE '%special nail shape%';

UPDATE "services"
SET "category_id" = 'category-nail-enhancements'
WHERE LOWER("name") LIKE '%acrylic%'
   OR LOWER("name") LIKE '%dip powder%'
   OR LOWER("name") LIKE '%builder gel%'
   OR LOWER("name") LIKE '%hard gel%'
   OR LOWER("name") LIKE '%gel-x%'
   OR LOWER("name") LIKE '%extension%'
   OR LOWER("name") LIKE '%fill-in%'
   OR LOWER("name") LIKE '%pink & white%'
   OR LOWER("name") LIKE '%nail repair%'
   OR LOWER("name") LIKE '%soak off%';
