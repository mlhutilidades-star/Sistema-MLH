import { Router, Request, Response } from 'express';
import { generateAuthorizationUrl } from '../../integrations/shopee/auth';
import { exchangeCodeForTokens, refreshAccessToken, maskToken } from '../../integrations/shopee/oauth';
import { ShopeeClient } from '../../integrations/shopee/client';
import { spawn } from 'node:child_process';

const router = Router();

type LatestShopeeOauth = {
  shopId?: number;
  receivedAt: string;
};

let latest: LatestShopeeOauth | null = null;
let latestCode: string | null = null;
let latestMainAccountId: number | null = null;

type ReprocessProfitJob = {
  startedAt: string;
  finishedAt?: string;
  days: number;
  status: 'running' | 'success' | 'error';
  exitCode?: number;
  error?: string;
};

let lastReprocessProfit: ReprocessProfitJob | null = null;
let lastReprocessProfitShopee: ReprocessProfitJob | null = null;

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

// Debug de pedido (via Shopee API). Protegido por header x-admin-secret.
router.get('/orders/:orderSn/debug', async (req: Request, res: Response) => {
  try {
    requireAdmin(req);

    const orderSn = String(req.params.orderSn || '').trim();
    if (!orderSn) return res.status(400).json({ success: false, error: 'orderSn ausente' });

    const client = new ShopeeClient();
    const detail = await client.getOrderDetail([orderSn]);
    const order = detail.response?.order_list?.[0];

    if (!order) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado na resposta Shopee' });
    }

    const totalAmount = Number((order as any).total_amount ?? 0) || 0;
    const escrowAmount = Number((order as any).escrow_amount ?? 0) || 0;
    const shippingFee = Number((order as any).actual_shipping_fee ?? (order as any).estimated_shipping_fee ?? 0) || 0;
    const totalMinusShipping = totalAmount - shippingFee;

    const items = ((order as any).item_list || []).map((it: any) => {
      const qty = Number(it?.model_quantity_purchased ?? 0) || 0;
      const price = Number(it?.model_discounted_price ?? 0) || 0;
      return {
        model_sku: it?.model_sku ?? it?.item_sku ?? null,
        item_name: it?.item_name ?? null,
        model_quantity_purchased: qty,
        model_discounted_price: price,
        subtotal: qty * price,
      };
    });

    const itemTotal = items.reduce((sum: number, it: any) => sum + (Number(it.subtotal) || 0), 0);

    let escrowDetail: any = null;
    try {
      escrowDetail = await client.getEscrowDetail(orderSn);
    } catch (e) {
      escrowDetail = { error: e instanceof Error ? e.message : String(e) };
    }

    return res.json({
      success: true,
      orderSn,
      totals: {
        total_amount: totalAmount,
        escrow_amount: escrowAmount,
        actual_shipping_fee: Number((order as any).actual_shipping_fee ?? 0) || 0,
        estimated_shipping_fee: Number((order as any).estimated_shipping_fee ?? 0) || 0,
        shipping_fee_used: shippingFee,
        total_minus_shipping: totalMinusShipping,
        item_total: itemTotal,
      },
      items,
      escrowDetail,
      note: 'Endpoint de debug para validar dados retornados pela Shopee (não persiste no banco).',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Acesso negado' ? 403 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

// Reprocessar lucro Shopee (server-side) — útil quando o DB usa railway.internal.
// Protegido por header x-admin-secret.
router.post('/reprocess-profit', (req: Request, res: Response) => {
  try {
    requireAdmin(req);

    const daysRaw =
      typeof req.body?.days === 'number'
        ? req.body.days
        : typeof req.body?.days === 'string'
          ? Number(req.body.days)
          : typeof req.query.days === 'string'
            ? Number(req.query.days)
            : 30;
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;

    if (lastReprocessProfit?.status === 'running') {
      return res.status(409).json({
        success: false,
        error: 'Já existe um reprocessamento em andamento',
        job: lastReprocessProfit,
      });
    }

    lastReprocessProfit = {
      startedAt: new Date().toISOString(),
      days,
      status: 'running',
    };

    const cmd = 'node';
    const args = ['dist/scripts/reprocessRendaFromItems.js', `--days=${days}`];
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env, cwd: process.cwd() });

    child.on('exit', (code) => {
      if (!lastReprocessProfit) return;
      lastReprocessProfit.finishedAt = new Date().toISOString();
      lastReprocessProfit.exitCode = typeof code === 'number' ? code : undefined;
      lastReprocessProfit.status = code === 0 ? 'success' : 'error';
      if (code && code !== 0) {
        lastReprocessProfit.error = `Processo finalizou com código ${code}`;
      }
    });

    child.on('error', (err) => {
      if (!lastReprocessProfit) return;
      lastReprocessProfit.finishedAt = new Date().toISOString();
      lastReprocessProfit.status = 'error';
      lastReprocessProfit.error = err instanceof Error ? err.message : String(err);
    });

    return res.status(202).json({
      success: true,
      job: lastReprocessProfit,
      note: 'Job iniciado em background (DB-only: corrige renda via soma dos itens). Acompanhe logs no Railway e/ou consulte /api/shopee/reprocess-profit/status.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Acesso negado' ? 403 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

router.get('/reprocess-profit/status', (req: Request, res: Response) => {
  try {
    requireAdmin(req);
    res.json({ success: true, job: lastReprocessProfit });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Acesso negado' ? 403 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

// Reprocessar lucro Shopee consultando a API (executa scripts/sync.ts com --full-margin-calc)
// Protegido por header x-admin-secret.
router.post('/reprocess-profit-from-shopee', (req: Request, res: Response) => {
  try {
    requireAdmin(req);

    const daysRaw =
      typeof req.body?.days === 'number'
        ? req.body.days
        : typeof req.body?.days === 'string'
          ? Number(req.body.days)
          : typeof req.query.days === 'string'
            ? Number(req.query.days)
            : 30;
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, Math.floor(daysRaw))) : 30;

    if (lastReprocessProfitShopee?.status === 'running') {
      return res.status(409).json({
        success: false,
        error: 'Já existe um reprocessamento Shopee em andamento',
        job: lastReprocessProfitShopee,
      });
    }

    lastReprocessProfitShopee = {
      startedAt: new Date().toISOString(),
      days,
      status: 'running',
    };

    const cmd = 'node';
    const args = ['dist/scripts/sync.js', '--service=shopee', '--full-margin-calc', `--days=${days}`];
    const child = spawn(cmd, args, { stdio: 'inherit', env: process.env, cwd: process.cwd() });

    child.on('exit', (code) => {
      if (!lastReprocessProfitShopee) return;
      lastReprocessProfitShopee.finishedAt = new Date().toISOString();
      lastReprocessProfitShopee.exitCode = typeof code === 'number' ? code : undefined;
      lastReprocessProfitShopee.status = code === 0 ? 'success' : 'error';
      if (code && code !== 0) {
        lastReprocessProfitShopee.error = `Processo finalizou com código ${code}`;
      }
    });

    child.on('error', (err) => {
      if (!lastReprocessProfitShopee) return;
      lastReprocessProfitShopee.finishedAt = new Date().toISOString();
      lastReprocessProfitShopee.status = 'error';
      lastReprocessProfitShopee.error = err instanceof Error ? err.message : String(err);
    });

    return res.status(202).json({
      success: true,
      job: lastReprocessProfitShopee,
      note: 'Job iniciado em background (via Shopee API). Acompanhe logs no Railway e/ou consulte /api/shopee/reprocess-profit-from-shopee/status.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Acesso negado' ? 403 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

router.get('/reprocess-profit-from-shopee/status', (req: Request, res: Response) => {
  try {
    requireAdmin(req);
    res.json({ success: true, job: lastReprocessProfitShopee });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === 'Acesso negado' ? 403 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
