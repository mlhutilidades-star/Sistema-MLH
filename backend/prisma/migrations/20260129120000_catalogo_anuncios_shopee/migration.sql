-- Manual migration: repurpose `anuncios` table for Shopee catalog (listings)
-- - Renames legacy Ads aggregate table to `anuncios_ads`
-- - Creates new `anuncios` table for catalog/listings
-- This migration is written to be idempotent where practical, because some environments were provisioned via `prisma db push`.

DO $$
BEGIN
  -- If legacy ads aggregate is still using table name `anuncios`, rename it to `anuncios_ads`.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'anuncios'
      AND column_name = 'campanhaId'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'anuncios_ads'
  ) THEN
    ALTER TABLE "anuncios" RENAME TO "anuncios_ads";
  END IF;
END $$;

-- Ensure table for catalog exists.
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
  CONSTRAINT "anuncios_pkey" PRIMARY KEY ("id")
);

-- Uniqueness: one row per (platform, shop, item). Model variants can be added later.
CREATE UNIQUE INDEX IF NOT EXISTS "anuncios_platform_shop_id_item_id_key" ON "anuncios"("platform", "shop_id", "item_id");
CREATE INDEX IF NOT EXISTS "anuncios_shop_id_idx" ON "anuncios"("shop_id");
CREATE INDEX IF NOT EXISTS "anuncios_status_idx" ON "anuncios"("status");
CREATE INDEX IF NOT EXISTS "anuncios_updated_at_idx" ON "anuncios"("updated_at");
