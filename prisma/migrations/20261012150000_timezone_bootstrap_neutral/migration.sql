-- The salon timezone is an owner decision and must be configured before
-- production jobs are enabled. Keep existing configured rows unchanged.
ALTER TABLE "shop_config"
ALTER COLUMN "timezone" SET DEFAULT 'UTC';
