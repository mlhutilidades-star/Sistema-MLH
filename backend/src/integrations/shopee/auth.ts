// ==========================================
// SHOPEE OPEN API v2 - AUTENTICAÇÃO
// OAuth2 + HMAC-SHA256 Signature
// ==========================================

import crypto from 'crypto';
import { config } from '../../shared/config';

export interface ShopeeAuthParams {
  partnerId: number;
  partnerKey: string;
  shopId?: number;
  path: string;
  accessToken?: string;
}

/**
 * Gerar assinatura HMAC-SHA256 para Shopee API
 */
export function generateShopeeSignature(params: ShopeeAuthParams): {
  sign: string;
  timestamp: number;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const { partnerId, partnerKey, shopId, path, accessToken } = params;

  // Construir base string conforme documentação Shopee
  // Base string format: partner_id + path + timestamp + access_token? + shop_id?
  // (para alguns endpoints, access_token e/ou shop_id não entram na assinatura)
  let baseString = `${partnerId}${path}${timestamp}`;

  if (accessToken) {
    baseString += accessToken;
  }

  if (typeof shopId === 'number' && shopId > 0) {
    baseString += shopId;
  }

  // Gerar HMAC-SHA256
  const sign = crypto
    .createHmac('sha256', partnerKey)
    .update(baseString)
    .digest('hex');

  return { sign, timestamp };
}

/**
 * Construir URL completa com parâmetros de autenticação
 */
export function buildShopeeUrl(
  path: string,
  params: Record<string, any> = {},
  accessToken?: string
): string {
  if (!config.shopee.shopId || config.shopee.shopId <= 0) {
    throw new Error('SHOPEE_SHOP_ID não configurado');
  }

  const { sign, timestamp } = generateShopeeSignature({
    partnerId: config.shopee.partnerId,
    partnerKey: config.shopee.partnerKey,
    shopId: config.shopee.shopId,
    path,
    accessToken,
  });

  const urlParams = new URLSearchParams({
    partner_id: config.shopee.partnerId.toString(),
    shop_id: config.shopee.shopId.toString(),
    sign,
    timestamp: timestamp.toString(),
    ...params,
  });

  if (accessToken) {
    urlParams.append('access_token', accessToken);
  }

  return `${config.shopee.baseUrl}${path}?${urlParams.toString()}`;
}

/**
 * Gerar URL de autorização OAuth2
 */
export function generateAuthorizationUrl(redirectUrl: string): string {
  // Shopee Partner v2 OAuth2: /shop/auth_partner
  // Signature base string: partner_id + path + timestamp
  const path = '/shop/auth_partner';
  const { sign, timestamp } = generateShopeeSignature({
    partnerId: config.shopee.partnerId,
    partnerKey: config.shopee.partnerKey,
    path,
  });

  const params = new URLSearchParams({
    partner_id: config.shopee.partnerId.toString(),
    redirect: redirectUrl,
    sign,
    timestamp: timestamp.toString(),
  });

  return `${config.shopee.baseUrl}${path}?${params.toString()}`;
}

/**
 * Validar webhook signature
 */
export function validateWebhookSignature(
  url: string,
  body: string,
  receivedSign: string
): boolean {
  const baseString = `${url}|${body}`;
  
  const calculatedSign = crypto
    .createHmac('sha256', config.shopee.partnerKey)
    .update(baseString)
    .digest('hex');

  return calculatedSign === receivedSign;
}
