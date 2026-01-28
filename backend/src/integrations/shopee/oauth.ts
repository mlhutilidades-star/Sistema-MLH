// ==========================================
// SHOPEE OPEN API v2 - OAUTH TOKEN FLOW
// Exchange authorization code -> access/refresh token
// Refresh access token
// ==========================================

import axios from 'axios';
import { config } from '../../shared/config';
import { logger } from '../../shared/logger';
import { generateShopeeSignature } from './auth';

export type ShopeeTokenResponse = {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  // Alguns retornos incluem expiração do refresh token.
  refresh_expire_in?: number;
  refresh_token_expire_in?: number;
  partner_id: number;
  shop_id: number;
  merchant_id?: number;
  // Algumas respostas do endpoint /auth/token/get vêm com listas no topo (sem `response`).
  shop_id_list?: number[];
  merchant_id_list?: number[];
  supplier_id_list?: number[];
  user_id_list?: number[];
};

type ShopeeApiEnvelope<T> = {
  error: string;
  message: string;
  warning?: string;
  request_id?: string;
  response?: T;
};

function buildShopeeV2Url(path: string): string {
  const base = config.shopee.baseUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

function buildShopeeV2UrlWithAuthQuery(path: string, auth: { sign: string; timestamp: number }): string {
  const url = buildShopeeV2Url(path);
  const params = new URLSearchParams({
    partner_id: String(config.shopee.partnerId),
    timestamp: String(auth.timestamp),
    sign: auth.sign,
  });
  return `${url}?${params.toString()}`;
}


function unwrapShopeeTokenResponse(raw: unknown): ShopeeTokenResponse {
  if (!raw) throw new Error('Resposta vazia da Shopee');
  if (typeof raw !== 'object') throw new Error('Resposta inválida da Shopee (payload não-JSON)');

  const data = raw as any;

  // Se vier no formato envelope { error, message, response: {...} }
  if (data && typeof data === 'object' && 'error' in data && 'message' in data) {
    if (data.error && data.error !== '') {
      const requestId = data.request_id ? ` (request_id=${data.request_id})` : '';
      throw new Error(`Shopee OAuth Error: ${data.error} - ${data.message}${requestId}`);
    }

    if (data.response && typeof data.response === 'object') {
      const resp = data.response as any;
      return resp as ShopeeTokenResponse;
    }
  }

  // Algumas respostas do /auth/token/get vêm no topo (sem `response`).
  if (typeof data.access_token === 'string' && typeof data.refresh_token === 'string') {
    return data as ShopeeTokenResponse;
  }

  logger.warn('Shopee OAuth token response in unknown shape', {
    keys: Object.keys(data || {}),
  });
  throw new Error('Resposta inválida da Shopee (tokens ausentes)');
}

function normalizeShopeeTokenResponse(raw: ShopeeTokenResponse, fallback: { shopId?: number }): ShopeeTokenResponse {
  const shopIdFromList = Array.isArray(raw.shop_id_list) && raw.shop_id_list.length > 0 ? Number(raw.shop_id_list[0]) : undefined;
  const merchantIdFromList = Array.isArray(raw.merchant_id_list) && raw.merchant_id_list.length > 0 ? Number(raw.merchant_id_list[0]) : undefined;

  const shop_id =
    typeof (raw as any).shop_id === 'number' && Number.isFinite((raw as any).shop_id)
      ? Number((raw as any).shop_id)
      : typeof fallback.shopId === 'number' && Number.isFinite(fallback.shopId)
        ? Number(fallback.shopId)
        : typeof shopIdFromList === 'number' && Number.isFinite(shopIdFromList)
          ? shopIdFromList
          : undefined;

  if (!shop_id) {
    throw new Error('Resposta inválida da Shopee (shop_id ausente)');
  }

  return {
    ...raw,
    partner_id: config.shopee.partnerId,
    shop_id,
    merchant_id:
      typeof (raw as any).merchant_id === 'number' && Number.isFinite((raw as any).merchant_id)
        ? Number((raw as any).merchant_id)
        : typeof merchantIdFromList === 'number' && Number.isFinite(merchantIdFromList)
          ? merchantIdFromList
          : undefined,
  };
}

function extractAxiosErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = (error.response?.data ?? null) as any;
    const status = error.response?.status;
    if (data?.error || data?.message) {
      return `HTTP ${status}: ${data.error || ''} ${data.message || ''}`.trim();
    }
    return `HTTP ${status}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function exchangeCodeForTokens(input: {
  code: string;
  shopId?: number;
  mainAccountId?: number;
}): Promise<ShopeeTokenResponse> {
  if (!config.shopee.partnerId || !config.shopee.partnerKey) {
    throw new Error('Credenciais Shopee ausentes (SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY)');
  }

  // Doc oficial (v2.public.get_access_token): POST /api/v2/auth/token/get
  // Assinatura: HMAC-SHA256(partner_id + api_path + timestamp, partner_key)
  // Header: Authorization: <sign>
  const apiPathForSign = '/api/v2/auth/token/get';
  const urlPath = '/auth/token/get';
  const auth = generateShopeeSignature({
    partnerId: config.shopee.partnerId,
    partnerKey: config.shopee.partnerKey,
    path: apiPathForSign,
  });
  const url = buildShopeeV2UrlWithAuthQuery(urlPath, auth);

  logger.info('Shopee OAuth exchange requested', {
    baseUrl: config.shopee.baseUrl,
    endpoint: urlPath,
    codeLen: input.code?.length ?? 0,
    hasShopId: typeof input.shopId === 'number' && Number.isFinite(input.shopId),
    hasMainAccountId: typeof input.mainAccountId === 'number' && Number.isFinite(input.mainAccountId),
  });

  try {
    const body: Record<string, any> = {
      code: input.code,
      partner_id: config.shopee.partnerId,
      timestamp: auth.timestamp,
    };

    // Campos condicionais conforme doc: shop_id OU main_account_id
    if (typeof input.mainAccountId === 'number' && Number.isFinite(input.mainAccountId)) {
      body.main_account_id = input.mainAccountId;
    } else {
      if (typeof input.shopId !== 'number' || !Number.isFinite(input.shopId)) {
        throw new Error('shop_id ausente para troca de code');
      }
      body.shop_id = input.shopId;
    }

    const { data } = await axios.post<ShopeeApiEnvelope<ShopeeTokenResponse>>(url, body, {
      headers: {
        'Content-Type': 'application/json',
        // Alguns ambientes parecem exigir partner_id/timestamp/sign na query; manter Authorization também não atrapalha.
        Authorization: auth.sign,
      },
      timeout: config.shopee.timeout,
    });

    const tokens = unwrapShopeeTokenResponse(data);
    return normalizeShopeeTokenResponse(tokens, { shopId: input.shopId });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as any;
      logger.warn('Shopee OAuth exchange failed', {
        status,
        endpoint: urlPath,
        responseError: data?.error,
        responseMessage: data?.message,
        requestId: data?.request_id,
      });
    }
    throw new Error(`Falha ao trocar code por tokens: ${extractAxiosErrorMessage(error)}`);
  }
}

export async function refreshAccessToken(input: {
  refreshToken: string;
  shopId: number;
}): Promise<ShopeeTokenResponse> {
  if (!config.shopee.partnerId || !config.shopee.partnerKey) {
    throw new Error('Credenciais Shopee ausentes (SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY)');
  }

  try {
    const attempt = async (apiPathForSign: string, urlPath: string) => {
      const auth = generateShopeeSignature({
        partnerId: config.shopee.partnerId,
        partnerKey: config.shopee.partnerKey,
        path: apiPathForSign,
      });
      const url = buildShopeeV2UrlWithAuthQuery(urlPath, auth);

      const { data } = await axios.post<ShopeeApiEnvelope<ShopeeTokenResponse>>(
        url,
        {
          partner_id: config.shopee.partnerId,
          shop_id: input.shopId,
          refresh_token: input.refreshToken,
          timestamp: auth.timestamp,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: auth.sign,
          },
          timeout: config.shopee.timeout,
        }
      );

      const tokens = unwrapShopeeTokenResponse(data);
      return normalizeShopeeTokenResponse(tokens, { shopId: input.shopId });
    };

    try {
      // Doc v2 (refresh access token): /api/v2/auth/access_token/get
      return await attempt('/api/v2/auth/access_token/get', '/auth/access_token/get');
    } catch (error) {
      const msg = extractAxiosErrorMessage(error).toLowerCase();
      // Alguns ambientes antigos podem expor /refresh; manter fallback.
      if (msg.includes('http 404') || msg.includes('error_not_found')) {
        logger.warn('Shopee access_token/get not found; trying fallback /auth/access_token/refresh');
        return await attempt('/api/v2/auth/access_token/refresh', '/auth/access_token/refresh');
      }
      throw error;
    }
  } catch (error) {
    throw new Error(`Falha ao renovar access token: ${extractAxiosErrorMessage(error)}`);
  }
}

export function maskToken(token: string, visible: number = 6): string {
  if (!token) return '';
  if (token.length <= visible * 2) return `${token.substring(0, Math.min(token.length, visible))}...`;
  return `${token.substring(0, visible)}...${token.substring(token.length - visible)}`;
}
