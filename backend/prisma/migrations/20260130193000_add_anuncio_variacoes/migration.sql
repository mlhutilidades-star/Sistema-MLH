-- Add table to store Shopee item variations (models)
-- Idempotent where possible.

CREATE TABLE IF NOT EXISTS "anuncio_variacoes" (
  "id" TEXT NOT NULL,
  "anuncio_id" TEXT NOT NULL,
  "model_id" BIGINT NOT NULL,
  "sku" TEXT,
  "nome" TEXT,
  "preco" DOUBLE PRECISION,
  "estoque" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "anuncio_variacoes_pkey" PRIMARY KEY ("id")
);

-- Unique per (anuncio, model)
CREATE UNIQUE INDEX IF NOT EXISTS "anuncio_variacoes_anuncio_id_model_id_key" ON "anuncio_variacoes"("anuncio_id", "model_id");
CREATE INDEX IF NOT EXISTS "anuncio_variacoes_anuncio_id_idx" ON "anuncio_variacoes"("anuncio_id");
CREATE INDEX IF NOT EXISTS "anuncio_variacoes_model_id_idx" ON "anuncio_variacoes"("model_id");

-- Foreign key to anuncios (catalog)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'anuncio_variacoes_anuncio_id_fkey'
  ) THEN
    ALTER TABLE "anuncio_variacoes"
      ADD CONSTRAINT "anuncio_variacoes_anuncio_id_fkey"
      FOREIGN KEY ("anuncio_id") REFERENCES "anuncios"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
