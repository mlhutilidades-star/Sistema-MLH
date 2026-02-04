import { config } from '../../shared/config';
import { logger } from '../../shared/logger';
import { sleep } from '../../shared/utils';
import { ShopeeClient } from './client';
import type {
  ShopeeAdsBalanceResponse,
  ShopeeAdsReportResponse,
  ShopeeEscrowDetailResponse,
  ShopeeItemDetailResponse,
  ShopeeItemListResponse,
  ShopeeOrderDetailResponse,
  ShopeeOrderListResponse,
} from './types';

type CacheEntry<T> = { value: T; expiresAt: number };

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;

  constructor(private threshold: number, private coolDownMs: number) {}

  isOpen(): boolean {
    return Date.now() < this.openUntil;
  }

  onSuccess(): void {
    this.failures = 0;
  }

  onFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntil = Date.now() + this.coolDownMs;
      this.failures = 0;
      logger.warn('⚠️ Circuit breaker aberto (Shopee)', { coolDownMs: this.coolDownMs });
    }
  }
}

class RateLimiter {
  private last = 0;
  private queue = Promise.resolve();

  constructor(private minIntervalMs: number) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      const now = Date.now();
      const wait = Math.max(0, this.last + this.minIntervalMs - now);
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      return fn();
    };

    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  static perShop: Map<string, RateLimiter> = new Map();

  static forShop(shopId: string, minIntervalMs: number): RateLimiter {
    if (!this.perShop.has(shopId)) {
      this.perShop.set(shopId, new RateLimiter(minIntervalMs));
    }
    return this.perShop.get(shopId)!;
  }
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lowered = msg.toLowerCase();
  if (/(error_not_found|invalid_code|invalid_access_token)/i.test(lowered)) return false;
  if (/http\s*404/i.test(lowered)) return false;
  if (/http\s*429/i.test(lowered)) return true;
  if (/http\s*5\d\d/i.test(lowered)) return true;
  if (/(timeout|timed out|econnreset|econnrefused|eai_again)/i.test(lowered)) return true;
  if (/rate limit|too many/i.test(lowered)) return true;
  return false;
}

const BACKOFF_DELAYS_MS = [0, 100, 1000, 5000];

type ExecOptions = {
  cacheKey?: string;
  ttlMs?: number;
};

export class ResilientShopeeClient {
  private base: ShopeeClient;
  private breaker = new CircuitBreaker(5, 30_000);
  private cache = new MemoryCache();
  private limiter: RateLimiter;
  private metrics = new Map<string, { success: number; fail: number; totalTime: number }>();

  constructor(accessToken?: string, refreshToken?: string) {
    this.base = new ShopeeClient(accessToken, refreshToken);
    const shopId = String(config.shopee.shopId || 'global');
    this.limiter = RateLimiter.forShop(shopId, 333);
  }

  private track(endpoint: string, ok: boolean, ms: number) {
    const metric = this.metrics.get(endpoint) || { success: 0, fail: 0, totalTime: 0 };
    if (ok) metric.success += 1;
    else metric.fail += 1;
    metric.totalTime += ms;
    this.metrics.set(endpoint, metric);

    const total = metric.success + metric.fail;
    if (total >= 20 && total % 20 === 0) {
      const successRate = metric.success / total;
      const avg = metric.totalTime / total;
      if (successRate < 0.9) {
        logger.warn('⚠️ Shopee success rate abaixo do ideal', {
          endpoint,
          successRate,
          avgMs: Math.round(avg),
        });
      } else if (avg > 5000) {
        logger.warn('⚠️ Shopee response time alto', { endpoint, avgMs: Math.round(avg) });
      }
    }
  }

