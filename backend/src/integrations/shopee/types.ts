// ==========================================
// SHOPEE OPEN API v2 - TIPOS TYPESCRIPT
// ==========================================

export interface ShopeeAuthResponse {
  access_token: string;
  expire_in: number;
  refresh_token: string;
  partner_id: number;
  shop_id: number;
  merchant_id: number;
}

export interface ShopeeItem {
  item_id: number;
  item_sku: string;
  status: string; // NORMAL, DELETED, UNLIST, BANNED
  item_name: string;
  description?: string;
  price_info?: {
    current_price: number;
    original_price: number;
  };
  stock_info?: {
    stock_type: number;
    current_stock: number;
    normal_stock: number;
    reserved_stock: number;
  };
  dimension?: {
    package_length: number;
    package_width: number;
    package_height: number;
  };
  weight?: number;
  brand?: {
    brand_id: number;
    original_brand_name: string;
  };
}

export interface ShopeeItemListResponse {
  error: string;
  message: string;
  warning: string;
  request_id: string;
  response: {
    item: ShopeeItem[];
    total_count: number;
    has_next_page: boolean;
    next_offset: number;
  };
}

export interface ShopeeItemDetailResponse {
  error: string;
  message: string;
  warning: string;
  request_id: string;
  response: {
    item_list: Array<{
      item_id: number;
      item_name: string;
      item_sku: string;
      item_status: string;
      price_info: Array<{
        current_price: number;
        original_price: number;
      }>;
      stock_info: Array<{
        stock_type: number;
        current_stock: number;
        normal_stock: number;
        reserved_stock: number;
      }>;
    }>;
  };
}

export interface ShopeeOrder {
  order_sn: string;
  order_status: string; // UNPAID, READY_TO_SHIP, PROCESSED, SHIPPED, COMPLETED, CANCELLED
  create_time: number;
  update_time: number;
  buyer_user_id: number;
  buyer_username: string;
  estimated_shipping_fee: number;
  total_amount: number;
  escrow_amount?: number; // renda líquida recebida (após taxas), quando disponível
  actual_shipping_fee: number;
  payment_method: string;
  item_list: Array<{
    item_id: number;
    item_name: string;
    item_sku: string;
    model_id: number;
    model_sku: string;
    model_quantity_purchased: number;
    model_discounted_price: number;
    model_original_price: number;
  }>;
}

export interface ShopeeOrderListResponse {
  error: string;
  message: string;
  warning: string;
  request_id: string;
  response: {
    order_list: Array<{
      order_sn: string;
    }>;
    more: boolean;
    next_cursor: string;
  };
}

export interface ShopeeOrderDetailResponse {
  error: string;
  message: string;
  warning: string;
  request_id: string;
  response: {
    order_list: ShopeeOrder[];
  };
}

export interface ShopeeAdsDailyPerformance {
  date: string;
  campaign_id: number;
  campaign_name: string;
  impressions: number;
  clicks: number;
  cost: number; // em centavos
  orders: number;
  gmv: number; // em centavos
  ctr: number;
  cpc: number; // em centavos
  conversion_rate: number;
}

export interface ShopeeAdsReportResponse {
  error: string;
  message: string;
  warning: string;
  request_id: string;
  response: {
    data: ShopeeAdsDailyPerformance[];
    total_count: number;
  };
}

export interface ShopeeAdsBalanceResponse {
  error: string;
  message: string;
  warning: string;
  request_id: string;
  response: {
    balance: number; // em centavos
    currency: string;
  };
}
