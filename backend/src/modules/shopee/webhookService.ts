import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../shared/logger';
import { verifyWebhookSignature } from './webhookSignature';
import {
  extractEventId,
  extractEventType,
  extractItemIds,
  extractModelIds,
  extractShopId,
  normalizePayload,
} from './webhookUtils';
import { recordWebhookReceived } from './webhookMetrics';

/**
 * Detect Shopee verify/test pings that should return 200 without full validation.
 * Shopee verify pushes have minimal payloads like {shop_id, code} or {"test":true}
 * and lack event-specific fields (event_type, data, message_id, etc.).
 */
function isVerifyPing(payload: unknown): { isPing: boolean; reason?: string } {
  if (!payload || typeof payload !== 'object') return { isPing: false };
  const obj = payload as Record<string, unknown>;
  const keys = Object.keys(obj);

  // Shopee verify ping: {shop_id, code} or similar minimal structures
  const eventIndicators = [
    'event_type', 'eventType', 'type', 'event', 'topic', 'message_type',
    'data', 'message_id', 'msg_id', 'item_id', 'order_sn',
  ];
  const hasEventData = eventIndicators.some((k) => k in obj && obj[k] !== undefined && obj[k] !== null);

  if (!hasEventData && keys.length <= 5) {
    return { isPing: true, reason: `no_event_fields:keys=[${keys.join(',')}]` };
  }

  // Also detect explicit test payloads
  if ('test' in obj && keys.length <= 3) {
    return { isPing: true, reason: 'test_payload' };
  }

  return { isPing: false };
}

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

export class ShopeeWebhookService {
  constructor(private prisma: PrismaClient) {}

  async handleWebhook(input: WebhookHandleInput): Promise<WebhookHandleResult> {
    const rawBody = input.rawBody ? input.rawBody.toString('utf8') : JSON.stringify(input.body ?? {});
    const payload = normalizePayload(input.body);

    // --- Verify Ping Detection (BEFORE signature validation) ---
    const pingCheck = isVerifyPing(payload);
    if (pingCheck.isPing) {
      logger.info('webhook_verify_ping', {
        ip: input.ip,
        userAgent: input.userAgent,
        reason: pingCheck.reason,
        bodySize: rawBody.length,
      });
      return { ok: true, status: 200, reason: 'verify_ping' };
    }

    // --- Full signature validation for real events ---
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
        });
        return { ok: true, status: 200, reason: 'verify_bypass' };
      }
      logger.warn('webhook_invalid', {
        reason: verification.reason,
        signature: verification.signature ? '[present]' : '[missing]',
        ip: input.ip,
        timestampSec: verification.timestampSec ?? null,
        nowSec: Math.floor(Date.now() / 1000),
        skewSec: verification.timestampSec
          ? Math.abs(Math.floor(Date.now() / 1000) - verification.timestampSec)
          : null,
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
