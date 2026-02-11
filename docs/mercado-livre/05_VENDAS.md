# Gerenciamento de Vendas - Mercado Livre API

## Pedidos (Orders)

### Obter Pedido

**Endpoint**: `GET /orders/{order_id}`

**Response**:
```json
{
  "id": 1234567890,
  "status": "paid",
  "status_detail": "ready_to_ship",
  "date_created": "2024-01-15T10:30:00Z",
  "date_closed": "2024-01-15T11:00:00Z",
  "date_last_modified": "2024-01-15T11:00:00Z",
  "buyer": {
    "id": 99999999,
    "nickname": "comprador_username",
    "email": "comprador@example.com",
    "phone": {
      "area_code": "11",
      "number": "999999999"
    }
  },
  "seller": {
    "id": 206946886,
    "nickname": "seu_usuario"
  },
  "items": [
    {
      "id": "MLB2525821123",
      "title": "Produto",
      "quantity": 1,
      "unit_price": 99.90,
      "currency_id": "BRL"
    }
  ],
  "order_items": [
    {
      "item": {
        "id": "MLB2525821123"
      },
      "quantity": 1,
      "unit_price": 99.90,
      "full_unit_price": 99.90
    }
  ],
  "paid_amount": 99.90,
  "total_amount": 99.90,
  "currency_id": "BRL",
  "shipments": [
    {
      "id": 1234567,
      "status": "ready_to_ship"
    }
  ],
  "payments": [
    {
      "id": 9876543210,
      "status": "approved",
      "status_detail": "accredited",
      "transaction_amount": 99.90,
      "installments": 1,
      "payment_method": {
        "id": "credit_card",
        "type": "credit_card"
      },
      "date_approved": "2024-01-15T10:35:00Z"
    }
  ],
  "feedback": {
    "sale": null,
    "purchase": null
  },
  "message": "Favor enviar a nota fiscal",
  "shipping_cost": 0,
  "tags": [
    "not_yet_rated"
  ]
}
```

### Buscar Pedidos do Vendedor

**Endpoint**: `GET /orders/search/seller`

**Parâmetros**:
- `seller_id`: ID do vendedor (obrigatório)
- `order.status`: Status do pedido (paid, cancelled, etc.)
- `offset`: Página
- `limit`: Itens por página
- `sort`: Campo para ordenação

**Status possíveis**:
- `pending`: Aguardando pagamento
- `paid`: Pago
- `cancelled`: Cancelado
- `partially_refunded`: Parcialmente reembolsado
- `refunded`: Reembolsado

**Exemplo**:
```bash
curl -X GET \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  'https://api.mercadolibre.com/orders/search/seller?seller_id=206946886&order.status=paid&offset=0&limit=50'
```

### Buscar Pedidos do Comprador

**Endpoint**: `GET /orders/search/buyer`

**Parâmetros** (iguais ao do vendedor)

### Packs (Agrupamento de Pedidos)

**Endpoint**: `GET /packs/{pack_id}`

Um pack agrupa vários pedidos para o mesmo vendedor e comprador para envio único.

**Response**:
```json
{
  "id": 1234567890,
  "orders": [1234567890, 1234567891],
  "buyer_id": 99999999,
  "seller_id": 206946886,
  "status": "open",
  "created_at": "2024-01-15T10:30:00Z",
  "total_amount": 199.80
}
```

## Envios (Shipments)

### Obter Informações de Envio

**Endpoint**: `GET /shipments/{shipment_id}`

**Response**:
```json
{
  "id": 1234567,
  "order_id": 1234567890,
  "status": "ready_to_ship",
  "status_history": [
    {
      "status": "ready_to_ship",
      "date": "2024-01-15T10:30:00Z"
    }
  ],
  "shipment_type": "me2",
  "carrier": {
    "id": 100009,
    "name": "Loggi"
  },
  "tracking_number": "ABC1234567890",
  "tracking_url": "https://loggi.com/track/ABC1234567890",
  "estimated_delivery_date": "2024-01-20T23:59:59Z",
  "sent_date": "2024-01-15T15:30:00Z",
  "receiver_address": {
    "street_name": "Rua Exemplo",
    "street_number": "123",
    "complement": "Apto 202",
    "city": "São Paulo",
    "state": "SP",
    "zip_code": "01234-567",
    "country_id": "BR"
  }
}
```

### Gerar Rótulo de Envio

**Endpoint**: `POST /shipments/{shipment_id}/label`

Retorna um PDF com o rótulo de envio.

**Parâmetros**:
- `response_type`: `pdf` ou `zpl` (formato de etiqueta)

**Exemplo**:
```bash
curl -X POST \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  'https://api.mercadolibre.com/shipments/1234567/label?response_type=pdf' \
  --output label.pdf
```

### Atualizar Status de Envio

**Endpoint**: `POST /shipments/{shipment_id}/tracking`

