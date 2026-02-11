/**
 * ShopeeClient.ts
 *
 * Interface de integração com a Shopee — Pedidos e Financeiro.
 * Todos os tipos derivam do contrato: contracts/shopee.endpoints.yaml
 *
 * Regra: só retornar campos definidos no contrato.
 */

// ─── Response Types (derivados do contrato) ───────────────────────────────────

export interface ShopeeOrderSummary {
  order_sn: string;
  order_status: string;
  create_time: number;
  update_time: number;
}

export interface ShopeeOrderListResponse {
  orders: ShopeeOrderSummary[];
  more: boolean;
  next_cursor: string | null;
}

export interface ShopeeOrderItem {
  item_id: number;
  item_sku: string;
  model_sku?: string;
  model_quantity_purchased: number;
  model_discounted_price: number;
  model_original_price?: number;
}

export interface ShopeeOrderDetail {
  order_sn: string;
  order_status: string;
  create_time: number;
  update_time: number;
  pay_time?: number;
  buyer_user_id?: number;
  total_amount: number;
  currency: string;
  items: ShopeeOrderItem[];
}

export interface ShopeeEscrowDetail {
  order_sn: string;
  /** Valor da renda — TODO: confirmar se escrow_amount é o campo correto */
  escrow_amount: number;
  buyer_total_amount?: number;
  commission_fee?: number;
  service_fee?: number;
  currency: string;
}

export interface ShopeeTokenPair {
  access_token: string;
  refresh_token: string;
  expire_in: number;
}

// ─── Params ───────────────────────────────────────────────────────────────────

export interface ListOrdersParams {
  time_range_field: 'create_time' | 'update_time';
  time_from: number;
  time_to: number;
  page_size: number;
  cursor?: string;
  order_status?: string;
}

export interface GetOrderDetailParams {
  order_sn_list: string[];
}

export interface GetEscrowDetailParams {
  order_sn: string;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ShopeeClient {
  /**
   * Listar pedidos por período.
   * Contrato: endpoints.listOrders
   */
  listOrders(params: ListOrdersParams): Promise<ShopeeOrderListResponse>;

  /**
   * Buscar detalhes de um ou mais pedidos.
   * Contrato: endpoints.getOrderDetail
   */
  getOrderDetail(
    params: GetOrderDetailParams
  ): Promise<ShopeeOrderDetail[]>;

  /**
   * Obter detalhes financeiros (escrow) de um pedido.
   * Contrato: endpoints.getEscrowDetail
   */
  getEscrowDetail(
    params: GetEscrowDetailParams
  ): Promise<ShopeeEscrowDetail>;

  /**
   * Trocar auth code por tokens.
   * Contrato: endpoints.getAccessToken
   */
  getAccessToken(code: string, shopId: number): Promise<ShopeeTokenPair>;

  /**
   * Renovar access_token.
   * Contrato: endpoints.refreshAccessToken
   */
  refreshAccessToken(
    refreshToken: string,
    shopId: number
  ): Promise<ShopeeTokenPair>;
}
