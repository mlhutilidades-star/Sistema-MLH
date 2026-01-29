-- Manual migration: add Shopee OAuth tables
-- This migration is written to be idempotent (IF NOT EXISTS), because some environments were provisioned via `prisma db push`.

CREATE TABLE IF NOT EXISTS "shopee_tokens" (
  "id" TEXT NOT NULL,
  "shopId" INTEGER NOT NULL,
  "partnerId" INTEGER,
  "accessToken" TEXT NOT NULL,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshToken" TEXT NOT NULL,
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "accessTokenBackup" TEXT,
  "accessTokenBackupExpiresAt" TIMESTAMP(3),
  "refreshTokenBackup" TEXT,
  "refreshTokenBackupExpiresAt" TIMESTAMP(3),
  "lastRefreshAt" TIMESTAMP(3),
  "lastRefreshError" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shopee_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shopee_tokens_shopId_key" ON "shopee_tokens"("shopId");
CREATE INDEX IF NOT EXISTS "shopee_tokens_atualizadoEm_idx" ON "shopee_tokens"("atualizadoEm");

CREATE TABLE IF NOT EXISTS "shopee_oauth_callbacks" (
  "id" TEXT NOT NULL,
  "shopId" INTEGER,
  "mainAccountId" INTEGER,
  "code" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "exchangedAt" TIMESTAMP(3),
  "exchangeError" TEXT,
  CONSTRAINT "shopee_oauth_callbacks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "shopee_oauth_callbacks_receivedAt_idx" ON "shopee_oauth_callbacks"("receivedAt");
