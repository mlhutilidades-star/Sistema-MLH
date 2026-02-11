# Guia de Arquitetura - Sistema de Integração Multi-Marketplace

## Visão Geral

Este sistema integra três marketplaces principais:
- **Mercado Livre** (América Latina)
- **Shopee** (Ásia e América Latina)
- **TikTok Shop** (Global e crescente)

## Estrutura do Projeto

```
sistema-mlh/
├── docs/
│   ├── mercado-livre/
│   │   ├── 01_INTRODUCAO.md
│   │   ├── 02_AUTENTICACAO.md
│   │   ├── 03_USUARIOS.md
│   │   ├── 04_PRODUTOS.md
│   │   ├── 05_VENDAS.md
│   │   └── 06_NOTIFICACOES.md
│   ├── shopee/
│   │   ├── 01_INTRODUCAO.md
│   │   └── [Documentação em desenvolvimento]
│   └── tiktok-shop/
│       ├── 01_INTRODUCAO.md
│       └── [Documentação em desenvolvimento]
├── src/
│   ├── auth/
│   │   ├── mercado_livre.py
│   │   ├── shopee.py
│   │   └── tiktok_shop.py
│   ├── clients/
│   │   ├── mercado_livre_client.py
│   │   ├── shopee_client.py
│   │   └── tiktok_shop_client.py
│   ├── models/
│   │   ├── product.py
│   │   ├── order.py
│   │   └── shipment.py
│   ├── sync/
│   │   ├── product_sync.py
│   │   ├── order_sync.py
│   │   └── inventory_sync.py
│   ├── webhooks/
│   │   ├── handlers.py
│   │   └── validators.py
│   └── main.py
├── .env.example
├── requirements.txt
└── README.md
```

## Padrões de Autenticação

### Mercado Livre
- **Tipo**: OAuth 2.0
- **Fluxo**: Authorization Code
- **Token**: Access Token + Refresh Token
- **Duração**: 6 horas (access), permanente (refresh)

### Shopee
- **Tipo**: API Key + Timestamp
- **Fluxo**: Token request
- **Token**: Bearer Token
- **Duração**: Até 24 horas

### TikTok Shop
- **Tipo**: OAuth 2.0
- **Fluxo**: Authorization Code
- **Token**: Access Token + Refresh Token
- **Duração**: 1 hora (access), 30 dias (refresh)

## Estrutura de Dados Padrão

### Produto (Product)
```python
class Product:
    # ID único por marketplace
    external_id: str  # ID da plataforma
    marketplace: str  # meli, shopee, tiktok
    
    # Informações básicas
    title: str
    description: str
    price: float
    currency: str
    
    # Inventário
    quantity: int
    sku: str
    
    # Imagens
    images: List[Image]
    
    # Atributos
    attributes: Dict[str, str]
    
    # Status
    status: str  # active, inactive, paused
    created_at: datetime
    updated_at: datetime
```

### Pedido (Order)
```python
class Order:
    # Identificação
    external_id: str  # ID da plataforma
    marketplace: str
    
    # Partes envolvidas
    buyer_id: str
    seller_id: str
    
    # Itens
    items: List[OrderItem]
    
    # Valores
    total_amount: float
    shipping_cost: float
    tax: float
    currency: str
    
    # Status
    status: str  # pending, paid, shipped, delivered
    payment_status: str
    
    # Envio
    shipping_address: Address
    tracking_number: Optional[str]
    
    # Timestamps
    created_at: datetime
    paid_at: Optional[datetime]
    shipped_at: Optional[datetime]
    delivered_at: Optional[datetime]
```

### Cliente de API (Abstract)
```python
class MarketplaceClient:
    def authenticate(self) -> str: pass
    def refresh_token(self) -> str: pass
    def get_products(self) -> List[Product]: pass
    def create_product(self, product: Product) -> str: pass
    def update_product(self, product_id: str, data: dict) -> bool: pass
    def get_orders(self) -> List[Order]: pass
    def update_order_status(self, order_id: str, status: str) -> bool: pass
    def get_order(self, order_id: str) -> Order: pass
```

## Fluxo de Sincronização

