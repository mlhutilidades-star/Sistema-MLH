# Gerenciamento de Produtos - Mercado Livre API

## Publicar um Produto

**Endpoint**: `POST /items`

**Headers**:
```
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body**:
```json
{
  "title": "Produto Exemplo",
  "category_id": "MLB1493",
  "price": 99.90,
  "currency_id": "BRL",
  "available_quantity": 100,
  "buying_mode": "buy_it_now",
  "listing_type_id": "gold_pro",
  "condition": "new",
  "description": {
    "plain_text": "Descrição do produto aqui..."
  },
  "pictures": [
    {
      "source": "https://seu-cdn.com/imagem1.jpg"
    },
    {
      "source": "https://seu-cdn.com/imagem2.jpg"
    }
  ],
  "attributes": [
    {
      "id": "BRAND",
      "value_name": "Sua Marca"
    },
    {
      "id": "MODEL",
      "value_name": "Modelo XYZ"
    }
  ],
  "shipping": {
    "mode": "me2",
    "methods": [
      {
        "id": 100009,
        "type": "standard",
        "free_shipping": true
      }
    ]
  },
  "status": "active"
}
```

**Response (sucesso)**:
```json
{
  "id": "MLB2525821123",
  "status": "active",
  "title": "Produto Exemplo",
  "price": 99.90,
  "available_quantity": 100,
  "created_at": "2024-01-15T10:30:00Z"
}
```

## Atualizar um Produto

**Endpoint**: `PUT /items/{item_id}`

**Campos que podem ser atualizados**:
- `price`: Preço (sem permitir preços iguais)
- `available_quantity`: Quantidade disponível
- `description`: Descrição do produto
- `attributes`: Atributos

**Exemplo**:
```bash
curl -X PUT \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  'https://api.mercadolibre.com/items/MLB2525821123' \
  -d '{
    "price": 89.90,
    "available_quantity": 50
  }'
```

## Obter Informações de um Produto

**Endpoint**: `GET /items/{item_id}`

**Response**:
```json
{
  "id": "MLB2525821123",
  "status": "active",
  "title": "Produto Exemplo",
  "category_id": "MLB1493",
  "price": 99.90,
  "currency_id": "BRL",
  "available_quantity": 100,
  "sold_quantity": 5,
  "buying_mode": "buy_it_now",
  "listing_type_id": "gold_pro",
  "condition": "new",
  "description": "Descrição...",
  "created_at": "2024-01-15T10:30:00Z",
  "pictures": [
    {
      "id": "PIC1",
      "url": "https://cdn.com/imagem1.jpg"
    }
  ],
  "seller_id": 206946886,
  "seller_custom_field": "Campo customizado",
  "variations": []
}
```

## Deletar/Pausar um Produto

**Endpoint**: `PUT /items/{item_id}`

**Para pausar (mudar status)**:
```json
{
  "status": "paused"
}
```

**Para reativar**:
```json
{
  "status": "active"
}
```

## Gerenciar Variações

### Criar Variações

```json
{
  "available_quantity": 10,
  "sku": "SKU-VARIACAO-1",
  "price": 99.90,
  "attribute_combinations": [
    {
      "name": "Tamanho",
      "value_name": "M"
    },
    {
      "name": "Cor",
      "value_name": "Azul"
    }
  ]
}
```

### Atualizar Variação

**Endpoint**: `PUT /items/{item_id}/variations/{variation_id}`

```json
{
  "available_quantity": 15,
  "price": 89.90
}
```

## Gerenciar Imagens

### Upload de Imagem

**Endpoint**: `POST /pictures`

**Body (multipart/form-data)**:
```
file: [arquivo binário]
```

**Response**:
```json
{
  "id": "PIC12345",
  "picture_id": 12345,
  "url": "https://cdn.mlstatic.com/PIC12345.jpg",
  "secure_url": "https://cdn.mlstatic.com/PIC12345.jpg",
  "size": "500x500",
  "max_size": "500x500"
}
```

### Adicionar Imagens a um Produto

**Endpoint**: `POST /items/{item_id}/pictures`

```json
{
  "pictures": [
    {
      "id": "PIC12345"
    },
    {
      "source": "https://seu-cdn.com/nova-imagem.jpg"
    }
  ]
}
```

## Buscar Produtos

**Endpoint**: `GET /sites/{site_id}/search`

**Parâmetros de query**:
- `q`: Termo de busca (obrigatório ou `category`)
- `category`: ID da categoria
- `sort`: Campo para ordenação
- `offset`: Página (padrão: 0)
- `limit`: Itens por página (máx: 50)
- `condition`: Novo ou usado
- `price_range`: Faixa de preço (min-max)
- `official_store`: Apenas lojas oficiais (true/false)

**Exemplo**:
```bash
curl -X GET \
  'https://api.mercadolibre.com/sites/MLB/search?q=iphone&category=MLB1000&sort=price_asc&limit=10'
