import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../shared/logger';
import { extractTimestampSec, verifyWebhookSignature } from './webhookSignature';
import {
  extractEventId,
  extractEventType,
  extractItemIds,
  extractModelIds,
  extractShopId,
  normalizePayload,
} from './webhookUtils';
import { recordWebhookIgnored, recordWebhookReceived } from './webhookMetrics';

type HeaderMap = Record<string, string | string[] | undefined>;

export type WebhookHandleInput = {
  headers: HeaderMap;
  rawBody?: Buffer;
  body: unknown;
  path: string;
  ip?: string;
  userAgent?: string;
};

export type WebhookHandleResult = {
  ok: boolean;
  status: number;
  eventId?: string;
  duplicate?: boolean;
  error?: string;
  reason?: string;
};

function normalizeIp(value?: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutPort = trimmed.includes('.') && trimmed.includes(':') ? trimmed.split(':')[0] : trimmed;
  if (withoutPort.toLowerCase().startsWith('::ffff:')) return withoutPort.slice(7);
  return withoutPort;
}

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  const entries = raw
    .split(',')
    .map((item) => normalizeIp(item))
    .filter((item): item is string => !!item);
  return new Set(entries.map((entry) => entry.toLowerCase()));
}

function isVerifyBypassAllowed(input: {
  reason?: string;
  ip?: string;
}): boolean {
  const enabled = String(process.env.SHOPEE_WEBHOOK_VERIFY_BYPASS_ENABLED || '').trim().toLowerCase() === 'true';
  if (!enabled) return false;
  const bypassReasons = new Set([
    'timestamp_missing',
    'signature_missing',
    'timestamp_out_of_range',
    'signature_mismatch',
  ]);
  if (!input.reason || !bypassReasons.has(input.reason)) {
    return false;
  }
  const allowlist = parseAllowlist(process.env.SHOPEE_WEBHOOK_VERIFY_BYPASS_IP_ALLOWLIST);
  if (allowlist.size === 0) return false;
  if (allowlist.has('*')) return true; // wildcard: any IP while bypass is enabled
  const ip = normalizeIp(input.ip);
  if (!ip) return false;
  return allowlist.has(ip.toLowerCase());
}

function getPayloadKeys(payload: unknown, limit: number = 40): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return Object.keys(payload as Record<string, unknown>).slice(0, limit);
}

function getHeaderValue(headers: HeaderMap, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() !== target) continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value[0] ?? null;
    return null;
  }
  return null;
}

function hasSignatureHeader(headers: HeaderMap): boolean {
  const candidates = ['authorization', 'x-authorization', 'x-shopee-authorization', 'x-shopee-signature'];
  return candidates.some((name) => {
    const value = getHeaderValue(headers, name);
    return !!(value && String(value).trim());
  });
}

function isVerifyPingCandidate(payload: unknown): { ok: boolean; reason: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'not_object' };
  const obj = payload as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return { ok: true, reason: 'empty_object' };

  // Verificações de console costumam ser payloads pequenos, sem indicadores de evento.
  // Para evitar ignorar eventos reais: não aceitar nada que pareça “evento”.
  const hardEventIndicators = new Set([
    'event_type',
    'eventType',
    'message_type',
    'messageType',
    'topic',
    'type',
    'event',
    'events',
  ]);
  if (keys.some((k) => hardEventIndicators.has(k))) return { ok: false, reason: 'has_event_fields' };

  // Alguns verifies chegam como: { code, data: { shop_id, partner_id, request_id, timestamp... } }
  // Permitir `data` se for objeto pequeno com chaves “seguras” e valores primitivos.
  const allowedNestedDataKeys = new Set([
    'shop_id',
    'shopId',
    'partner_id',
    'partnerId',
    'request_id',
    'requestId',
    'timestamp',
    'ts',
    'time',
    'event_time',
    'eventTime',
    'created_at',
    'createdAt',
    'message',
    'success',
  ]);
  if ('data' in obj) {
    const dataValue = obj.data;
    if (dataValue == null) {
      // ok
    } else if (typeof dataValue === 'object' && !Array.isArray(dataValue)) {
      const dataObj = dataValue as Record<string, unknown>;
      const dataKeys = Object.keys(dataObj);
      if (dataKeys.length > 25) return { ok: false, reason: 'data_too_large' };
      const unknownNested = dataKeys.filter((k) => !allowedNestedDataKeys.has(k));
      if (unknownNested.length > 0) return { ok: false, reason: 'data_unexpected_fields' };
      for (const value of Object.values(dataObj)) {
        if (value == null) continue;
        const valueType = typeof value;
        if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') continue;
        return { ok: false, reason: 'data_non_primitive_field' };
      }
    } else {
      return { ok: false, reason: 'data_invalid' };
    }
  }

  // Bloquear chaves típicas de eventos de domínio.
  const domainEventKeys = new Set([
    'order_sn',
    'ordersn',
    'orderSn',
    'orders',
    'item_id',
    'itemId',
    'item_ids',
    'itemIds',
    'model_id',
    'modelId',
    'model_ids',
    'modelIds',
  ]);
  if (keys.some((k) => domainEventKeys.has(k))) return { ok: false, reason: 'has_domain_event_fields' };

  // Permitir chaves extras comuns, desde que sejam primitivas (sem objetos/arrays).
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'data') continue;
    if (value == null) continue;
    const valueType = typeof value;
    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') continue;
    return { ok: false, reason: 'non_primitive_field' };
  }

  // Estrutura típica de verify/ping: { shop_id, code } ou { code, data: {...} }
  if ('shop_id' in obj || 'shopId' in obj || 'code' in obj) {
    return { ok: true, reason: 'simple_verify_shape' };
  }
  if ('code' in obj && 'data' in obj) {
    return { ok: true, reason: 'code_data_verify_shape' };
  }

  return { ok: false, reason: 'not_verify_shape' };
}

