-- Shopee Push Mechanism: webhook events queue
-- Idempotent where possible.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'ShopeeWebhookStatus'
  ) THEN
    CREATE TYPE "ShopeeWebhookStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "shopee_webhook_events" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "shop_id" TEXT,
  "item_id" TEXT,
  "model_id" TEXT,
  "payload" JSONB NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "status" "ShopeeWebhookStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shopee_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shopee_webhook_events_event_id_key" ON "shopee_webhook_events"("event_id");
CREATE INDEX IF NOT EXISTS "shopee_webhook_events_status_received_at_idx" ON "shopee_webhook_events"("status", "received_at");
CREATE INDEX IF NOT EXISTS "shopee_webhook_events_shop_id_idx" ON "shopee_webhook_events"("shop_id");
CREATE INDEX IF NOT EXISTS "shopee_webhook_events_item_id_idx" ON "shopee_webhook_events"("item_id");
