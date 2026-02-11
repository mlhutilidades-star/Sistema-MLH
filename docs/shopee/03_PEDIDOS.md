# Pedidos — Shopee Open Platform

> **Fonte primária**: Shopee Open Platform API v2 — Order module.
> Campos marcados com `TODO` precisam ser confirmados na doc oficial antes de ir para produção.

---

## 1. Endpoints Necessários

### 1.1. Listar Pedidos por Período/Status

**Endpoint**: `GET /api/v2/order/get_order_list`

**Common Params**: obrigatórios (ver `02_AUTENTICACAO_E_ASSINATURA.md` §4)

**Query Params específicos**:

| Param             | Tipo   | Obrig. | Descrição |
|-------------------|--------|--------|-----------|
| `time_range_field` | string | sim    | `"create_time"` ou `"update_time"` |
| `time_from`       | int    | sim    | Unix timestamp início (segundos) |
| `time_to`         | int    | sim    | Unix timestamp fim (segundos) |
| `page_size`       | int    | sim    | Máx. itens por página (1–100) |
| `cursor`          | string | não    | Cursor para paginação (vem no response) |
| `order_status`    | string | não    | Filtro: `UNPAID`, `READY_TO_SHIP`, `PROCESSED`, `SHIPPED`, `COMPLETED`, `IN_CANCEL`, `CANCELLED`, `INVOICE_PENDING` |
| `response_optional_fields` | string | não | Campos extras separados por vírgula |

> `TODO`: Confirmar na doc Shopee (atualizada em 10/02/2026) se `INVOICE_PENDING` existe como status no mercado Brasil.

**Response esperada**:
```json
{
  "error": "",
  "message": "",
  "response": {
    "more": true,
    "next_cursor": "cursor_string",
    "order_list": [
      {
        "order_sn": "2302110ABC123DEF",
        "order_status": "COMPLETED",
        "create_time": 1707609600,
        "update_time": 1707696000
      }
    ]
  },
  "request_id": "uuid"
}
```

> **Nota**: Este endpoint retorna apenas `order_sn` + metadados mínimos.
> Para obter itens/valores, é necessário chamar `get_order_detail`.

### 1.2. Buscar Detalhe do Pedido

**Endpoint**: `GET /api/v2/order/get_order_detail`

**Query Params específicos**:

| Param                       | Tipo   | Obrig. | Descrição |
|-----------------------------|--------|--------|-----------|
| `order_sn_list`             | string | sim    | Lista de order_sn separados por vírgula (máx. 50) |
| `response_optional_fields`  | string | não    | Ex.: `"buyer_user_id,item_list,pay_time,total_amount"` |

> `TODO`: Confirmar na doc Shopee (atualizada em 10/02/2026) a lista completa de `response_optional_fields` disponíveis para v2.

**Response esperada**:
```json
{
  "error": "",
  "message": "",
  "response": {
    "order_list": [
      {
        "order_sn": "2302110ABC123DEF",
        "order_status": "COMPLETED",
        "create_time": 1707609600,
        "update_time": 1707696000,
        "pay_time": 1707610200,
        "buyer_user_id": 987654321,
        "shipping_carrier": "TODO_CARRIER_NAME",
        "total_amount": 199.90,
        "currency": "BRL",
        "item_list": [
          {
            "item_id": 111222333,
            "item_name": "Produto Exemplo",
            "item_sku": "SKU-001",
            "model_id": 444555666,
            "model_sku": "SKU-001-M",
            "model_quantity_purchased": 2,
            "model_discounted_price": 89.95,
            "model_original_price": 99.95
          }
        ]
      }
    ]
  },
  "request_id": "uuid"
}
```

---

## 2. Campos Mínimos que o Sistema Deve Salvar

| Campo interno (sistema MLH) | Origem Shopee                              | Tipo     | Obrig. |
|------------------------------|--------------------------------------------|----------|--------|
| `marketplaceOrderId`         | `order_sn`                                 | string   | sim    |
| `createdAt`                  | `create_time` (unix → ISO 8601)            | datetime | sim    |
| `updatedAt`                  | `update_time`                              | datetime | sim    |
| `paidAt`                     | `pay_time`                                 | datetime | não    |
| `status`                     | `order_status`                             | string   | sim    |
| `buyerId`                    | `buyer_user_id`                            | int64    | não    |
| `totalAmount`                | `total_amount`                             | float    | sim    |
| `currency`                   | `currency`                                 | string   | sim    |
| **Itens** | | | |
| `item.sku`                   | `item_list[].model_sku` (ou `item_sku`)    | string   | sim    |
| `item.quantity`              | `item_list[].model_quantity_purchased`      | int      | sim    |
| `item.subtotal`              | `model_discounted_price × quantity`         | float    | sim    |
| `item.originalPrice`         | `item_list[].model_original_price`          | float    | não    |

> **Atenção sobre SKU**: Se o produto tem variações (models), o SKU relevante é
> `model_sku`. Se não tem variações, usar `item_sku`.

---

## 3. Onde Encontrar o "Valor Recebido do Pedido"

O campo `total_amount` no `get_order_detail` é o **valor bruto pago pelo comprador**
(inclui frete, descontos, vouchers). Ele **NÃO** é o valor líquido que o seller recebe.

Para o **valor líquido** ("VALOR DA RENDA"), ver `04_FINANCEIRO_MINHA_RENDA.md`.

Resumo:

| Conceito                           | Campo Shopee       | Endpoint             |
|------------------------------------|--------------------|----------------------|
| Valor bruto pago pelo comprador    | `total_amount`     | `get_order_detail`   |
| Valor líquido recebido pelo seller | Ver doc financeiro | Ver `04_FINANCEIRO_MINHA_RENDA.md` |

---

## 4. Status de Pedido — Ciclo de Vida

```
UNPAID → READY_TO_SHIP → PROCESSED → SHIPPED → COMPLETED
                  │                        │
                  └── IN_CANCEL ──────────▸ CANCELLED
```

> `TODO`: Confirmar se `INVOICE_PENDING` é um status intermediário entre
> `READY_TO_SHIP` e `PROCESSED` no mercado Brasil.

---

## 5. Paginação

- Use `cursor` retornado no campo `next_cursor`.
- Quando `more` for `false`, não há mais páginas.
- `page_size` máximo: 100.
- Janela máxima de `time_from` → `time_to`: 15 dias.

> `TODO`: Confirmar na doc Shopee se a janela máxima é 15 dias ou outro valor.

---

## 6. TODOs Pendentes

| # | Item | Status |
|---|------|--------|
| 1 | Lista completa de `response_optional_fields` | `TODO` |
| 2 | Confirmar status `INVOICE_PENDING` no Brasil | `TODO` |
| 3 | Confirmar janela máxima de tempo na listagem | `TODO` |
| 4 | Capturar sample real de `get_order_detail` | `TODO` |
| 5 | Confirmar se `total_amount` inclui frete/voucher | `TODO` |
