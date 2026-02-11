# Financeiro / "Minha Renda" — Shopee Open Platform

> **Fonte primária**: Shopee Open Platform API v2 — Payment module.
> Este documento define formalmente o que o sistema MLH chama de **"VALOR DA RENDA"**.
> Campos marcados com `TODO` precisam ser confirmados na doc oficial.

---

## 1. Definição Formal

### O que o sistema chama de "VALOR DA RENDA"

| Termo interno (MLH)   | Definição |
|------------------------|-----------|
| **Recebido do pedido** | Valor **líquido** que o seller efetivamente recebe após dedução de comissão Shopee, taxa de serviço, frete subsidiado, vouchers absorvidos e ajustes. |

**"VALOR DA RENDA" = Recebido do pedido = valor líquido pós-deduções**

Este valor é diferente do `total_amount` em `get_order_detail`, que representa
o valor bruto pago pelo comprador.

---

## 2. De Onde Vem na API

### 2.1. Endpoint Principal

**Endpoint**: `GET /api/v2/payment/get_escrow_detail`

> `TODO`: Confirmar na doc Shopee (atualizada em 10/02/2026) se este é o endpoint
> correto e se está disponível no mercado Brasil.

**Parâmetros específicos**:

| Param      | Tipo   | Obrig. | Descrição |
|-----------|--------|--------|-----------|
| `order_sn` | string | sim    | Número do pedido |

**Response esperada (estrutura provável)**:

```json
{
  "error": "",
  "message": "",
  "response": {
    "order_sn": "2302110ABC123DEF",
    "buyer_total_amount": 199.90,
    "escrow_amount": 170.50,
    "order_income": {
      "TODO_FIELD": "TODO: confirmar estrutura exata"
    },
    "buyer_paid_amount": 199.90,
    "seller_due_amount": 170.50,
    "commission_fee": 19.99,
    "service_fee": 5.00,
    "shipping_fee_discount": 4.41,
    "voucher_from_seller": 0.00,
    "coins": 0.00,
    "currency": "BRL"
  },
  "request_id": "uuid"
}
```

### 2.2. Caminho do Campo — "VALOR DA RENDA"

```
response.escrow_amount
```

> `TODO`: Confirmar se o campo correto é `escrow_amount`, `seller_due_amount`
> ou outro. Possíveis candidatos:
> - `response.escrow_amount`
> - `response.order_income.escrow_amount`
> - `response.buyer_total_amount - (fees)`
>
> Capturar sample real e validar qual campo reflete o valor depositado na conta do seller.

### 2.3. Endpoint Alternativo — Listagem de Transações

**Endpoint**: `GET /api/v2/payment/get_wallet_transaction_list`

> `TODO`: Confirmar existência e path deste endpoint na doc Shopee (atualizada em 10/02/2026).

Este endpoint pode listar transações da carteira do seller, permitindo
reconciliação dos valores recebidos.

---

## 3. Fórmula Conceitual do "VALOR DA RENDA"

```
VALOR_DA_RENDA =
    buyer_paid_amount
  - commission_fee
  - service_fee
  - shipping_fee (parte seller)
  - voucher_from_seller
  + shopee_shipping_rebate (se houver)
  ± adjustments (devoluções, compensações)
```

> `TODO`: Confirmar cada componente acima com a doc oficial.
> Os nomes dos campos acima são **candidatos prováveis**, não confirmados.

---

## 4. Versionamento de Snapshots

### Por que versionamos?

O "VALOR DA RENDA" de um pedido **pode mudar** após a conclusão original:

| Evento               | Impacto no valor |
|----------------------|------------------|
| Devolução parcial    | Reduz o valor    |
| Devolução total      | Zera o valor     |
| Ajuste de comissão   | Altera o valor   |
| Compensação Shopee   | Pode aumentar    |
| Disputa resolvida    | Altera o valor   |

### Estratégia de Snapshot

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│ Snapshot  │     │ Snapshot  │     │ Snapshot  │
│ v1        │────▸│ v2        │────▸│ v3        │
│ R$ 170.50 │     │ R$ 120.50 │     │ R$ 120.50 │
│ (original)│     │ (devolução│     │ (final)   │
│           │     │  parcial) │     │           │
└──────────┘     └──────────┘     └──────────┘
```

**Modelo de snapshot no banco**:

```sql
CREATE TABLE shopee_order_income_snapshot (
  id              SERIAL PRIMARY KEY,
  order_sn        VARCHAR(64) NOT NULL,
  snapshot_version INT NOT NULL,
  escrow_amount   DECIMAL(12,2),        -- TODO: confirmar campo
  commission_fee  DECIMAL(12,2),
  service_fee     DECIMAL(12,2),
  raw_response    JSONB NOT NULL,        -- response completa da API
  captured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_sn, snapshot_version)
);
```

### Quando capturar novo snapshot

1. **Na conclusão do pedido** (status `COMPLETED`)
2. **Quando receber notificação** de devolução/ajuste
3. **Diariamente via cron** para pedidos dos últimos 30 dias (reconciliação)

---

## 5. Mapeamento Resumido

| Conceito MLH           | Campo Shopee (provável)               | Endpoint                        | Confirmado? |
|------------------------|---------------------------------------|---------------------------------|-------------|
| VALOR DA RENDA         | `response.escrow_amount`              | `/api/v2/payment/get_escrow_detail` | `TODO`  |
| Comissão Shopee        | `response.commission_fee`             | idem                            | `TODO`      |
| Taxa de serviço        | `response.service_fee`                | idem                            | `TODO`      |
| Valor bruto comprador  | `response.buyer_total_amount`         | idem                            | `TODO`      |
| Moeda                  | `response.currency`                   | idem                            | `TODO`      |

---

## 6. TODOs Pendentes

| # | Item | Status |
|---|------|--------|
| 1 | Confirmar endpoint correto para escrow/income | `TODO` |
| 2 | Confirmar campo exato do "VALOR DA RENDA" | `TODO` |
| 3 | Confirmar endpoint de wallet transactions | `TODO` |
| 4 | Capturar sample real de `get_escrow_detail` | `TODO` |
| 5 | Confirmar fórmula de cálculo líquido | `TODO` |
| 6 | Verificar se há webhooks para mudança de income | `TODO` |
