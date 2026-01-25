// ==========================================
// SHOPEE OPEN API v2 - OAUTH TOKEN FLOW
// Exchange authorization code -> access/refresh token
// Refresh access token
// ==========================================

import axios from 'axios';
import { config } from '../../shared/config';
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
    throw new Error(`Shopee OAuth Error: ${data.error} - ${data.message}`);
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
  shopId: number;
  mainAccountId?: number;
}): Promise<ShopeeTokenResponse> {
  if (!config.shopee.partnerId || !config.shopee.partnerKey) {
    throw new Error('Credenciais Shopee ausentes (SHOPEE_PARTNER_ID/SHOPEE_PARTNER_KEY)');
  }

  const url = buildSignedUrl('/auth/access_token/get');

  try {
    const { data } = await axios.post<ShopeeApiEnvelope<ShopeeTokenResponse>>(
      url,
      {
        partner_id: config.shopee.partnerId,
        shop_id: input.shopId,
        code: input.code,
        ...(typeof input.mainAccountId === 'number' ? { main_account_id: input.mainAccountId } : {}),
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