### 1. Sincronização de Produtos
```
┌─────────────────┐
│ Banco de Dados  │
│  (Produtos)     │
└────────┬────────┘
         │
         ├─────────────┬─────────────┬──────────────┐
         │             │             │              │
    ┌────▼────┐  ┌─────▼────┐  ┌────▼─────┐  ┌───▼──────┐
    │Mercado  │  │  Shopee  │  │ TikTok   │  │Inventário│
    │ Livre   │  │  Shop    │  │  Shop    │  │de Tercei-│
    │         │  │          │  │          │  │ros       │
    └─────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Processo**:
1. Ler produto do banco de dados
2. Validar dados por marketplace
3. Criar/atualizar em cada plataforma
4. Armazenar IDs externos
5. Sincronizar estoque

### 2. Sincronização de Pedidos
```
Mercado Livre → Webhook → Handler → Banco de Dados
      │                                    │
      └────────────────────────────────────┘
      
Shopee → Polling (a cada 5 min) → Handler → Banco de Dados
      │                                         │
      └─────────────────────────────────────────┘
      
TikTok Shop → Webhook → Handler → Banco de Dados
      │                               │
      └───────────────────────────────┘
```

## Sistema de Notificações

### Webhooks Implementados

**Mercado Livre**:
- `orders_v2`: Novo pedido, mudança de status
- `items`: Produto atualizado
- `messages`: Nova mensagem
- `shipments_milestone`: Atualização de envio

**Shopee**:
- `order_status_updated`: Status do pedido mudou
- `product_updated`: Produto foi atualizado
- `inventory_updated`: Estoque atualizado

**TikTok Shop**:
- `order.created`: Novo pedido
- `order.updated`: Pedido atualizado
- `order.cancelled`: Pedido cancelado
- `fulfillment.updated`: Status de envio

## Configuração de Ambiente

```env
# Mercado Livre
MELI_CLIENT_ID=xxxxx
MELI_CLIENT_SECRET=xxxxx
MELI_REDIRECT_URI=https://seu-app.com/callback/meli

# Shopee
SHOPEE_PARTNER_ID=xxxxx
SHOPEE_PARTNER_KEY=xxxxx
SHOPEE_ACCESS_TOKEN=xxxxx

# TikTok Shop
TIKTOK_CLIENT_ID=xxxxx
TIKTOK_CLIENT_SECRET=xxxxx
TIKTOK_REDIRECT_URI=https://seu-app.com/callback/tiktok

# Banco de Dados
DATABASE_URL=postgresql://user:pass@localhost/marketplace

# Webhooks
WEBHOOK_SECRET_MELI=xxxxx
WEBHOOK_SECRET_SHOPEE=xxxxx
WEBHOOK_SECRET_TIKTOK=xxxxx
```

## Tratamento de Erros

| Erro | Marketplace | Solução |
|------|-------------|---------|
| `401 Unauthorized` | Todos | Renovar token |
| `403 Forbidden` | Meli, Tiktok | Verificar permissões |
| `404 Not Found` | Todos | Item/pedido não existe |
| `429 Too Many Requests` | Todos | Implementar rate limiting |
| `500 Server Error` | Todos | Retry com backoff |

## Boas Práticas

1. **Autenticação**
   - Renovar tokens antes de expirar (5 minutos antes)
   - Armazenar tokens de forma segura (encrypted)
   - Nunca logar tokens completos

2. **API Calls**
   - Implementar retry automático
   - Usar circuit breaker para APIs lentas
   - Cache de dados quando apropriado

3. **Sincronização**
   - Usar transactions para manter consistência
   - Logging detalhado de sincronizações
   - Alertas em caso de falha

4. **Performance**
   - Batch processing para múltiplos items
   - Async/await para operações lentas
   - Índices no banco de dados

5. **Segurança**
   - HTTPS obrigatória
   - Validação de entrada
   - Rate limiting
   - CORS configurado corretamente

## Próximas Etapas

1. ✅ Documentação de Mercado Livre
2. ⏳ Documentação detalhada de Shopee
3. ⏳ Documentação detalhada de TikTok Shop
4. ⏳ Implementação de clientes Python
5. ⏳ Sistema de sincronização
6. ⏳ API unificada
7. ⏳ Dashboard de administração
