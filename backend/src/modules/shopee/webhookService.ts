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

function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice('::ffff:'.length);
  return trimmed;
}

function extractForwardedIp(headers: HeaderMap): string | null {
  const forwarded = getHeaderValue(headers, ['x-forwarded-for', 'x-real-ip']);
  if (!forwarded) return null;
  const first = forwarded.split(',')[0]?.trim();
  return normalizeIp(first);
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
      const bypassEnabled = String(process.env.SHOPEE_WEBHOOK_VERIFY_BYPASS_ENABLED || '').trim().toLowerCase() === 'true';
      const allowlist = parseAllowlist(process.env.SHOPEE_WEBHOOK_VERIFY_BYPASS_IP_ALLOWLIST);
      const forwardedIp = extractForwardedIp(input.headers);
      const requestIp = normalizeIp(input.ip || '') || forwardedIp;
      const reason = verification.reason || '';
      const isMissing = reason === 'timestamp_missing' || reason === 'signature_missing';
      const allowlisted = !!requestIp && allowlist.some((ip) => ip === requestIp);

      if (bypassEnabled && isMissing && allowlisted) {
        logger.warn('webhook_verify_bypass', {
          reason,
          ip: requestIp,
          forwardedIp,
          userAgent: input.userAgent,
        });
        return { ok: true, status: 204, reason: 'verify_bypass' };
      }

      logger.warn('webhook_invalid', {
        reason: verification.reason,
        signature: verification.signature ? '[present]' : '[missing]',
        ip: requestIp || input.ip,
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
