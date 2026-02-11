/**
 * ShopeeClientImpl.ts
 *
 * Stub de implementação do ShopeeClient.
 * Lê o contrato para validar campos; métodos HTTP ainda não implementados (TODO).
 *
 * Regra: se um campo não está mapeado no contrato, lança erro
 *        "campo não mapeado no contrato".
 */

import {
  ShopeeClient,
  ListOrdersParams,
  GetOrderDetailParams,
  GetEscrowDetailParams,
  ShopeeOrderListResponse,
  ShopeeOrderDetail,
  ShopeeEscrowDetail,
  ShopeeTokenPair,
} from './ShopeeClient';

import { getEndpoint, isFieldMapped, getUnconfirmedFields } from './contract';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ShopeeClientConfig {
  partnerId: number;
  partnerKey: string;
  shopId: number;
  accessToken: string;
  refreshToken: string;
  apiHost?: string;       // default: partner.shopeemobile.com
  apiVersion?: string;    // default: v2
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function assertFieldMapped(endpointName: string, fieldName: string): void {
  if (!isFieldMapped(endpointName, fieldName)) {
    throw new Error(
      `Campo "${fieldName}" não mapeado no contrato para endpoint "${endpointName}". ` +
        `Adicione-o em contracts/shopee.endpoints.yaml antes de usá-lo.`
    );
  }
}

function warnUnconfirmedFields(endpointName: string): void {
  const unconfirmed = getUnconfirmedFields(endpointName);
  if (unconfirmed.length > 0) {
    console.warn(
      `[ShopeeClient] ⚠️ Endpoint "${endpointName}" tem ${unconfirmed.length} campo(s) não confirmados: ` +
        unconfirmed.map((f) => f.name).join(', ')
    );
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class ShopeeClientImpl implements ShopeeClient {
  private config: ShopeeClientConfig;

  constructor(config: ShopeeClientConfig) {
    this.config = config;
  }

  private get host(): string {
    return this.config.apiHost ?? 'partner.shopeemobile.com';
  }

  private get version(): string {
    return this.config.apiVersion ?? 'v2';
  }

  /**
   * Monta a URL base: https://{host}/api/{version}
   */
  private baseUrl(): string {
    return `https://${this.host}/api/${this.version}`;
  }

  /**
   * TODO: Implementar cálculo do HMAC-SHA256.
   * Fórmula: partner_id + api_path + timestamp + access_token + shop_id
   */
  private computeSign(_apiPath: string, _timestamp: number): string {
    // TODO: implementar HMAC-SHA256 real
    throw new Error(
      'TODO: implementar computeSign() — ver docs/shopee/02_AUTENTICACAO_E_ASSINATURA.md'
    );
  }

  /**
   * TODO: Implementar HTTP GET genérico com common params + sign.
   */
  private async httpGet<T>(
    _path: string,
    _params: Record<string, unknown>
  ): Promise<T> {
    // TODO: implementar chamada HTTP real (fetch/axios)
    // 1. Adicionar common_params (partner_id, timestamp, access_token, shop_id, sign)
    // 2. Calcular sign com computeSign()
    // 3. Montar URL: baseUrl() + path + querystring
    // 4. Retry com backoff exponencial (ver docs/shopee/06_LIMITES_E_ERROS.md)
    throw new Error(
      'TODO: implementar httpGet() — ver docs/shopee/06_LIMITES_E_ERROS.md para retry'
    );
  }

  /**
   * TODO: Implementar HTTP POST genérico com common params + sign.
   */
  private async httpPost<T>(
    _path: string,
    _body: Record<string, unknown>
  ): Promise<T> {
    // TODO: implementar chamada HTTP real (fetch/axios)
    throw new Error(
      'TODO: implementar httpPost() — ver docs/shopee/06_LIMITES_E_ERROS.md para retry'
    );
  }

  // ─── Public Methods ─────────────────────────────────────────────────────────

  async listOrders(
    params: ListOrdersParams
  ): Promise<ShopeeOrderListResponse> {
    const ep = getEndpoint('listOrders');
    warnUnconfirmedFields('listOrders');

    // Validar campos de resposta contra o contrato
    assertFieldMapped('listOrders', 'order_sn');
    assertFieldMapped('listOrders', 'order_status');
    assertFieldMapped('listOrders', 'more');

    // TODO: substituir pelo httpGet real
    const _queryParams: Record<string, unknown> = {
      time_range_field: params.time_range_field,
      time_from: params.time_from,
      time_to: params.time_to,
      page_size: params.page_size,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.order_status ? { order_status: params.order_status } : {}),
    };

    const raw = await this.httpGet<any>(ep.path, _queryParams);

    return {
      orders: (raw.response?.order_list ?? []).map((o: any) => ({
        order_sn: o.order_sn,
        order_status: o.order_status,
        create_time: o.create_time,
        update_time: o.update_time,
      })),
      more: raw.response?.more ?? false,
      next_cursor: raw.response?.next_cursor ?? null,
    };
  }

  async getOrderDetail(
    params: GetOrderDetailParams
  ): Promise<ShopeeOrderDetail[]> {
    const ep = getEndpoint('getOrderDetail');
    warnUnconfirmedFields('getOrderDetail');

    // Validar campo-chave
    assertFieldMapped('getOrderDetail', 'order_sn');
    assertFieldMapped('getOrderDetail', 'total_amount');
    assertFieldMapped('getOrderDetail', 'item_id');

    const raw = await this.httpGet<any>(ep.path, {
      order_sn_list: params.order_sn_list.join(','),
      response_optional_fields:
        'buyer_user_id,item_list,pay_time,total_amount',
    });

    return (raw.response?.order_list ?? []).map((o: any) => ({
      order_sn: o.order_sn,
      order_status: o.order_status,
      create_time: o.create_time,
      update_time: o.update_time,
      pay_time: o.pay_time,
      buyer_user_id: o.buyer_user_id,
      total_amount: o.total_amount,
      currency: o.currency,
      items: (o.item_list ?? []).map((i: any) => ({
        item_id: i.item_id,
        item_sku: i.item_sku,
        model_sku: i.model_sku,
        model_quantity_purchased: i.model_quantity_purchased,
        model_discounted_price: i.model_discounted_price,
        model_original_price: i.model_original_price,
      })),
    }));
  }

  async getEscrowDetail(
    params: GetEscrowDetailParams
  ): Promise<ShopeeEscrowDetail> {
    const ep = getEndpoint('getEscrowDetail');
    warnUnconfirmedFields('getEscrowDetail');

    // escrow_amount é o campo-chave para "VALOR DA RENDA"
    assertFieldMapped('getEscrowDetail', 'escrow_amount');

    const raw = await this.httpGet<any>(ep.path, {
      order_sn: params.order_sn,
    });

    return {
      order_sn: raw.response?.order_sn,
      escrow_amount: raw.response?.escrow_amount,
      buyer_total_amount: raw.response?.buyer_total_amount,
      commission_fee: raw.response?.commission_fee,
      service_fee: raw.response?.service_fee,
      currency: raw.response?.currency,
    };
  }

  async getAccessToken(
    code: string,
    shopId: number
  ): Promise<ShopeeTokenPair> {
    const ep = getEndpoint('getAccessToken');

    const raw = await this.httpPost<any>(ep.path, {
      code,
      shop_id: shopId,
      partner_id: this.config.partnerId,
    });

    return {
      access_token: raw.response?.access_token,
      refresh_token: raw.response?.refresh_token,
      expire_in: raw.response?.expire_in,
    };
  }

  async refreshAccessToken(
    refreshToken: string,
    shopId: number
  ): Promise<ShopeeTokenPair> {
    const ep = getEndpoint('refreshAccessToken');

    const raw = await this.httpPost<any>(ep.path, {
      refresh_token: refreshToken,
      shop_id: shopId,
      partner_id: this.config.partnerId,
    });

    return {
      access_token: raw.response?.access_token,
      refresh_token: raw.response?.refresh_token,
      expire_in: raw.response?.expire_in,
    };
  }
}
