-- Hotfix migration: ensure Shopee catalog table `anuncios` exists and legacy Ads aggregate is moved out of the way.
--
-- Context:
-- - Some environments have an existing legacy `anuncios` table (Ads aggregate) whose PK index name collides with the new catalog table creation.
-- - Previous migration may have been marked as applied in production to unblock deploy.
--
-- Goals:
-- 1) If legacy Ads aggregate exists as `anuncios`, rename it to `anuncios_ads` (or `anuncios_ads_legacy` if needed).
-- 2) Rename any legacy PK index/constraint away from `anuncios_pkey`.
-- 3) Create catalog table `anuncios` with required columns and indexes.

DO $$
BEGIN
  -- If `anuncios` is the legacy Ads aggregate (it has campanhaId), move it away.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'anuncios'
      AND column_name = 'campanhaId'
  ) THEN
    -- Prefer the expected target name.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'anuncios_ads'
    ) THEN
      ALTER TABLE "anuncios" RENAME TO "anuncios_ads";
    ELSIF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'anuncios_ads_legacy'
    ) THEN
      ALTER TABLE "anuncios" RENAME TO "anuncios_ads_legacy";
    END IF;
  END IF;

  -- If legacy table exists and still has PK constraint named anuncios_pkey, rename it.
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'anuncios_ads'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'anuncios_pkey'
  ) THEN
    ALTER TABLE "anuncios_ads" RENAME CONSTRAINT "anuncios_pkey" TO "anuncios_ads_pkey";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'anuncios_ads_legacy'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'anuncios_pkey'
  ) THEN
    ALTER TABLE "anuncios_ads_legacy" RENAME CONSTRAINT "anuncios_pkey" TO "anuncios_ads_legacy_pkey";
  END IF;
END $$;

-- Defensive: drop any orphaned legacy index that can still collide.
DROP INDEX IF EXISTS "anuncios_pkey";

-- Create catalog table if it doesn't exist yet.
CREATE TABLE IF NOT EXISTS "anuncios" (
  "id" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'SHOPEE',
  "shop_id" INTEGER NOT NULL,
  "item_id" BIGINT NOT NULL,
  "model_id" BIGINT,
  "sku" TEXT,
  "nome" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "preco" DOUBLE PRECISION,
  "estoque" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "anuncios_catalogo_pkey" PRIMARY KEY ("id")
);

-- Indexes for list/pagination/filtering.
CREATE UNIQUE INDEX IF NOT EXISTS "anuncios_platform_shop_id_item_id_key" ON "anuncios"("platform", "shop_id", "item_id");
CREATE INDEX IF NOT EXISTS "anuncios_shop_id_idx" ON "anuncios"("shop_id");
CREATE INDEX IF NOT EXISTS "anuncios_status_idx" ON "anuncios"("status");
CREATE INDEX IF NOT EXISTS "anuncios_updated_at_idx" ON "anuncios"("updated_at");
