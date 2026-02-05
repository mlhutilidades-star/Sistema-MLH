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
      logger.warn('webhook_invalid', {
        reason: verification.reason,
        signature: verification.signature ? '[present]' : '[missing]',
        ip: input.ip,
      });
      return { ok: false, status: 401, error: 'assinatura inválida', reason: verification.reason };
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
