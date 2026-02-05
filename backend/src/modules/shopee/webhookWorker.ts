import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../shared/database';
import { logger } from '../../shared/logger';
import { ResilientShopeeClient } from '../../integrations/shopee/resilientClient';
import { resolveShopeeTokens } from './tokenStore';
import { extractItemIds, extractModelIds, extractEventType, isDeleteLikeEvent, normalizePayload } from './webhookUtils';
import { recordWebhookFailed, recordWebhookIgnored, recordWebhookProcessed, snapshotWebhookMetrics } from './webhookMetrics';

type WorkerOptions = {
  intervalMs: number;
  batchSize: number;
  maxAttempts: number;
  failBackoffMs: number;
  fetchModels: boolean;
  processingTimeoutMs: number;
};

function parseNumberEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : fallback;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'true' || raw === '1' || raw === 'yes') return true;
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return fallback;
}

function getWorkerOptions(): WorkerOptions {
  return {
    intervalMs: parseNumberEnv('SHOPEE_WEBHOOK_WORKER_INTERVAL_MS', 5000),
    batchSize: parseNumberEnv('SHOPEE_WEBHOOK_WORKER_BATCH_SIZE', 10),
    maxAttempts: parseNumberEnv('SHOPEE_WEBHOOK_WORKER_MAX_ATTEMPTS', 5),
    failBackoffMs: parseNumberEnv('SHOPEE_WEBHOOK_WORKER_FAIL_BACKOFF_MS', 30000),
    fetchModels: parseBoolEnv('SHOPEE_WEBHOOK_FETCH_MODELS', true),
    processingTimeoutMs: parseNumberEnv('SHOPEE_WEBHOOK_PROCESSING_TIMEOUT_MS', 600000),
  };
}

function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /error_not_found/i.test(msg) || /http\s*404/i.test(msg);
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/http\s*429/i.test(msg)) return true;
  if (/http\s*5\d\d/i.test(msg)) return true;
  if (/(timeout|timed out|econnreset|econnrefused|eai_again)/i.test(msg)) return true;
  return false;
}

function normalizePrice(raw: unknown): number | null {
  const n = Number(raw ?? NaN);
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return n;
  if (n >= 1_000_000) return n / 100_000;
  return n / 100;
}

function normalizeStock(raw: unknown): number | null {
  const n = Number(raw ?? NaN);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function normalizeStatus(raw: unknown): string {
  const status = String(raw ?? '').trim().toUpperCase();
  if (status === 'NORMAL') return 'ATIVO';
  if (status === 'UNLIST' || status === 'DELETED' || status === 'BANNED') return 'INATIVO';
  return status || 'INATIVO';
}

function resolveImageUrl(item: any): string | null {
  const imageUrl =
    (Array.isArray(item?.image_url_list) && typeof item.image_url_list[0] === 'string' && item.image_url_list[0]) ||
    (Array.isArray(item?.image_info?.image_url_list) && typeof item.image_info.image_url_list[0] === 'string' && item.image_info.image_url_list[0]) ||
    null;

  if (imageUrl && String(imageUrl).startsWith('http')) return String(imageUrl);

  const imageId =
    (Array.isArray(item?.image) && item.image.length > 0 ? String(item.image[0]) : null) ||
    (typeof item?.image === 'string' && item.image.trim() ? String(item.image).trim() : null) ||
    (Array.isArray(item?.image?.image_id_list) && item.image.image_id_list.length > 0 ? String(item.image.image_id_list[0]) : null) ||
    null;

  return imageId ? `https://down-br.img.susercontent.com/file/${imageId}` : null;
}

function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(String(Math.floor(value)));
    if (typeof value === 'string' && value.trim()) return BigInt(value.trim());
  } catch {
    return null;
  }
  return null;
}

async function markItemInactive(prisma: PrismaClient, shopId: number, itemId: bigint, reason: string): Promise<void> {
  const result = await prisma.anuncioCatalogo.updateMany({
    where: {
      platform: 'SHOPEE',
      shopId,
      itemId,
    },
    data: {
      status: 'INATIVO',
    },
  });

  if (result.count > 0) {
    logger.warn('Item marcado como INATIVO via webhook', { itemId: String(itemId), reason });
  } else {
    logger.warn('Item 404 sem registro para marcar', { itemId: String(itemId), reason });
  }
}

