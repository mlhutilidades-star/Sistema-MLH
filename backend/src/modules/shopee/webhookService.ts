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

function getHeaderValue(headers: HeaderMap, candidates: string[]): string | null {
  for (const name of candidates) {
    const target = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== target) continue;
      if (Array.isArray(value)) {
        const first = value.find((item) => typeof item === 'string' && item.trim());
        if (first) return first.trim();
      } else if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return null;
}

function getClientIp(input: WebhookHandleInput): string | null {
  const forwarded = getHeaderValue(input.headers, ['x-forwarded-for']);
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  if (input.ip && input.ip.trim()) return input.ip.trim();
  return null;
}

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isVerifyBypassAllowed(input: WebhookHandleInput): boolean {
  const enabled = String(process.env.SHOPEE_WEBHOOK_VERIFY_BYPASS_ENABLED || '')
    .trim()
    .toLowerCase() === 'true';
  if (!enabled) return false;
  const allowlist = parseAllowlist(process.env.SHOPEE_WEBHOOK_VERIFY_BYPASS_IP_ALLOWLIST);
  if (allowlist.length === 0) return false;
  const clientIp = getClientIp(input);
  if (!clientIp) return false;
  return allowlist.includes(clientIp);
}

export class ShopeeWebhookService {
  constructor(private prisma: PrismaClient) {}

  async handleWebhook(input: WebhookHandleInput): Promise<WebhookHandleResult> {
    const rawBody = input.rawBody ? input.rawBody.toString('utf8') : JSON.stringify(input.body ?? {});
    const payload = normalizePayload(input.body);
    const verification = verifyWebhookSignature({
      headers: input.headers,
      rawBody,
      path: input.path,
      payload,
    });

    if (!verification.ok) {
      const reason = verification.reason || '';
      if (
        (reason === 'timestamp_missing' || reason === 'signature_missing') &&
        isVerifyBypassAllowed(input)
      ) {
        logger.warn('webhook_verify_bypass', {
          reason,
          ip: getClientIp(input),
        });
        return { ok: true, status: 204, reason: 'verify_bypass' };
      }
      logger.warn('webhook_invalid', {
        reason: verification.reason,
        signature: verification.signature ? '[present]' : '[missing]',
        ip: input.ip,
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