```

**Response**:
```json
{
  "site_id": "MLB",
  "query": "iphone",
  "paging": {
    "total": 1500,
    "offset": 0,
    "limit": 10,
    "primary_results": 10
  },
  "results": [
    {
      "id": "MLB2525821123",
      "title": "iPhone 14 Pro",
      "price": 5999.00,
      "picture": "https://cdn.mlstatic.com/...",
      "condition": "new",
      "seller": {
        "id": 12345,
        "nickname": "loja_oficial"
      }
    }
  ]
}
```

## Categorias

### Obter Categorias

**Endpoint**: `GET /sites/{site_id}/categories`

Retorna todas as categorias disponíveis para um domínio.

### Obter Atributos de uma Categoria

**Endpoint**: `GET /categories/{category_id}/attributes`

**Response**:
```json
[
  {
    "id": "BRAND",
    "name": "Marca",
    "type": "string",
    "tags": ["important"],
    "values": [
      {
        "id": "SAMSUNG",
        "name": "Samsung"
      }
    ]
  },
  {
    "id": "MODEL",
    "name": "Modelo",
    "type": "string"
  }
]
```

## Sincronização de Publicações

**Para produtos com múltiplas origens de dados**:

### Obter Publicações do Usuário

**Endpoint**: `GET /users/{user_id}/items/search`

**Parâmetros**:
- `status`: Ativa, pausada, closed, etc.

**Response**:
```json
{
  "query": "user_id=206946886&status=active",
  "paging": {
    "total": 150,
    "limit": 50
  },
  "results": ["MLB2525821123", "MLB2525821124"]
}
```

### Atualizar Estoque em Massa

Use a seguinte estratégia:
1. Obtenha os IDs dos produtos (`/users/{user_id}/items/search`)
2. Atualize cada um com `PUT /items/{item_id}`

## Descrição de Produtos

### Atualizar Descrição

**Endpoint**: `PUT /items/{item_id}/description`

```json
{
  "plain_text": "Nova descrição do produto..."
}
```

## Preços

### Atualizar Preço

**Endpoint**: `PUT /items/{item_id}`

```json
{
  "price": 89.90
}
```

### Preços por Quantidade

**Endpoint**: `POST /items/{item_id}/price-ranges`

```json
{
  "price_ranges": [
    {
      "min_quantity": 10,
      "max_quantity": 20,
      "unit_price": 85.00
    },
    {
      "min_quantity": 21,
      "max_quantity": 50,
      "unit_price": 80.00
    }
  ]
}
```

## Boas Práticas

1. **Validação de Dados**
   - Use o validador de publicações: `/items/validate`
   - Verifique atributos obrigatórios por categoria

2. **Imagens**
   - Mínimo 2 imagens, máximo 12
   - Formato: JPG, PNG, GIF
   - Tamanho: Máximo 20MB

3. **Preços**
   - Sempre use números válidos
   - Não use preço = 0
   - Use a moeda correta

4. **Rate Limiting**
   - Máximo 600 requisições por 10 minutos
   - Implemente backoff exponencial

5. **Sincronização**
   - Atualize estoque frequentemente
   - Use webhooks para sincronização em tempo real