async function syncVariacoes(
  prisma: PrismaClient,
  anuncioId: string,
  models: any[]
): Promise<void> {
  const seenModelIds: bigint[] = [];

  for (const model of models) {
    const rawModelId = (model as any).model_id ?? (model as any).modelid ?? (model as any).id;
    const modelId = toBigInt(rawModelId);
    if (!modelId) continue;

    const modelSku = String((model as any).model_sku ?? (model as any).sku ?? '').trim() || null;
    const modelName = String((model as any).model_name ?? (model as any).name ?? '').trim() || null;

    const modelPrice = normalizePrice(
      (model as any).price_info?.[0]?.current_price ?? (model as any).price ?? (model as any).current_price
    );
    const modelStock = normalizeStock(
      (model as any).stock_info?.[0]?.current_stock ?? (model as any).stock ?? (model as any).current_stock
    );

    await prisma.anuncioVariacao.upsert({
      where: {
        anuncioId_modelId: {
          anuncioId,
          modelId,
        },
      },
      create: {
        anuncioId,
        modelId,
        sku: modelSku,
        nome: modelName,
        preco: modelPrice,
        estoque: modelStock,
      },
      update: {
        sku: modelSku,
        nome: modelName,
        preco: modelPrice,
        estoque: modelStock,
      },
    });

    seenModelIds.push(modelId);
  }

  if (seenModelIds.length) {
    await prisma.anuncioVariacao.deleteMany({
      where: {
        anuncioId,
        modelId: { notIn: seenModelIds },
      },
    });
  }
}

async function syncItemById(
  prisma: PrismaClient,
  client: ResilientShopeeClient,
  shopId: number,
  itemIdRaw: string,
  fetchModels: boolean
): Promise<'ok' | 'not_found'> {
  const itemIdNum = Number(itemIdRaw);
  if (!Number.isFinite(itemIdNum)) return 'not_found';

  try {
    const detail: any = await client.getItemDetail(itemIdNum);
    const item = detail?.response?.item_list?.[0];
    if (!item) return 'not_found';

    const itemId = toBigInt(item.item_id);
    if (!itemId) return 'not_found';

    const sku = String(item.item_sku || '').trim() || null;
    const nome = String(item.item_name || '').trim() || sku || String(item.item_id);
    const statusFinal = normalizeStatus(item.item_status);

    const preco = normalizePrice(item.price_info?.[0]?.current_price);
    const estoque = normalizeStock(item.stock_info?.[0]?.current_stock);
    const imageUrl = resolveImageUrl(item);

    const parent = await prisma.anuncioCatalogo.upsert({
      where: {
        platform_shopId_itemId: {
          platform: 'SHOPEE',
          shopId,
          itemId,
        },
      },
      create: {
        platform: 'SHOPEE',
        shopId,
        itemId,
        modelId: null,
        sku,
        nome,
        imageUrl,
        status: statusFinal,
        preco,
        estoque,
      },
      update: {
        sku,
        nome,
        imageUrl,
        status: statusFinal,
        preco,
        estoque,
      },
    });

    if (fetchModels) {
      try {
        const modelRes: any = await client.getModelList(itemIdNum);
        const models: any[] =
          (Array.isArray(modelRes?.response?.model) && modelRes.response.model) ||
          (Array.isArray(modelRes?.response?.model_list) && modelRes.response.model_list) ||
          (Array.isArray(modelRes?.response?.model_list?.[0]?.model) && modelRes.response.model_list[0].model) ||
          [];

        if (models.length) {
          await syncVariacoes(prisma, parent.id, models);
        }
      } catch (err) {
        if (isNotFoundError(err)) {
          await markItemInactive(prisma, shopId, itemId, 'get_model_list');
          return 'not_found';
        }
        throw err;
      }
    }

    return 'ok';
  } catch (err) {
    if (isNotFoundError(err)) {
      const itemId = toBigInt(itemIdRaw);
      if (itemId) {
        await markItemInactive(prisma, shopId, itemId, 'get_item_detail');
      }
      return 'not_found';
    }
    throw err;
  }
}

async function processEvent(
  prisma: PrismaClient,
  client: ResilientShopeeClient,
  event: any,
  shopId: number,
  options: WorkerOptions
): Promise<{ status: 'PROCESSED' | 'FAILED' | 'IGNORED'; reason?: string }> {
  const payload = normalizePayload(event.payload);
  const eventType = extractEventType(payload);
  const itemIds = extractItemIds(payload);
  const modelIds = extractModelIds(payload);

  if (!itemIds.length && !modelIds.length) {
    return { status: 'IGNORED', reason: 'no_item_id' };
  }

  if (isDeleteLikeEvent(eventType, payload)) {
    let marked = 0;
    for (const itemId of itemIds) {
      const idBig = toBigInt(itemId);
      if (!idBig) continue;
      await markItemInactive(prisma, shopId, idBig, 'delete_event');
      marked++;
    }
    return { status: 'PROCESSED', reason: `delete_event:${marked}` };
  }

  let okCount = 0;
  let notFoundCount = 0;
  for (const itemId of itemIds) {
    const result = await syncItemById(prisma, client, shopId, itemId, options.fetchModels);
    if (result === 'ok') okCount++;
    else notFoundCount++;
  }

  if (okCount === 0 && notFoundCount > 0) {
    return { status: 'IGNORED', reason: 'not_found' };
  }

  return { status: 'PROCESSED', reason: notFoundCount > 0 ? 'partial_not_found' : undefined };
}

