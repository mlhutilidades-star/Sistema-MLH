// ==========================================
// SHOPEE OPEN API v2 - CLIENT
// ==========================================

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../shared/config';
import { logger, loggers } from '../../shared/logger';
import { retryWithBackoff, sleep } from '../../shared/utils';
import { buildShopeeUrl } from './auth';
import type {
  ShopeeItemListResponse,
  ShopeeItemDetailResponse,
  ShopeeOrderListResponse,
  ShopeeOrderDetailResponse,
  ShopeeAdsReportResponse,
  ShopeeAdsBalanceResponse,
} from './types';

export class ShopeeClient {
  private client: AxiosInstance;
  private accessToken?: string;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly minRequestInterval = 3600; // 3.6s entre requests (~1000 req/hour)

  constructor(accessToken?: string) {
    this.accessToken = accessToken;
    
    this.client = axios.create({
      timeout: config.shopee.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor para rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      const startTime = Date.now();
      (config as any).startTime = startTime;
      
      loggers.api.request(config.method?.toUpperCase() || 'GET', config.url || '', config.params);
      return config;
    });

    // Interceptor para logging de respostas
    this.client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - (response.config as any).startTime;
        loggers.api.response(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          duration
        );
        return response;
      },
      (error: AxiosError) => {
        if (error.config) {
          loggers.api.error(
            error.config.method?.toUpperCase() || 'GET',
            error.config.url || '',
            error
          );
        }
        return Promise.reject(error);
      }
    );
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
      throw new Error(`Shopee API Error: ${error.message}`);
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

  /**
   * Buscar detalhes de produtos
   */
  async getItemBaseInfo(itemIds: number[]): Promise<ShopeeItemDetailResponse> {
    try {
      const path = '/product/get_item_base_info';
      const url = buildShopeeUrl(path, {}, this.accessToken);

      const response = await retryWithBackoff(
        async () => {
          const { data } = await this.client.post<ShopeeItemDetailResponse>(url, {
            item_id_list: itemIds,
          });
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

      const url = buildShopeeUrl(path, params, this.accessToken);

      const response = await retryWithBackoff(
        async () => {
          const { data } = await this.client.get<ShopeeOrderListResponse>(url);
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
   * Buscar detalhes de pedidos
   */
  async getOrderDetail(orderSnList: string[]): Promise<ShopeeOrderDetailResponse> {
    try {
      const path = '/order/get_order_detail';
      const url = buildShopeeUrl(path, {}, this.accessToken);

      const response = await retryWithBackoff(
        async () => {
          const { data } = await this.client.post<ShopeeOrderDetailResponse>(url, {
            order_sn_list: orderSnList,
            response_optional_fields: [
              'buyer_user_id',
              'buyer_username',
              'estimated_shipping_fee',
              'actual_shipping_fee',
              'payment_method',
              'total_amount',
              'item_list',
            ],
          });
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
