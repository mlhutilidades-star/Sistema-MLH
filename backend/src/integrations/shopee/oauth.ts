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
  partner_id: number;
  shop_id: number;
  merchant_id?: number;
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

function unwrapResponse<T>(raw: unknown): T {
  if (!raw) throw new Error('Resposta vazia da Shopee');

  if (typeof raw !== 'object') {
    logger.warn('Shopee OAuth API returned non-object payload', {
      payloadType: typeof raw,
    });
    throw new Error('Resposta inválida da Shopee (payload não-JSON)');
  }

  const data = raw as ShopeeApiEnvelope<T>;

  if (data.error && data.error !== '') {
    const requestId = data.request_id ? ` (request_id=${data.request_id})` : '';
    logger.warn('Shopee OAuth API returned error', {
      error: data.error,
      message: data.message,
      requestId: data.request_id,
    });
    throw new Error(`Shopee OAuth Error: ${data.error} - ${data.message}${requestId}`);
  }

  if (!data.response) {
    logger.warn('Shopee OAuth API returned unexpected envelope', {
      keys: Object.keys(data as any),
      hasErrorField: 'error' in (data as any),
      hasMessageField: 'message' in (data as any),
      hasResponseField: 'response' in (data as any),
      error: (data as any).error,
      message: (data as any).message,
      requestId: (data as any).request_id,
    });
    throw new Error('Resposta inválida da Shopee (sem response)');
  }

  return data.response;
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

    return unwrapResponse(data);
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

  // Mantém compatibilidade com o endpoint atual do projeto, mas usando o padrão de assinatura/headers.
  const apiPathForSign = '/api/v2/auth/access_token/refresh';
  const urlPath = '/auth/access_token/refresh';
  const auth = generateShopeeSignature({
    partnerId: config.shopee.partnerId,
    partnerKey: config.shopee.partnerKey,
    path: apiPathForSign,
  });
  const url = buildShopeeV2UrlWithAuthQuery(urlPath, auth);

  try {
    const { data } = await axios.post<ShopeeApiEnvelope<ShopeeTokenResponse>>(url, {
      partner_id: config.shopee.partnerId,
      shop_id: input.shopId,
      refresh_token: input.refreshToken,
      timestamp: auth.timestamp,
    }, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth.sign,
      },
      timeout: config.shopee.timeout,
    });

    return unwrapResponse(data);
  } catch (error) {
    throw new Error(`Falha ao renovar access token: ${extractAxiosErrorMessage(error)}`);
  }
}

export function maskToken(token: string, visible: number = 6): string {
  if (!token) return '';
  if (token.length <= visible * 2) return `${token.substring(0, Math.min(token.length, visible))}...`;
  return `${token.substring(0, visible)}...${token.substring(token.length - visible)}`;
}
