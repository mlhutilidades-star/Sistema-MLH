/**
 * ShopeeAdsClientImpl.ts
 *
 * Stub de implementação do ShopeeAdsClient.
 * Lê o contrato para validar campos; HTTP ainda não implementado.
 *
 * ⚠️ AVISO: A maioria dos campos de Ads não está confirmada.
 *    Este stub vai lançar erros de "campo não mapeado" se o contrato
 *    mudar após confirmação na documentação oficial.
 */

import {
  ShopeeAdsClient,
  GetAdsSpendBySkuDailyParams,
  ShopeeAdsSpendResponse,
} from './ShopeeAdsClient';

import { getEndpoint, isFieldMapped, getUnconfirmedFields } from './contract';

// ─── Config (reutiliza do ShopeeClientImpl) ───────────────────────────────────

export interface ShopeeAdsClientConfig {
  partnerId: number;
  partnerKey: string;
  shopId: number;
  accessToken: string;
  apiHost?: string;
  apiVersion?: string;
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
      `[ShopeeAdsClient] ⚠️ Endpoint "${endpointName}" tem ${unconfirmed.length} campo(s) não confirmados: ` +
        unconfirmed.map((f) => f.name).join(', ')
    );
  }
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class ShopeeAdsClientImpl implements ShopeeAdsClient {
  private config: ShopeeAdsClientConfig;

  constructor(config: ShopeeAdsClientConfig) {
    this.config = config;
  }

  private get host(): string {
    return this.config.apiHost ?? 'partner.shopeemobile.com';
  }

  private get version(): string {
    return this.config.apiVersion ?? 'v2';
  }

  private baseUrl(): string {
    return `https://${this.host}/api/${this.version}`;
  }

  /**
   * TODO: Implementar HMAC-SHA256.
   */
  private computeSign(_apiPath: string, _timestamp: number): string {
    throw new Error(
      'TODO: implementar computeSign() — ver docs/shopee/02_AUTENTICACAO_E_ASSINATURA.md'
    );
  }

  /**
   * TODO: Implementar HTTP GET com common params.
   */
  private async httpGet<T>(
    _path: string,
    _params: Record<string, unknown>
  ): Promise<T> {
    throw new Error(
      'TODO: implementar httpGet() — ver docs/shopee/06_LIMITES_E_ERROS.md para retry'
    );
  }

  // ─── Public Methods ─────────────────────────────────────────────────────────

  async getAdsSpendBySkuDaily(
    params: GetAdsSpendBySkuDailyParams
  ): Promise<ShopeeAdsSpendResponse> {
    const ep = getEndpoint('getAdsSpendBySkuDaily');
    warnUnconfirmedFields('getAdsSpendBySkuDaily');

    // Validar campos obrigatórios contra o contrato
    assertFieldMapped('getAdsSpendBySkuDaily', 'date');
    assertFieldMapped('getAdsSpendBySkuDaily', 'item_id');
    assertFieldMapped('getAdsSpendBySkuDaily', 'sku');
    assertFieldMapped('getAdsSpendBySkuDaily', 'spend');

    // ⚠️ O path deste endpoint tem TODO — vai falhar no validator
    const queryParams: Record<string, unknown> = {
      start_date: params.start_date,
      end_date: params.end_date,
      ...(params.report_type ? { report_type: params.report_type } : {}),
    };

    const raw = await this.httpGet<any>(ep.path, queryParams);

    return {
      records: (raw.response?.report_list ?? []).map((r: any) => ({
        date: r.date,
        item_id: r.item_id,
        sku: r.sku ?? r.TODO_sku_field ?? '',
        spend: r.spend,
        currency: r.currency,
      })),
    };
  }
}
