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

function buildSignedUrl(path: string): string {
  const { sign, timestamp } = generateShopeeSignature({
    partnerId: config.shopee.partnerId,
    partnerKey: config.shopee.partnerKey,
    // A assinatura usa o path completo incluindo /api/v2.
    path: `/api/v2${path}`,
  });

  const params = new URLSearchParams({
    partner_id: String(config.shopee.partnerId),
    timestamp: String(timestamp),
    sign,
  });

  return `${config.shopee.baseUrl}${path}?${params.toString()}`;
}

function unwrapResponse<T>(data: ShopeeApiEnvelope<T>): T {
  if (!data) throw new Error('Resposta vazia da Shopee');
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

  const primaryPath = '/auth/access_token/get';
  const fallbackPath = '/auth/token/get';

  logger.info('Shopee OAuth exchange requested', {
    baseUrl: config.shopee.baseUrl,
    endpoint: primaryPath,
    codeLen: input.code?.length ?? 0,
    hasShopId: typeof input.shopId === 'number' && Number.isFinite(input.shopId),
    hasMainAccountId: typeof input.mainAccountId === 'number' && Number.isFinite(input.mainAccountId),
  });

  try {
    const body: any = {
      partner_id: config.shopee.partnerId,
      code: input.code,
    };

    // Para algumas autorizações, a Shopee retorna `main_account_id`.
    // Nesses casos, a troca do code deve usar `main_account_id` (e não `shop_id`).
    if (typeof input.mainAccountId === 'number' && Number.isFinite(input.mainAccountId)) {
      body.main_account_id = input.mainAccountId;
    } else {
      if (typeof input.shopId !== 'number' || !Number.isFinite(input.shopId)) {
        throw new Error('shop_id ausente para troca de code');
      }
      body.shop_id = input.shopId;
    }

    const post = async (path: string): Promise<ShopeeTokenResponse> => {
      const url = buildSignedUrl(path);
      const { data } = await axios.post<ShopeeApiEnvelope<ShopeeTokenResponse>>(
        url,
        body,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: config.shopee.timeout,
        }
      );
      return unwrapResponse(data);
    };

    try {
      return await post(primaryPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Alguns parceiros reportam que o endpoint correto pode variar.
      // Se a Shopee reclamar de `refresh_token` numa troca de `code`, tente endpoint alternativo.
      if (msg.includes('error_param') && msg.toLowerCase().includes('refresh_token')) {
        logger.warn('Shopee OAuth exchange retrying with fallback endpoint', {
          fallbackEndpoint: fallbackPath,
        });
        return await post(fallbackPath);
      }
      throw e;
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data as any;
      logger.warn('Shopee OAuth exchange failed', {
        status,
        endpoint: primaryPath,
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

  const url = buildSignedUrl('/auth/access_token/refresh');

  try {
    const { data } = await axios.post<ShopeeApiEnvelope<ShopeeTokenResponse>>(
      url,
      {
        partner_id: config.shopee.partnerId,
        shop_id: input.shopId,
        refresh_token: input.refreshToken,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: config.shopee.timeout,
      }
    );

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
