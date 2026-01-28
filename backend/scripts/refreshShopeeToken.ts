import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';
import { logger } from '../src/shared/logger';
import { refreshAccessToken } from '../src/integrations/shopee/oauth';
import { recordShopeeRefreshError, resolveShopeeTokens, upsertShopeeTokens } from '../src/modules/shopee/tokenStore';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.substring(prefix.length) : undefined;
}

function parseNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

let lastShopId: number | undefined;

async function main(): Promise<void> {
  await connectDatabase();
  const prisma = getPrismaClient();

  const dryRun = String(getArg('dryRun') || '').trim().toLowerCase() === 'true';
  const overrideShopIdRaw = getArg('shopId');
  const overrideShopId = overrideShopIdRaw ? Number(overrideShopIdRaw) : undefined;

  const resolved = await resolveShopeeTokens(prisma);
  const shopId = Number.isFinite(overrideShopId) ? (overrideShopId as number) : resolved.shopId;
  lastShopId = typeof shopId === 'number' && Number.isFinite(shopId) ? shopId : undefined;

  if (!shopId || !Number.isFinite(shopId)) {
    throw new Error('shopId ausente (configure SHOPEE_SHOP_ID ou passe --shopId=...)');
  }

  // Execução condicional (para rodar em cron frequente sem refresh desnecessário).
  const ifExpiringInSec =
    parseNumber(getArg('ifExpiringInSec')) ??
    parseNumber(process.env.SHOPEE_OAUTH_IF_EXPIRING_IN_SEC) ??
    3600; // 1h

  // Se Shopee informar expiração do refresh token, forçar renovação antes do "fim".
  // Default = 5 dias (equivale a renovar antes de ~25 dias de um ciclo de 30 dias).
  const forceRefreshTokenInDays =
    parseNumber(getArg('forceRefreshTokenInDays')) ??
    parseNumber(process.env.SHOPEE_OAUTH_FORCE_REFRESH_TOKEN_DAYS) ??
    5;

  const now = Date.now();
  const accessMsLeft = resolved.accessTokenExpiresAt ? resolved.accessTokenExpiresAt.getTime() - now : null;
  const refreshMsLeft = resolved.refreshTokenExpiresAt ? resolved.refreshTokenExpiresAt.getTime() - now : null;

  const shouldRefreshForAccess =
    accessMsLeft === null ? true : accessMsLeft <= Math.max(0, Math.floor(ifExpiringInSec)) * 1000;
  const shouldRefreshForRefreshToken =
    refreshMsLeft === null
      ? false
      : refreshMsLeft <= Math.max(0, Math.floor(forceRefreshTokenInDays)) * 86400 * 1000;

  if (!shouldRefreshForAccess && !shouldRefreshForRefreshToken) {
    logger.info('Shopee OAuth refresh: skip (tokens ainda válidos)', {
      shopId,
      ifExpiringInSec,
      forceRefreshTokenInDays,
      accessTokenExpiresAt: resolved.accessTokenExpiresAt ? resolved.accessTokenExpiresAt.toISOString() : null,
      refreshTokenExpiresAt: resolved.refreshTokenExpiresAt ? resolved.refreshTokenExpiresAt.toISOString() : null,
    });
    await disconnectDatabase();
    return;
  }

  const tryRefresh = async (refreshToken: string, label: string) => {
    logger.info(`Shopee OAuth refresh: tentando (${label})`, { shopId });
    const tokens = await refreshAccessToken({ refreshToken, shopId });
    return tokens;
  };

  const primaryRefresh = resolved.refreshToken;
  const backupRefresh = resolved.backup?.refreshToken || null;

  if (!primaryRefresh) {
    throw new Error('refresh_token ausente (nenhum token encontrado em DB/env)');
  }

  let used: 'primary' | 'backup' = 'primary';
  let tokens = null as any;

  try {
    tokens = await tryRefresh(primaryRefresh, resolved.source === 'db' ? 'db.primary' : 'env');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.warn('Shopee OAuth refresh falhou (primary)', { shopId, message });

    if (backupRefresh && backupRefresh !== primaryRefresh) {
      used = 'backup';
      tokens = await tryRefresh(backupRefresh, 'db.backup');
    } else {
      throw e;
    }
  }

  const refreshExpireIn = (tokens as any).refresh_expire_in ?? (tokens as any).refresh_token_expire_in;

  if (dryRun) {
    logger.info('Dry-run: refresh ok; não persistindo tokens', {
      shopId: tokens.shop_id,
      partnerId: tokens.partner_id,
      expireIn: tokens.expire_in,
      used,
    });
    await disconnectDatabase();
    return;
  }

  await upsertShopeeTokens(prisma, {
    shopId: tokens.shop_id,
    partnerId: tokens.partner_id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expireIn: tokens.expire_in,
    refreshExpireIn,
    lastRefreshAt: new Date(),
    lastRefreshError: null,
  });

  await prisma.logSync.create({
    data: {
      tipo: 'SHOPEE_OAUTH',
      status: 'SUCESSO',
      origem: 'SHOPEE',
      mensagem: `Shopee OAuth refresh OK (used=${used})`,
      registros: 1,
    },
  });

  logger.info('Shopee OAuth refresh: tokens persistidos no DB', { shopId: tokens.shop_id, used });

  await disconnectDatabase();
}

main()
  .then(() => process.exit(0))
  .catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Shopee OAuth refresh: erro', { message });

    try {
      await connectDatabase();
      const prisma = getPrismaClient();

      const shopIdFromEnvRaw = process.env.SHOPEE_SHOP_ID;
      const shopIdFromEnv = shopIdFromEnvRaw ? Number(shopIdFromEnvRaw) : undefined;
      const shopId = lastShopId ?? (Number.isFinite(shopIdFromEnv) ? (shopIdFromEnv as number) : undefined);

      if (typeof shopId === 'number' && Number.isFinite(shopId)) {
        await recordShopeeRefreshError(prisma, shopId, message);
      }

      await prisma.logSync.create({
        data: {
          tipo: 'SHOPEE_OAUTH',
          status: 'ERRO',
          origem: 'SHOPEE',
          mensagem: 'Shopee OAuth refresh falhou',
          detalhes: message,
          registros: 0,
        },
      });
    } catch {
      // noop
    }

    try {
      await disconnectDatabase();
    } catch {
      // noop
    }

    process.exit(1);
  });
