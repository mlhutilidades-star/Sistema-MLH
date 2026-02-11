# Notificações - Mercado Livre API

## Configuração de Notificações

### Registrar URL de Notificações

1. Acesse: https://developers.mercadolivre.com.br/devcenter
2. Selecione sua aplicação
3. Vá em "Configurações"
4. Seção "Notificações"
5. Insira a URL HTTPS para receber notificações
6. Selecione os tópicos desejados

**Requisitos**:
- URL deve ser HTTPS obrigatoriamente
- Servidor deve responder com HTTP 200 em até 22 segundos
- Implementar retry automático (a plataforma tentará 5 vezes)

## Tópicos de Notificação

### Orders
**Sobre**: Mudanças em pedidos
- `orders_v2`: Novo pedido, mudança de status
- `order`: [DEPRECATED] Usar orders_v2

### Messages
**Sobre**: Novas mensagens e conversas
- `messages`: Nova mensagem recebida
- `seller_messages`: [DEPRECATED]

### Items
**Sobre**: Alterações em seus produtos
- `items`: Produto publicado, atualizado ou pausado
- `item`: [DEPRECATED] Usar items

### Catalog
**Sobre**: Mudanças no catálogo
- `catalogs`: Produto adicionado/removido do catálogo
- `catalog`: [DEPRECATED] Usar catalogs

### Shipments
**Sobre**: Updates de envios
- `shipments_milestone`: Milestone do envio atingido
- `shipments`: [DEPRECATED] Usar shipments_milestone

### Promotions (Ofertas)
**Sobre**: Mudanças em promoções
- `promotions`: Promoção criada, atualizada ou removida

### Questions
**Sobre**: Novas perguntas em produtos
- `questions`: Nova pergunta recebida

## Estrutura de Notificação

### Headers da Requisição

```
POST /sua-url-notificacao HTTP/1.1
Host: sua-api.com
User-Agent: MercadoLibre/1.0
Content-Type: application/json
X-MELI-DELIVERY-ID: [ID único da entrega]
X-MELI-RECEIVED-AT: [Timestamp]
Authorization: bearer [Token]
```

### Body - Order Notification

```json
{
  "resource": "/orders/1234567890",
  "user_id": 206946886,
  "topic": "orders_v2",
  "application_id": 3022782903258037,
  "attempts": 1,
  "sent": "2024-01-15T10:35:00Z",
  "received": "2024-01-15T10:35:05Z"
}
```

### Body - Item Notification

```json
{
  "resource": "/items/MLB2525821123",
  "user_id": 206946886,
  "topic": "items",
  "application_id": 3022782903258037,
  "sent": "2024-01-15T11:00:00Z"
}
```

### Body - Message Notification

```json
{
  "resource": "/messages/123456789",
  "user_id": 206946886,
  "topic": "messages",
  "application_id": 3022782903258037,
  "sent": "2024-01-15T10:30:00Z"
}
```

## Processamento de Notificações

### 1. Receber Notificação

```python
@app.post('/webhook/mercado-livre')
def receive_notification(request):
    data = request.json
    
    # Validar autenticidade
    if not validate_notification(data):
        return {'status': 'rejected'}, 401
    
    # Processar por tópico
    if data['topic'] == 'orders_v2':
        handle_order(data)
    elif data['topic'] == 'items':
        handle_item(data)
    
    return {'status': 'received'}, 200
```

### 2. Validar Notificação

```python
def validate_notification(data):
    # Validar estrutura
    required = ['resource', 'topic', 'user_id']
    if not all(k in data for k in required):
        return False
    
    # Validar timestamp (não mais de 10 minutos)
    import datetime
    received = datetime.datetime.fromisoformat(data.get('received', ''))
    age = datetime.datetime.now() - received
    if age.total_seconds() > 600:
        return False
    
    return True
```

### 3. Processar Recurso

```python
def handle_order(notification):
    order_id = notification['resource'].split('/')[-1]
    
    # Obter dados completos da API
    response = requests.get(
        f'https://api.mercadolibre.com/orders/{order_id}',
        headers={'Authorization': f'Bearer {ACCESS_TOKEN}'}
    )
    
    order = response.json()
    
    # Processar pedido
    if order['status'] == 'paid':
        prepare_shipment(order)
    elif order['status_detail'] == 'ready_to_ship':
        generate_label(order)
```

## Responder à Notificação

### Resposta Bem-sucedida

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok"
}
```

**O que fazer**:
- Responder dentro de 22 segundos
- Retornar HTTP 200-299
- Não há limite de tamanho para resposta

### Resposta com Erro

```http
HTTP/1.1 500 Internal Server Error
Content-Type: application/json