```json
{
  "tracking_number": "ABC1234567890"
}
```

### Rastrear Envio

**Endpoint**: `GET /shipments/{shipment_id}/tracking`

**Response**:
```json
{
  "tracking_number": "ABC1234567890",
  "status": "in_transit",
  "substatus": "on_the_way",
  "events": [
    {
      "status": "ready_to_ship",
      "date": "2024-01-15T15:30:00Z",
      "location": "Galpão Loggi SP"
    },
    {
      "status": "in_transit",
      "date": "2024-01-16T08:00:00Z",
      "location": "Distribuição Loggi"
    }
  ],
  "estimated_delivery": "2024-01-20T23:59:59Z"
}
```

## Pagamentos

### Obter Informações de Pagamento

**Endpoint**: `GET /payments/{payment_id}`

**Response**:
```json
{
  "id": 9876543210,
  "order_id": 1234567890,
  "payer_id": 99999999,
  "collector_id": 206946886,
  "status": "approved",
  "status_detail": "accredited",
  "status_code": "approved",
  "payment_method": {
    "id": "credit_card",
    "type": "credit_card"
  },
  "currency_id": "BRL",
  "amount": 99.90,
  "transaction_amount": 99.90,
  "installments": 1,
  "installment_amount": 99.90,
  "date_created": "2024-01-15T10:35:00Z",
  "date_approved": "2024-01-15T10:35:05Z",
  "date_last_modified": "2024-01-15T10:35:05Z",
  "net_amount": 94.50,
  "coupon_amount": 0
}
```

### Buscar Pagamentos

**Endpoint**: `GET /payments/search/seller`

**Parâmetros**:
- `offset`: Página
- `limit`: Itens por página
- `status`: Status do pagamento
- `operation_type`: Tipo de operação

## Feedback e Avaliações

### Deixar Feedback em uma Venda

**Endpoint**: `POST /sales/{sale_id}/feedback`

```json
{
  "rating": "positive",
  "message": "Produto chegou perfeito! Recomendo!"
}
```

**Opções de rating**:
- `positive`: Positivo
- `negative`: Negativo
- `neutral`: Neutro

### Obter Feedback Recebido

**Endpoint**: `GET /users/{user_id}/reputation`

Retorna a reputação do vendedor baseada em feedbacks.

## Comunicação com Comprador

### Enviar Mensagem

**Endpoint**: `POST /messages/sellers/{seller_id}/buyers/{buyer_id}`

```json
{
  "from": 206946886,
  "to": 99999999,
  "subject": "Sobre seu pedido",
  "text": "Olá! Seu pedido foi enviado com sucesso."
}
```

### Obter Conversas

**Endpoint**: `GET /messages/sellers/{seller_id}`

Retorna todas as conversas do vendedor.

## Perguntas e Respostas

### Obter Perguntas Recebidas

**Endpoint**: `GET /items/{item_id}/questions`

**Parâmetros**:
- `status`: open, answered, unanswered

**Response**:
```json
{
  "question_id": 1234567,
  "item_id": "MLB2525821123",
  "seller_id": 206946886,
  "buyer_id": 99999999,
  "text": "Qual é a cor disponível?",
  "status": "unanswered",
  "date_created": "2024-01-15T10:30:00Z",
  "from": {
    "id": 99999999,
    "nickname": "comprador_username"
  }
}
```

### Responder Pergunta

**Endpoint**: `POST /answers`

```json
{
  "question_id": 1234567,
  "text": "Temos disponível em azul e preto"
}
```

## Reclamações (Claims)

### Obter Reclamações

**Endpoint**: `GET /claims/search/seller`

**Parâmetros**:
- `seller_id`: ID do vendedor
- `status`: open, settled, etc.

**Response**:
```json
{
  "id": 1234567890,
  "order_id": 1234567890,
  "status": "open",
  "reason": "item_not_received",
  "date_opened": "2024-01-16T10:30:00Z",
  "resolution": null
}
```

### Responder Reclamação

**Endpoint**: `POST /claims/{claim_id}/messages`

```json
{
  "message": "Iremos investigar e resolver o mais breve possível"
}
```

## Boas Práticas

1. **Sincronização de Pedidos**
   - Verifique pedidos a cada 5-10 minutos
   - Use webhooks para notificações em tempo real

2. **Avaliações**
   - Sempre responda vendedores com feedback positivo
   - Mantenha uma boa reputação (acima de 99%)

3. **Envios**
   - Genere rótulo no mesmo dia
   - Atualize rastreamento regularmente
   - Comunique ao comprador quando enviado

4. **Atendimento**
   - Responda perguntas em até 24 horas
   - Mantenha comunicação clara com comprador
   - Resolva reclamações rapidamente

5. **Rate Limiting**
   - Máximo 600 requisições por 10 minutos
   - Implemente cache local
