/**
 * ShopeeAdsClient.ts
 *
 * Interface de integração com Shopee Ads.
 * Tipos derivados do contrato: contracts/shopee.endpoints.yaml
 *
 * ⚠️ AVISO: Módulo de Ads tem muitos TODOs não confirmados.
 *    Não use em produção até confirmar disponibilidade no Brasil.
 */

// ─── Response Types ───────────────────────────────────────────────────────────

export interface ShopeeAdsSpendRecord {
  date: string;
  item_id: number;
  /** TODO: confirmar se campo SKU existe ou se precisa mapear via item_id */
  sku: string;
  spend: number;
  currency: string;
}

export interface ShopeeAdsSpendResponse {
  records: ShopeeAdsSpendRecord[];
}

// ─── Params ───────────────────────────────────────────────────────────────────

export interface GetAdsSpendBySkuDailyParams {
  /** Formato: YYYY-MM-DD — TODO: confirmar formato */
  start_date: string;
  /** Formato: YYYY-MM-DD — TODO: confirmar formato */
  end_date: string;
  report_type?: string;
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface ShopeeAdsClient {
  /**
   * Obter relatório diário de gasto de ads por item/SKU.
   * Contrato: endpoints.getAdsSpendBySkuDaily
   *
   * ⚠️ Endpoint não confirmado — ver TODOs no contrato.
   */
  getAdsSpendBySkuDaily(
    params: GetAdsSpendBySkuDailyParams
  ): Promise<ShopeeAdsSpendResponse>;
}
