import { Router, Request, Response } from 'express';
import { generateAuthorizationUrl } from '../../integrations/shopee/auth';

const router = Router();

type LatestShopeeOauth = {
  shopId?: number;
  code?: string;
  receivedAt: string;
};

let latest: LatestShopeeOauth | null = null;

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

  latest = {
    shopId: Number.isFinite(shopId) ? shopId : undefined,
    code,
    receivedAt: new Date().toISOString(),
  };

  // Não logar o code (sensível). Apenas sinalizar recebimento.
  res.json({
    success: true,
    receivedAt: latest.receivedAt,
    shopId: latest.shopId,
    hasCode: !!latest.code,
    message: 'Callback Shopee recebido. Agora é possível configurar SHOPEE_SHOP_ID no Railway.',
  });
});

router.get('/oauth/last', (_req: Request, res: Response) => {
  res.json({
    success: true,
    latest,
  });
});

export default router;