  private async exec<T>(endpoint: string, fn: () => Promise<T>, opts?: ExecOptions): Promise<T> {
    if (opts?.cacheKey) {
      const cached = this.cache.get<T>(opts.cacheKey);
      if (cached) return cached;
    }

    if (this.breaker.isOpen()) {
      throw new Error(`Circuit breaker aberto para Shopee (${endpoint})`);
    }

    const start = Date.now();

    try {
      for (let i = 0; i < BACKOFF_DELAYS_MS.length; i++) {
        if (BACKOFF_DELAYS_MS[i] > 0) {
          await sleep(BACKOFF_DELAYS_MS[i]);
        }

        try {
          const result = await this.limiter.schedule(fn);
          this.breaker.onSuccess();
          this.track(endpoint, true, Date.now() - start);
          if (opts?.cacheKey && opts?.ttlMs) this.cache.set(opts.cacheKey, result, opts.ttlMs);
          return result;
        } catch (err) {
          if (!isRetryableError(err) || i === BACKOFF_DELAYS_MS.length - 1) {
            throw err;
          }
        }
      }

      throw new Error(`Shopee request failed: ${endpoint}`);
    } catch (err) {
      this.breaker.onFailure();
      this.track(endpoint, false, Date.now() - start);
      throw err;
    }
  }

  async getItemList(offset: number = 0, pageSize: number = 50, itemStatus: string = 'NORMAL'): Promise<ShopeeItemListResponse> {
    const key = `itemList:${offset}:${pageSize}:${itemStatus}`;
    return this.exec('getItemList', () => this.base.getItemList(offset, pageSize, itemStatus), { cacheKey: key, ttlMs: 15 * 60_000 });
  }

  async getItemBaseInfo(itemIds: number[]): Promise<ShopeeItemDetailResponse> {
    const key = `itemBaseInfo:${itemIds.map(String).sort().join(',')}`;
    return this.exec('getItemBaseInfo', () => this.base.getItemBaseInfo(itemIds), { cacheKey: key, ttlMs: 15 * 60_000 });
  }

  async getItemDetail(itemId: number): Promise<any> {
    const key = `itemDetail:${itemId}`;
    return this.exec('getItemDetail', () => this.base.getItemDetail(itemId), { cacheKey: key, ttlMs: 5 * 60_000 });
  }

  async getModelList(itemId: number): Promise<any> {
    const key = `modelList:${itemId}`;
    return this.exec('getModelList', () => this.base.getModelList(itemId), { cacheKey: key, ttlMs: 5 * 60_000 });
  }

  async getOrderList(timeFrom: number, timeTo: number, orderStatus: string = 'COMPLETED', pageSize: number = 50, cursor?: string): Promise<ShopeeOrderListResponse> {
    return this.exec('getOrderList', () => this.base.getOrderList(timeFrom, timeTo, orderStatus, pageSize, cursor));
  }

  async getOrderDetail(orderSnList: string[]): Promise<ShopeeOrderDetailResponse> {
    return this.exec('getOrderDetail', () => this.base.getOrderDetail(orderSnList));
  }

  async getEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetailResponse> {
    return this.exec('getEscrowDetail', () => this.base.getEscrowDetail(orderSn));
  }

  async getAdsDailyPerformance(startDate: string, endDate: string): Promise<ShopeeAdsReportResponse> {
    return this.exec('getAdsDailyPerformance', () => this.base.getAdsDailyPerformance(startDate, endDate));
  }

  async getAdsBalance(): Promise<ShopeeAdsBalanceResponse> {
    return this.exec('getAdsBalance', () => this.base.getAdsBalance());
  }

  async getAllItems(): Promise<ShopeeItemListResponse[]> {
    const results: ShopeeItemListResponse[] = [];
    let offset = 0;
    const pageSize = 50;
    let hasNextPage = true;

    while (hasNextPage) {
      const response = await this.getItemList(offset, pageSize);
      results.push(response);
      hasNextPage = response.response.has_next_page;
      offset = response.response.next_offset;
    }

    return results;
  }

  async getAllOrders(timeFrom: number, timeTo: number): Promise<string[]> {
    const orderSnList: string[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getOrderList(timeFrom, timeTo, 'COMPLETED', 50, cursor);
      const orders = response.response.order_list.map((o) => o.order_sn);
      orderSnList.push(...orders);
      hasMore = response.response.more;
      cursor = response.response.next_cursor;
    }

    return orderSnList;
  }
}
