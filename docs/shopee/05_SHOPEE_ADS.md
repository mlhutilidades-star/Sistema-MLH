# Shopee Ads — Gasto por SKU/Dia

> **Fonte primária**: Shopee Open Platform API v2 — Marketing/Ads module.
> Campos marcados com `TODO` precisam ser confirmados na doc oficial.

---

## 1. Objetivo

Obter o **gasto diário em ads por SKU** para calcular métricas como:
- CPA (Custo por Aquisição)
- ACOS (Advertising Cost of Sales)
- ROI por produto

---

## 2. Endpoints Necessários

### 2.1. Listar Campanhas

> `TODO`: Confirmar na doc Shopee (atualizada em 10/02/2026) se o módulo de Ads
> está disponível via API v2 para o mercado Brasil.

**Endpoint provável**: `GET /api/v2/ads/get_campaign_list`

> `TODO`: Confirmar path exato. Pode ser:
> - `/api/v2/ads/get_campaign_list`
> - `/api/v2/marketing/get_campaign_list`
> - Outro path não documentado no repo

### 2.2. Obter Relatório de Performance por Item/SKU

**Endpoint provável**: `GET /api/v2/ads/get_daily_report`

> `TODO`: Confirmar path exato e nome do endpoint.

**Parâmetros prováveis**:

| Param         | Tipo   | Obrig. | Descrição |
|---------------|--------|--------|-----------|
| `start_date`  | string | sim    | Data início `"YYYY-MM-DD"` |
| `end_date`    | string | sim    | Data fim `"YYYY-MM-DD"` |
| `report_type` | string | sim    | `TODO`: confirmar valores (`"item"`, `"keyword"`, `"campaign"`) |

> `TODO`: Confirmar se granularidade por **SKU** está disponível ou se só existe
> por `item_id`. Se for por `item_id`, precisamos mapear `item_id → SKU` via
> endpoint de produto.

**Response esperada (placeholder)**:
```json
{
  "error": "",
  "message": "",
  "response": {
    "report_list": [
      {
        "date": "2026-02-10",
        "item_id": 111222333,
        "TODO_sku_field": "SKU-001",
        "impressions": 5000,
        "clicks": 150,
        "spend": 45.50,
        "conversions": 12,
        "gmv": 1200.00,
        "currency": "BRL"
      }
    ]
  },
  "request_id": "uuid"
}
```

---

## 3. Campos Mínimos que o Sistema Deve Salvar

| Campo interno (MLH) | Origem Shopee (provável)            | Tipo    | Obrig. | Confirmado? |
|---------------------|-------------------------------------|---------|--------|-------------|
| `date`              | `report_list[].date`                | string  | sim    | `TODO`      |
| `sku`               | `report_list[].TODO_sku_field`      | string  | sim    | `TODO`      |
| `spend`             | `report_list[].spend`               | float   | sim    | `TODO`      |
| `impressions`       | `report_list[].impressions`         | int     | não    | `TODO`      |
| `clicks`            | `report_list[].clicks`              | int     | não    | `TODO`      |
| `conversions`       | `report_list[].conversions`         | int     | não    | `TODO`      |
| `currency`          | `report_list[].currency`            | string  | sim    | `TODO`      |

---

## 4. Timezone para Fechamento Diário

| Mercado  | Timezone         | UTC Offset |
|----------|------------------|------------|
| Brasil   | America/Sao_Paulo | UTC-3     |

> `TODO`: Confirmar na doc Shopee se o campo `date` no relatório de ads
> segue o timezone do seller ou UTC.

### Regra do sistema

- O sistema MLH deve armazenar datas em **UTC** internamente.
- Para exibição e relatórios, converter para o timezone do mercado.
- O fechamento diário de ads deve considerar:
  - **Início do dia**: `00:00:00` no timezone do mercado
  - **Fim do dia**: `23:59:59` no timezone do mercado

---

## 5. Estratégia de Coleta

### Opção A — Polling diário (recomendada inicialmente)

```
┌─────────────┐
│ CRON Job    │
│ 03:00 UTC   │ ◀── 00:00 BRT (início do novo dia)
│ (diário)    │
└──────┬──────┘
       │
       ▼
  GET /ads/get_daily_report
    date = ontem (BRT)
       │
       ▼
  Salvar no banco
```

### Opção B — Webhook (se disponível)

> `TODO`: Confirmar se Shopee envia webhooks para atualização de dados de ads.
> Provavelmente NÃO existe webhook de ads.

---

## 6. Mapeamento item_id → SKU

Se o relatório de ads retornar apenas `item_id` (sem SKU direto):

1. Manter cache local: `item_id → model_sku`
2. Popular via `GET /api/v2/product/get_item_base_info`
3. Atualizar cache quando houver mudança de produto

```
ads_report.item_id  →  cache[item_id]  →  model_sku
```

---

## 7. TODOs Pendentes

| # | Item | Status |
|---|------|--------|
| 1 | Confirmar se módulo Ads está disponível via API Brasil | `TODO` |
| 2 | Confirmar path exato do endpoint de report | `TODO` |
| 3 | Confirmar se granularidade por SKU existe ou apenas item_id | `TODO` |
| 4 | Confirmar campos retornados no report | `TODO` |
| 5 | Confirmar timezone do campo `date` | `TODO` |
| 6 | Confirmar se existe webhook para dados de ads | `TODO` |
| 7 | Capturar sample real do report | `TODO` |
