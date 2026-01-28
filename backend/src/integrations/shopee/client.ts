// ==========================================
// SHOPEE OPEN API v2 - CLIENT
// ==========================================

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../shared/config';
import { logger, loggers } from '../../shared/logger';
import { retryWithBackoff, sleep } from '../../shared/utils';
import { buildShopeeUrl } from './auth';
import { refreshAccessToken } from './oauth';
import type {
  ShopeeItemListResponse,
  ShopeeItemDetailResponse,
  ShopeeOrderListResponse,
  ShopeeOrderDetailResponse,
  ShopeeEscrowDetailResponse,
  ShopeeAdsReportResponse,
  ShopeeAdsBalanceResponse,
} from './types';

export class ShopeeClient {
  private client: AxiosInstance;
  private accessToken?: string;
  private refreshToken?: string;
  private refreshing?: Promise<void>;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly minRequestInterval = 3600; // 3.6s entre requests (~1000 req/hour)

  constructor(accessToken?: string, refreshToken?: string) {
    this.accessToken = accessToken ?? process.env.SHOPEE_ACCESS_TOKEN;
    this.refreshToken = refreshToken ?? process.env.SHOPEE_REFRESH_TOKEN;
    
    this.client = axios.create({
      timeout: config.shopee.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const sanitizeUrl = (url: string) => {
      if (!url) return url;
      // Evitar vazar tokens em logs
      return url.replace(/(access_token=)[^&]+/gi, '$1***');
    };

    // Interceptor para rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      const startTime = Date.now();
      (config as any).startTime = startTime;
      
      loggers.api.request(config.method?.toUpperCase() || 'GET', sanitizeUrl(config.url || ''), config.params);
      return config;
    });

    // Interceptor para logging de respostas
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - (response.config as any).startTime;
        loggers.api.response(
          response.config.method?.toUpperCase() || 'GET',
          sanitizeUrl(response.config.url || ''),
          response.status,
          duration
        );
        return response;
      },
      (error: AxiosError) => {
        if (error.config) {
          loggers.api.error(
            error.config.method?.toUpperCase() || 'GET',
            sanitizeUrl(error.config.url || ''),
            error
          );
        }
        return Promise.reject(error);
      }
    );
  }

  private async getWithAuth<T>(path: string, params: Record<string, any>): Promise<T> {
    const doRequest = async () => {
      const url = buildShopeeUrl(path, params, this.accessToken);
      const { data } = await this.client.get<T>(url);
      return this.validateResponse(data as any);
    };

    try {
      return await doRequest();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data: any = error.response?.data;
        const errorText = `${data?.error || ''} ${data?.message || ''}`.toLowerCase();
        const shouldRefresh =
          !!this.refreshToken &&
          (status === 403 || status === 401 || errorText.includes('auth') || errorText.includes('token'));

        if (shouldRefresh) {
          await this.ensureRefreshed();
          return await doRequest();
        }
      }
      throw error;
    }
  }

  private async ensureRefreshed(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (!this.refreshToken) throw new Error('SHOPEE_REFRESH_TOKEN não configurado');
    if (!config.shopee.shopId || config.shopee.shopId <= 0) throw new Error('SHOPEE_SHOP_ID não configurado');

    this.refreshing = (async () => {
      const tokens = await refreshAccessToken({
        refreshToken: this.refreshToken as string,
        shopId: config.shopee.shopId,
      });
      this.accessToken = tokens.access_token;
      this.refreshToken = tokens.refresh_token || this.refreshToken;
    })().finally(() => {
      this.refreshing = undefined;
    });

    return this.refreshing;
  }

  /**
   * Força refresh de tokens usando refresh_token.
   * Retorna os novos tokens (access/refresh) e também atualiza o estado interno do client.
   */
  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string }> {
    if (!this.refreshToken) throw new Error('SHOPEE_REFRESH_TOKEN não configurado');
    const shopId = config.shopee.shopId;
    if (!shopId || shopId <= 0) throw new Error('SHOPEE_SHOP_ID não configurado');

    const tokens = await refreshAccessToken({ refreshToken: this.refreshToken, shopId });
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token || this.refreshToken;
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  /**
   * Enforçar rate limiting (1000 req/hour)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Tratar erros da API Shopee
   */
  private handleShopeeError(error: any, response?: any): never {
    if (response?.error && response.error !== '') {
      throw new Error(`Shopee API Error: ${response.error} - ${response.message}`);
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data: any = error.response?.data;
      if (data?.error || data?.message) {
        throw new Error(`Shopee API Error: HTTP ${status}: ${data.error || ''} ${data.message || ''}`.trim());
      }
      throw new Error(`Shopee API Error: HTTP ${status}: ${error.message}`);
    }
    
    throw error;
  }

  /**
   * Validar resposta Shopee
   */
  private validateResponse<T>(response: T & { error: string; message: string }): T {
    if (response.error && response.error !== '') {
      throw new Error(`Shopee API Error: ${response.error} - ${response.message}`);
    }
    return response;
  }

  /**
   * Buscar lista de produtos
   */
  async getItemList(offset: number = 0, pageSize: number = 50): Promise<ShopeeItemListResponse> {
    try {
      const path = '/product/get_item_list';
      const url = buildShopeeUrl(
        path,
        {
          offset,
          page_size: pageSize,
          item_status: 'NORMAL',
        },
        this.accessToken
      );

      const response = await retryWithBackoff(
        async () => {
          const { data } = await this.client.get<ShopeeItemListResponse>(url);
          return this.validateResponse(data);
        },
        config.shopee.maxRetries
      );

      return response;
    } catch (error) {
      this.handleShopeeError(error);
    }
  }

  // Aliases compatíveis com scripts de teste
  async getItems(input: { offset?: number; page_size?: number }) {
    const res = await this.getItemList(input.offset ?? 0, input.page_size ?? 50);
    return {
      items: res.response?.item ?? [],
      total_count: res.response?.total_count ?? 0,
      has_next_page: res.response?.has_next_page ?? false,
      next_offset: res.response?.next_offset ?? 0,
    };
  }

  /**
   * Buscar detalhes de produtos
   */
  async getItemBaseInfo(itemIds: number[]): Promise<ShopeeItemDetailResponse> {
    try {
      const path = '/product/get_item_base_info';
      // Observado em runtime: endpoint aceita GET; POST retorna 404.
      const url = buildShopeeUrl(
        path,
        {
          item_id_list: itemIds.map(String).join(','),
        },
        this.accessToken
      );

      const response = await retryWithBackoff(
        async () => {
          const { data } = await this.client.get<ShopeeItemDetailResponse>(url);
          return this.validateResponse(data);
        },
        config.shopee.maxRetries
      );

      return response;
    } catch (error) {
      this.handleShopeeError(error);
    }
  }

  /**
   * Buscar lista de pedidos
   */
  async getOrderList(
    timeFrom: number,
    timeTo: number,
    orderStatus: string = 'COMPLETED',
    pageSize: number = 50,
    cursor?: string
  ): Promise<ShopeeOrderListResponse> {
    try {
      const path = '/order/get_order_list';
      const params: any = {
        time_range_field: 'create_time',
        time_from: timeFrom,
        time_to: timeTo,
        page_size: pageSize,
        order_status: orderStatus,
      };

      if (cursor) {
        params.cursor = cursor;
      }

      const response = await retryWithBackoff(
        async () => {
          return this.getWithAuth<ShopeeOrderListResponse>(path, params);
        },
        config.shopee.maxRetries
      );

      return response;
    } catch (error) {
      this.handleShopeeError(error);
    }
  }

  async getOrders(input: { time_from: number; time_to: number; page_size?: number; order_status?: string; cursor?: string }) {
    const res = await this.getOrderList(
      input.time_from,
      input.time_to,
      input.order_status ?? 'COMPLETED',
      input.page_size ?? 50,
      input.cursor
    );
    return {
      orders: res.response?.order_list ?? [],
      more: res.response?.more ?? false,
      next_cursor: res.response?.next_cursor,
    };
  }

  /**
   * Buscar detalhes de pedidos
   */
  async getOrderDetail(orderSnList: string[]): Promise<ShopeeOrderDetailResponse> {
    try {
      const path = '/order/get_order_detail';
      const params = {
        order_sn_list: orderSnList.join(','),
        response_optional_fields: [
          'buyer_user_id',
          'buyer_username',
          'estimated_shipping_fee',
          'actual_shipping_fee',
          'payment_method',
          'total_amount',
          'escrow_amount',
          'item_list',
        ].join(','),
      };

      const response = await retryWithBackoff(
        async () => {
          return this.getWithAuth<ShopeeOrderDetailResponse>(path, params);
        },
        config.shopee.maxRetries
      );

      return response;
    } catch (error) {
      this.handleShopeeError(error);
    }
  }

  /**
   * Buscar detalhamento de repasse (escrow) de um pedido.
   * Observação: a disponibilidade/shape depende do país/conta Shopee.
   */
  async getEscrowDetail(orderSn: string): Promise<ShopeeEscrowDetailResponse> {
    try {
      const path = '/payment/get_escrow_detail';

      // Tentativa 1: parâmetro mais comum
      const attempt = async (params: Record<string, any>) => {
        return this.getWithAuth<ShopeeEscrowDetailResponse>(path, params);
      };

      try {
        return await retryWithBackoff(async () => attempt({ order_sn: orderSn }), config.shopee.maxRetries);
      } catch (_e) {
        // Tentativa 2: alguns ambientes usam lista
        return await retryWithBackoff(async () => attempt({ order_sn_list: orderSn }), config.shopee.maxRetries);
      }
    } catch (error) {
      this.handleShopeeError(error);
    }
  }

  /**
   * Buscar relatório de ads diário
   */
  async getAdsDailyPerformance(
    startDate: string,
    endDate: string
  ): Promise<ShopeeAdsReportResponse> {
    try {
      const path = '/ads/report/get_all_cpc_ads_daily_performance';
      const url = buildShopeeUrl(
        path,
        {
          start_date: startDate,
          end_date: endDate,
        },
        this.accessToken
      );

      const response = await retryWithBackoff(
        async () => {
          const { data } = await this.client.get<ShopeeAdsReportResponse>(url);
          return this.validateResponse(data);
        },
        config.shopee.maxRetries
      );

      return response;
    } catch (error) {
      this.handleShopeeError(error);
    }
  }

  async getAdsReport(input: { date_from: string; date_to: string }) {
    const res = await this.getAdsDailyPerformance(input.date_from, input.date_to);
    return {
      data: res.response?.data ?? [],
      total_count: res.response?.total_count ?? 0,
    };
  }

  /**
   * Buscar saldo da carteira de ads
   */
  async getAdsBalance(): Promise<ShopeeAdsBalanceResponse> {
    try {
      const path = '/ads/get_total_balance';
      const url = buildShopeeUrl(path, {}, this.accessToken);

      const response = await retryWithBackoff(
        async () => {
          const { data } = await this.client.get<ShopeeAdsBalanceResponse>(url);
          return this.validateResponse(data);
        },
        config.shopee.maxRetries
      );

      return response;
    } catch (error) {
      this.handleShopeeError(error);
    }
  }

  /**
   * Buscar todos os produtos (todas as páginas)
   */
  async getAllItems(): Promise<ShopeeItemListResponse[]> {
    const results: ShopeeItemListResponse[] = [];
    let offset = 0;
    const pageSize = 50;
    let hasNextPage = true;

    logger.info('Iniciando busca de todos os produtos do Shopee');

    while (hasNextPage) {
      const response = await this.getItemList(offset, pageSize);
      results.push(response);

      hasNextPage = response.response.has_next_page;
      offset = response.response.next_offset;

      logger.debug(`Offset ${offset}, total: ${response.response.total_count}`);
    }

    logger.info(`Total de ${results.length} páginas de produtos buscadas`);
    return results;
  }

  /**
   * Buscar todos os pedidos de um período
   */
  async getAllOrders(timeFrom: number, timeTo: number): Promise<string[]> {
    const orderSnList: string[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    logger.info('Iniciando busca de todos os pedidos do Shopee');

    while (hasMore) {
      const response = await this.getOrderList(timeFrom, timeTo, 'COMPLETED', 50, cursor);
      
      const orders = response.response.order_list.map((o) => o.order_sn);
      orderSnList.push(...orders);

      hasMore = response.response.more;
      cursor = response.response.next_cursor;

      logger.debug(`Pedidos buscados: ${orderSnList.length}`);
    }

    logger.info(`Total de ${orderSnList.length} pedidos buscados`);
    return orderSnList;
  }
}