{
  "error": "Database connection failed"
}
```

**Comportamento**:
- Mercado Livre tentará reenviar até 5 vezes
- Intervalos entre tentativas: 1 min, 5 min, 25 min, 125 min, 625 min

## Recuperar Notificações Perdidas

Se você perdeu notificações, pode recuperá-las:

**Endpoint**: `GET /missed_feeds?app_id={app_id}`

**Response**:
```json
{
  "notifications": [
    {
      "topic": "orders_v2",
      "resource": "/orders/1234567890",
      "user_id": 206946886,
      "sent": "2024-01-15T10:35:00Z"
    },
    {
      "topic": "items",
      "resource": "/items/MLB2525821123",
      "user_id": 206946886,
      "sent": "2024-01-15T11:00:00Z"
    }
  ]
}
```

## Exemplo Completo - Webhook em Node.js

```javascript
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// Configuração
const ACCESS_TOKEN = 'seu-access-token';
const SELLER_ID = 206946886;

// Webhook endpoint
app.post('/webhook/mercado-livre', async (req, res) => {
  try {
    const notification = req.body;
    
    console.log('Notificação recebida:', notification);
    
    // Validar
    if (!notification.resource || !notification.topic) {
      return res.status(400).json({ error: 'Invalid notification' });
    }
    
    // Processar por tópico
    switch(notification.topic) {
      case 'orders_v2':
        await processOrder(notification);
        break;
      case 'items':
        await processItem(notification);
        break;
      case 'messages':
        await processMessage(notification);
        break;
      default:
        console.log('Topic not handled:', notification.topic);
    }
    
    // Responder imediatamente
    res.status(200).json({ status: 'ok' });
    
  } catch(error) {
    console.error('Error:', error);
    // Responder com erro para retry
    res.status(500).json({ error: error.message });
  }
});

async function processOrder(notification) {
  const orderId = notification.resource.split('/').pop();
  
  const response = await axios.get(
    `https://api.mercadolibre.com/orders/${orderId}`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
  
  const order = response.data;
  console.log(`Pedido ${orderId}: ${order.status}`);
  
  if(order.status === 'paid') {
    // Gerar rótulo de envio
    console.log('Gerando rótulo para:', orderId);
  }
}

async function processItem(notification) {
  const itemId = notification.resource.split('/').pop();
  console.log(`Produto ${itemId} atualizado`);
}

async function processMessage(notification) {
  const messageId = notification.resource.split('/').pop();
  console.log(`Mensagem ${messageId} recebida`);
}

app.listen(3000, () => {
  console.log('Webhook servidor rodando na porta 3000');
});
```

## Exemplo Completo - Webhook em Python

```python
from flask import Flask, request, jsonify
import requests
import logging
from datetime import datetime

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Configuração
ACCESS_TOKEN = 'seu-access-token'
SELLER_ID = 206946886

@app.route('/webhook/mercado-livre', methods=['POST'])
def webhook():
    try:
        notification = request.json
        
        logging.info(f'Notificação: {notification}')
        
        # Validar
        if not notification.get('resource') or not notification.get('topic'):
            return jsonify({'error': 'Invalid notification'}), 400
        
        # Processar
        topic = notification['topic']
        if topic == 'orders_v2':
            process_order(notification)
        elif topic == 'items':
            process_item(notification)
        elif topic == 'messages':
            process_message(notification)
        
        # Responder imediatamente
        return jsonify({'status': 'ok'}), 200
        
    except Exception as e:
        logging.error(f'Error: {e}')
        return jsonify({'error': str(e)}), 500

def process_order(notification):
    order_id = notification['resource'].split('/')[-1]
    
    response = requests.get(
        f'https://api.mercadolibre.com/orders/{order_id}',
        headers={'Authorization': f'Bearer {ACCESS_TOKEN}'}
    )
    
    order = response.json()
    logging.info(f"Pedido {order_id}: {order['status']}")
    
    if order['status'] == 'paid':
        logging.info(f'Gerando rótulo para {order_id}')

def process_item(notification):
    item_id = notification['resource'].split('/')[-1]
    logging.info(f'Produto {item_id} atualizado')

def process_message(notification):
    msg_id = notification['resource'].split('/')[-1]
    logging.info(f'Mensagem {msg_id} recebida')

if __name__ == '__main__':
    app.run(port=3000)
```

## Boas Práticas

1. **Respeitar o Timeout**
   - Sempre responder em menos de 22 segundos
   - Processar de forma assíncrona em background

2. **Validação**
   - Validar a estrutura da notificação
   - Validar timestamp (máximo 10 minutos de diferença)

3. **Idempotência**
   - Use o `X-MELI-DELIVERY-ID` para evitar duplicatas
   - Guarde em cache as notificações processadas

4. **Logging**
   - Registre todas as notificações
   - Mantenha histórico de processamento

5. **Recuperação**
   - Recupere notificações perdidas periodicamente
   - Implemente monitoramento de saúde
