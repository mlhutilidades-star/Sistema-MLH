import { PrismaClient } from '@prisma/client';
import { config } from '../../shared/config';

export type ShopeeTokenSource = 'db' | 'env' | 'none';

export type ResolvedShopeeTokens = {
  source: ShopeeTokenSource;
  shopId?: number;
  partnerId?: number;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  backup?: {
    accessToken?: string | null;
    refreshToken?: string | null;
    accessTokenExpiresAt?: Date | null;
    refreshTokenExpiresAt?: Date | null;
  };
  lastRefreshAt?: Date | null;
  lastRefreshError?: string | null;
};

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(d.getTime()) ? d : null;
}

function computeExpiresAt(seconds: unknown): Date | null {
  const n = typeof seconds === 'number' ? seconds : Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(Date.now() + Math.floor(n) * 1000);
}

function getConfiguredShopId(): number | undefined {
  const id = Number(config.shopee.shopId);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

export function maskToken(token: string | undefined | null, visible: number = 6): string {
  if (!token) return '';
  if (token.length <= visible * 2) return `${token.substring(0, Math.min(token.length, visible))}...`;
  return `${token.substring(0, visible)}...${token.substring(token.length - visible)}`;
}

export async function resolveShopeeTokens(prisma: PrismaClient): Promise<ResolvedShopeeTokens> {
  const configuredShopId = getConfiguredShopId();

  const preferDb = String(process.env.SHOPEE_TOKEN_USE_DB || '').trim().toLowerCase() !== 'false';
  if (preferDb) {
    const row = configuredShopId
      ? await prisma.shopeeToken.findUnique({ where: { shopId: configuredShopId } })
      : await prisma.shopeeToken.findFirst({ orderBy: { atualizadoEm: 'desc' } });

    if (row) {
      return {
        source: 'db',
        shopId: row.shopId,
        partnerId: row.partnerId ?? undefined,
        accessToken: row.accessToken,
        refreshToken: row.refreshToken,
        accessTokenExpiresAt: safeDate(row.accessTokenExpiresAt),
        refreshTokenExpiresAt: safeDate(row.refreshTokenExpiresAt),
        backup: {
          accessToken: row.accessTokenBackup ?? null,
          refreshToken: row.refreshTokenBackup ?? null,
          accessTokenExpiresAt: safeDate(row.accessTokenBackupExpiresAt),
          refreshTokenExpiresAt: safeDate(row.refreshTokenBackupExpiresAt),
        },
        lastRefreshAt: safeDate(row.lastRefreshAt),
        lastRefreshError: row.lastRefreshError ?? null,
      };
    }
  }

  const envAccess = process.env.SHOPEE_ACCESS_TOKEN;
  const envRefresh = process.env.SHOPEE_REFRESH_TOKEN;
  const envShopIdRaw = process.env.SHOPEE_SHOP_ID;
  const envShopId = envShopIdRaw ? Number(envShopIdRaw) : undefined;

  if (envAccess || envRefresh) {
    return {
      source: 'env',
      shopId: Number.isFinite(envShopId) ? (envShopId as number) : configuredShopId,
      partnerId: Number.isFinite(config.shopee.partnerId) ? config.shopee.partnerId : undefined,
      accessToken: envAccess,
      refreshToken: envRefresh,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    };
  }

  return { source: 'none', shopId: configuredShopId };
}

export async function upsertShopeeTokens(
  prisma: PrismaClient,
  input: {
    shopId: number;
    partnerId?: number;
    accessToken: string;
    refreshToken: string;
    expireIn?: number;
    refreshExpireIn?: number;
    lastRefreshAt?: Date;
    lastRefreshError?: string | null;
  }
): Promise<void> {
  const accessExpiresAt = computeExpiresAt(input.expireIn);
  const refreshExpiresAt = computeExpiresAt(input.refreshExpireIn);

  const existing = await prisma.shopeeToken.findUnique({ where: { shopId: input.shopId } });

  const shouldBackup =
    existing &&
    (existing.refreshToken !== input.refreshToken || existing.accessToken !== input.accessToken);

  const backupData = shouldBackup
    ? {
        accessTokenBackup: existing?.accessToken ?? null,
        accessTokenBackupExpiresAt: existing?.accessTokenExpiresAt ?? null,
        refreshTokenBackup: existing?.refreshToken ?? null,
        refreshTokenBackupExpiresAt: existing?.refreshTokenExpiresAt ?? null,
      }
    : {};

  await prisma.shopeeToken.upsert({
    where: { shopId: input.shopId },
    create: {
      shopId: input.shopId,
      partnerId: input.partnerId,
      accessToken: input.accessToken,
      accessTokenExpiresAt: accessExpiresAt,
      refreshToken: input.refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt,
      lastRefreshAt: input.lastRefreshAt ?? null,
      lastRefreshError: input.lastRefreshError ?? null,
    },
    update: {
      partnerId: input.partnerId,
      accessToken: input.accessToken,
      accessTokenExpiresAt: accessExpiresAt,
      refreshToken: input.refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt,
      lastRefreshAt: input.lastRefreshAt ?? existing?.lastRefreshAt ?? null,
      lastRefreshError: input.lastRefreshError ?? null,
      ...backupData,
    },
  });
}

export async function recordShopeeRefreshError(prisma: PrismaClient, shopId: number, error: string): Promise<void> {
  const existing = await prisma.shopeeToken.findUnique({ where: { shopId } });
  if (!existing) return;

  await prisma.shopeeToken.update({
    where: { shopId },
    data: {
      lastRefreshAt: new Date(),
      lastRefreshError: error,
    },
  });
}

export async function saveOauthCallback(
  prisma: PrismaClient,
  input: { shopId?: number; mainAccountId?: number; code?: string | null }
): Promise<{ id: string; receivedAt: Date }> {
  const row = await prisma.shopeeOauthCallback.create({
    data: {
      shopId: typeof input.shopId === 'number' && Number.isFinite(input.shopId) ? input.shopId : null,
      mainAccountId: typeof input.mainAccountId === 'number' && Number.isFinite(input.mainAccountId) ? input.mainAccountId : null,
      code: input.code ? input.code : null,
    },
    select: { id: true, receivedAt: true },
  });
  return row;
}

export async function getLatestOauthCallback(prisma: PrismaClient): Promise<{
  id: string;
  receivedAt: Date;
  shopId: number | null;
  mainAccountId: number | null;
  hasCode: boolean;
} | null> {
  const row = await prisma.shopeeOauthCallback.findFirst({
    orderBy: { receivedAt: 'desc' },
    select: {
      id: true,
      receivedAt: true,
      shopId: true,
      mainAccountId: true,
      code: true,
    },
  });

  if (!row) return null;
  return {
    id: row.id,
    receivedAt: row.receivedAt,
    shopId: row.shopId,
    mainAccountId: row.mainAccountId,
    hasCode: !!row.code,
  };
}

export async function consumeLatestOauthCode(prisma: PrismaClient, opts?: { preferId?: string }): Promise<{
  id: string;
  code: string;
  shopId: number | null;
  mainAccountId: number | null;
} | null> {
  const row = opts?.preferId
    ? await prisma.shopeeOauthCallback.findUnique({
        where: { id: opts.preferId },
        select: { id: true, code: true, shopId: true, mainAccountId: true },
      })
    : await prisma.shopeeOauthCallback.findFirst({
        orderBy: { receivedAt: 'desc' },
        select: { id: true, code: true, shopId: true, mainAccountId: true },
      });

  if (!row?.code) return null;
  return { id: row.id, code: row.code, shopId: row.shopId, mainAccountId: row.mainAccountId };
}

export async function markOauthExchangeResult(
  prisma: PrismaClient,
  input: { id: string; success: boolean; error?: string | null }
): Promise<void> {
  await prisma.shopeeOauthCallback.update({
    where: { id: input.id },
    data: {
      exchangedAt: new Date(),
      exchangeError: input.success ? null : (input.error || 'unknown_error'),
      code: input.success ? null : undefined,
    },
  });
}