export class ShopeeWebhookService {
  constructor(private prisma: PrismaClient) {}

  async handleWebhook(input: WebhookHandleInput): Promise<WebhookHandleResult> {
    const rawBody = input.rawBody ? input.rawBody.toString('utf8') : JSON.stringify(input.body ?? {});
    const payload = normalizePayload(input.body);

    const signaturePresent = hasSignatureHeader(input.headers);

    // Verify ping/test do console (sem bypass): responder 200 e não persistir.
    const pingCandidate = isVerifyPingCandidate(payload);
    if (pingCandidate.ok && rawBody.length <= 2048 && !signaturePresent) {
      const ts = extractTimestampSec({
        headers: input.headers,
        payload,
        headerCandidates: ['x-shopee-timestamp', 'x-timestamp', 'timestamp'],
      });
      recordWebhookIgnored('verify_ping');
      logger.info('webhook_verify_ping', {
        reason: pingCandidate.reason,
        ip: input.ip,
        userAgent: input.userAgent,
        rawBodyLength: rawBody.length,
        payloadKeys: getPayloadKeys(payload),
        signaturePresent,
        timestamp_source: ts.source,
        timestampSec: ts.timestampSec,
      });
      return { ok: true, status: 200, reason: 'verify_ping' };
    }

    const verification = verifyWebhookSignature({
      headers: input.headers,
      rawBody,
      path: input.path,
      payload,
    });

    if (!verification.ok) {
      if (isVerifyBypassAllowed({ reason: verification.reason, ip: input.ip })) {
        logger.warn('webhook_verify_bypass', {
          reason: verification.reason,
          ip: input.ip,
          userAgent: input.userAgent,
          timestampSec: verification.timestampSec ?? null,
          timestamp_source: verification.timestampSource ?? null,
          skewSec: verification.skewSec ?? null,
        });
        return { ok: true, status: 200, reason: 'verify_bypass' };
      }
      logger.warn('webhook_invalid', {
        reason: verification.reason,
        signature: verification.signature ? '[present]' : '[missing]',
        ip: input.ip,
        timestampSec: verification.timestampSec ?? null,
        timestamp_source: verification.timestampSource ?? null,
        skewSec: verification.skewSec ?? null,
        payloadKeys: getPayloadKeys(payload),
      });
      return { ok: false, status: 401, error: 'assinatura inválida', reason: verification.reason };
    }
    if (verification.match) {
      logger.info('webhook_signature_match', {
        label: verification.match.label,
        encoding: verification.match.encoding,
        secretFormat: verification.match.secretFormat,
        path: verification.match.path,
      });
    }
    if (verification.reason && verification.reason.includes('allow_unsigned')) {
      logger.warn('webhook_bypassed', {
        reason: verification.reason,
        signature: verification.signature ? '[present]' : '[missing]',
        ip: input.ip,
      });
    }

    const eventType = extractEventType(payload);
    const shopId = extractShopId(payload, input.headers);
    const itemIds = extractItemIds(payload);
    const modelIds = extractModelIds(payload);
    const eventId =
      extractEventId(payload, input.headers) ||
      crypto
        .createHash('sha256')
        .update(`${rawBody}|${verification.timestampSec ?? ''}|${verification.nonce ?? ''}|${eventType}|${shopId ?? ''}`)
        .digest('hex');

    try {
      await this.prisma.shopeeWebhookEvent.create({
        data: {
          eventId,
          eventType,
          shopId: shopId ?? null,
          itemId: itemIds[0] ?? null,
          modelId: modelIds[0] ?? null,
          payload: payload as any,
          status: 'PENDING',
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        logger.info('webhook_duplicate', { eventId, eventType, shopId });
        return { ok: true, status: 200, eventId, duplicate: true };
      }
      logger.error('webhook_persist_failed', {
        eventId,
        eventType,
        error: err?.message || String(err),
      });
      return { ok: false, status: 500, error: 'falha ao persistir evento' };
    }

    recordWebhookReceived(eventType);
    logger.info('webhook_received', {
      eventId,
      eventType,
      shopId,
      itemId: itemIds[0] ?? null,
      modelId: modelIds[0] ?? null,
    });

    return { ok: true, status: 200, eventId };
  }
}
