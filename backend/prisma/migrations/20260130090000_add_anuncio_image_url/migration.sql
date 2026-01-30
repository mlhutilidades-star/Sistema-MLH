-- Add image_url to anuncios (Shopee catalog)

ALTER TABLE "anuncios"
ADD COLUMN IF NOT EXISTS "image_url" TEXT;
