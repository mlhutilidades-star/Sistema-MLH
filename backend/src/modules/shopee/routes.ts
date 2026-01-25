import { Router, Request, Response } from 'express';
import { generateAuthorizationUrl } from '../../integrations/shopee/auth';
import { exchangeCodeForTokens, refreshAccessToken, maskToken } from '../../integrations/shopee/oauth';

const router = Router();

type LatestShopeeOauth = {
  shopId?: number;
  receivedAt: string;
};

let latest: LatestShopeeOauth | null = null;
let latestCode: string | null = null;
let latestMainAccountId: number | null = null;

function requireAdmin(req: Request): void {
  const secret = process.env.OAUTH_ADMIN_SECRET;
  if (!secret) {
    throw new Error('OAUTH_ADMIN_SECRET não configurado');
  }

  const provided = req.header('x-admin-secret');
  if (!provided || provided !== secret) {
    throw new Error('Acesso negado');
  }
}

function buildRedirectUrl(req: Request): string {
  if (process.env.SHOPEE_REDIRECT_URL) {
    return process.env.SHOPEE_REDIRECT_URL;
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/shopee/oauth/callback`;
  }

  const host = req.get('host') || `localhost:${process.env.PORT || 3000}`;
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http') as string;
  return `${proto}://${host}/api/shopee/oauth/callback`;
}

router.get('/oauth/authorize-url', (req: Request, res: Response) => {
  const redirectUrl = buildRedirectUrl(req);
  const url = generateAuthorizationUrl(redirectUrl);

  res.json({
    success: true,
    redirectUrl,
    url,
    note: 'Abra a URL no navegador, autorize a loja, e a Shopee irá redirecionar para /api/shopee/oauth/callback.',
  });
});

router.get('/oauth/callback', (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const shopIdRaw = req.query.shop_id ?? req.query.shopid;
  const shopId = typeof shopIdRaw === 'string' ? Number(shopIdRaw) : undefined;
  const mainAccountIdRaw = req.query.main_account_id ?? req.query.mainaccountid;
  const mainAccountId = typeof mainAccountIdRaw === 'string' ? Number(mainAccountIdRaw) : undefined;

  latest = {
    shopId: Number.isFinite(shopId) ? shopId : undefined,
    receivedAt: new Date().toISOString(),
  };

  latestCode = typeof code === 'string' && code.length > 0 ? code : null;
  latestMainAccountId = Number.isFinite(mainAccountId) ? (mainAccountId as number) : null;

  // Não logar o code (sensível). Apenas sinalizar recebimento.
  res.json({
    success: true,
    receivedAt: latest.receivedAt,
    shopId: latest.shopId,
    hasCode: !!code,
    hasMainAccountId: Number.isFinite(mainAccountId),
    message: 'Callback Shopee recebido. Agora é possível configurar SHOPEE_SHOP_ID no Railway.',
  });
});

// Endpoint alternativo (para uso via terminal/script) que aceita JSON no body.
router.post('/oauth/callback', (req: Request, res: Response) => {
  const code = typeof req.body?.code === 'string' ? (req.body.code as string) : undefined;
  const shopIdRaw = req.body?.shop_id ?? req.body?.shopId;
  const shopId = typeof shopIdRaw === 'number' ? shopIdRaw : typeof shopIdRaw === 'string' ? Number(shopIdRaw) : undefined;
  const mainAccountIdRaw = req.body?.main_account_id ?? req.body?.mainAccountId;
  const mainAccountId = typeof mainAccountIdRaw === 'number'
    ? mainAccountIdRaw
    : typeof mainAccountIdRaw === 'string'
      ? Number(mainAccountIdRaw)
      : undefined;

  latest = {
    shopId: Number.isFinite(shopId) ? shopId : undefined,
    receivedAt: new Date().toISOString(),
  };

  latestCode = typeof code === 'string' && code.length > 0 ? code : null;
  latestMainAccountId = Number.isFinite(mainAccountId) ? (mainAccountId as number) : null;

  res.json({
    success: true,
    receivedAt: latest.receivedAt,
    shopId: latest.shopId,
    hasCode: !!code,
    hasMainAccountId: Number.isFinite(mainAccountId),
  });
});

router.get('/oauth/last', (_req: Request, res: Response) => {
  res.json({
    success: true,
    latest: latest
      ? {
          shopId: latest.shopId,
          receivedAt: latest.receivedAt,
          hasCode: !!latestCode,
          hasMainAccountId: Number.isFinite(latestMainAccountId),
        }
      : null,
  });
});

// Troca code por tokens. Protegido por header x-admin-secret.
router.post('/oauth/exchange', async (req: Request, res: Response) => {
  try {
    requireAdmin(req);

    const code = typeof req.body?.code === 'string' ? (req.body.code as string) : latestCode;
    const shopIdRaw = req.body?.shop_id ?? req.body?.shopId ?? latest?.shopId;
    const shopId = typeof shopIdRaw === 'number' ? shopIdRaw : typeof shopIdRaw === 'string' ? Number(shopIdRaw) : undefined;
    const mainAccountIdRaw = req.body?.main_account_id ?? req.body?.mainAccountId ?? latestMainAccountId;
    const mainAccountId = typeof mainAccountIdRaw === 'number'
      ? mainAccountIdRaw
      : typeof mainAccountIdRaw === 'string'
        ? Number(mainAccountIdRaw)
        : undefined;

    if (!code) {
      return res.status(400).json({ success: false, error: 'code ausente' });
    }

    const hasShopId = typeof shopId === 'number' && Number.isFinite(shopId);
    const hasMainAccountId = typeof mainAccountId === 'number' && Number.isFinite(mainAccountId);
    if (!hasShopId && !hasMainAccountId) {
      return res.status(400).json({
        success: false,
        error: 'shop_id ou main_account_id ausente',
      });
    }

    const tokens = await exchangeCodeForTokens({
      code,
      shopId: hasShopId ? Number(shopId) : undefined,
      mainAccountId: hasMainAccountId ? Number(mainAccountId) : undefined,
    });

    // Não logar tokens.
    res.json({
      success: true,
      shopId: tokens.shop_id,
      partnerId: tokens.partner_id,
      expireIn: tokens.expire_in,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenMasked: maskToken(tokens.access_token),
      refreshTokenMasked: maskToken(tokens.refresh_token),
      note: 'Use o script/terminal para salvar SHOPEE_ACCESS_TOKEN e SHOPEE_REFRESH_TOKEN no Railway.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Acesso negado' ? 403 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

// Renovar access token via refresh_token. Protegido por header x-admin-secret.
router.post('/oauth/refresh', async (req: Request, res: Response) => {
  try {
    requireAdmin(req);

    const refreshToken = typeof req.body?.refresh_token === 'string'
      ? (req.body.refresh_token as string)
      : typeof req.body?.refreshToken === 'string'
        ? (req.body.refreshToken as string)
        : process.env.SHOPEE_REFRESH_TOKEN;

    const shopIdRaw = req.body?.shop_id ?? req.body?.shopId ?? process.env.SHOPEE_SHOP_ID;
    const shopId = typeof shopIdRaw === 'number' ? shopIdRaw : typeof shopIdRaw === 'string' ? Number(shopIdRaw) : undefined;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'refresh_token ausente' });
    }
    if (!shopId || !Number.isFinite(shopId)) {
      return res.status(400).json({ success: false, error: 'shop_id ausente' });
    }

    const tokens = await refreshAccessToken({ refreshToken, shopId: Number(shopId) });

    res.json({
      success: true,
      shopId: tokens.shop_id,
      partnerId: tokens.partner_id,
      expireIn: tokens.expire_in,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      accessTokenMasked: maskToken(tokens.access_token),
      refreshTokenMasked: maskToken(tokens.refresh_token),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Acesso negado' ? 403 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