export function startShopeeWebhookWorker(prisma?: PrismaClient): void {
  const options = getWorkerOptions();
  const db = prisma ?? getPrismaClient();
  let running = false;

  logger.info('Shopee webhook worker iniciado', {
    intervalMs: options.intervalMs,
    batchSize: options.batchSize,
    maxAttempts: options.maxAttempts,
    failBackoffMs: options.failBackoffMs,
  });

  const tick = async () => {
    if (running) return;
    running = true;

    try {
      const processingCutoff = new Date(Date.now() - options.processingTimeoutMs);
      await db.shopeeWebhookEvent.updateMany({
        where: { status: 'PROCESSING', updatedAt: { lte: processingCutoff } },
        data: { status: 'FAILED', lastError: 'stale_processing' },
      });

      const cutoff = new Date(Date.now() - options.failBackoffMs);
      const events = await db.shopeeWebhookEvent.findMany({
        where: {
          attempts: { lt: options.maxAttempts },
          OR: [
            { status: 'PENDING' },
            { status: 'FAILED', updatedAt: { lte: cutoff } },
          ],
        },
        orderBy: { receivedAt: 'asc' },
        take: options.batchSize,
      });

      if (!events.length) return;

      const resolved = await resolveShopeeTokens(db);
      if (!resolved.accessToken) {
        for (const ev of events) {
          await db.shopeeWebhookEvent.update({
            where: { id: ev.id },
            data: {
              status: 'FAILED',
              lastError: 'Token Shopee ausente (DB/env)',
              processedAt: new Date(),
            },
          });
          recordWebhookFailed(ev.eventType);
        }
        return;
      }

      const shopId = resolved.shopId;
      if (!shopId || !Number.isFinite(shopId)) {
        for (const ev of events) {
          await db.shopeeWebhookEvent.update({
            where: { id: ev.id },
            data: {
              status: 'FAILED',
              lastError: 'shopId Shopee ausente',
              processedAt: new Date(),
            },
          });
          recordWebhookFailed(ev.eventType);
        }
        return;
      }

      const client = new ResilientShopeeClient(resolved.accessToken, resolved.refreshToken);

      for (const ev of events) {
        const claimed = await db.shopeeWebhookEvent.updateMany({
          where: {
            id: ev.id,
            status: { in: ['PENDING', 'FAILED'] },
          },
          data: {
            status: 'PROCESSING',
            attempts: { increment: 1 },
          },
        });
        if (claimed.count === 0) continue;

        const startedAt = Date.now();
        const queueLatencyMs = Date.now() - new Date(ev.receivedAt).getTime();

        try {
          const result = await processEvent(db, client, ev, shopId, options);
          const processLatencyMs = Date.now() - startedAt;

          if (result.status === 'PROCESSED') {
            await db.shopeeWebhookEvent.update({
              where: { id: ev.id },
              data: {
                status: 'PROCESSED',
                processedAt: new Date(),
                lastError: result.reason ?? null,
              },
            });
            recordWebhookProcessed(ev.eventType, processLatencyMs, queueLatencyMs);
            logger.info('webhook_processed', {
              eventId: ev.eventId,
              eventType: ev.eventType,
              processLatencyMs,
              queueLatencyMs,
            });
          } else {
            await db.shopeeWebhookEvent.update({
              where: { id: ev.id },
              data: {
                status: 'IGNORED',
                processedAt: new Date(),
                lastError: result.reason ?? 'ignored',
              },
            });
            recordWebhookIgnored(ev.eventType);
            logger.warn('webhook_ignored', {
              eventId: ev.eventId,
              eventType: ev.eventType,
              reason: result.reason,
            });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);

          if (!isRetryableError(err) && isNotFoundError(err)) {
            await db.shopeeWebhookEvent.update({
              where: { id: ev.id },
              data: {
                status: 'IGNORED',
                processedAt: new Date(),
                lastError: errMsg,
              },
            });
            recordWebhookIgnored(ev.eventType);
            logger.warn('webhook_ignored', { eventId: ev.eventId, eventType: ev.eventType, reason: errMsg });
          } else {
            await db.shopeeWebhookEvent.update({
              where: { id: ev.id },
              data: {
                status: 'FAILED',
                processedAt: new Date(),
                lastError: errMsg,
              },
            });
            recordWebhookFailed(ev.eventType);
            logger.warn('webhook_failed', { eventId: ev.eventId, eventType: ev.eventType, error: errMsg });
          }
        }
      }
    } finally {
      running = false;
    }
  };

  const metricsTimer = setInterval(async () => {
    try {
      const queueDepth = await db.shopeeWebhookEvent.count({
        where: { status: { in: ['PENDING', 'FAILED'] } },
      });
      logger.info('webhook_metrics', snapshotWebhookMetrics(queueDepth));
    } catch (err) {
      logger.warn('webhook_metrics_failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }, Math.max(30000, options.intervalMs * 6));

  setInterval(tick, options.intervalMs);
  void tick();

  process.on('exit', () => {
    clearInterval(metricsTimer);
  });
}
