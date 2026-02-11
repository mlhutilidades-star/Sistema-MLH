# Usuários - Mercado Livre API

## Endpoints de Usuários

### 1. Obter Usuário Autenticado

**Endpoint**: `GET /users/me`

**Headers**:
```
Authorization: Bearer ACCESS_TOKEN
```

**Response**:
```json
{
  "id": 178553776,
  "user_id": 206946886,
  "nickname": "seu_usuario",
  "email": "email@example.com",
  "first_name": "João",
  "last_name": "Silva",
  "country_id": "BR",
  "registration_date": "2020-01-15T10:30:00.000-03:00",
  "identification": {
    "type": "CPF",
    "number": "12345678901"
  },
  "address": {
    "address_line": "Rua Exemplo 123",
    "street_name": "Rua Exemplo",
    "street_number": "123",
    "city": "São Paulo",
    "state": "SP",
    "zip_code": "01234-567"
  }
}
```

**Exemplo com curl**:
```bash
curl -X GET \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  'https://api.mercadolibre.com/users/me'
```

### 2. Obter Informações de um Usuário Específico

**Endpoint**: `GET /users/{user_id}`

**Parâmetros**:
- `user_id`: ID do usuário

**Example**:
```bash
curl -X GET \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  'https://api.mercadolibre.com/users/206946886'
```

**Response**:
```json
{
  "id": 206946886,
  "nickname": "seu_usuario",
  "registration_date": "2016-02-24T15:18:42.000-04:00",
  "first_name": "Pedro",
  "last_name": "Picapiedras",
  "country_id": "BR",
  "email": "test_user@testuser.com",
  "identification": {
    "type": "CPF",
    "number": "12345678901"
  },
  "phone": {
    "area_code": "11",
    "number": "99999999"
  },
  "status": "active",
  "seller_reputation": {
    "level_id": "4_green",
    "power_seller_status": "gold",
    "transactions": 5000
  }
}
```

### 3. Obter Endereços do Usuário

**Endpoint**: `GET /users/{user_id}/addresses`

**Response**:
```json
{
  "id": 178553776,
  "user_id": 206946886,
  "contact": "João Silva",
  "phone": "11999999999",
  "address_line": "Rua Exemplo 123",
  "floor": "10",
  "apartment": "202",
  "street_number": "123",
  "street_name": "Rua Exemplo",
  "city": "São Paulo",
  "state": "SP",
  "zip_code": "01234-567",
  "country_id": "BR",
  "default": true
}
```

**Exemplo**:
```bash
curl -X GET \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  'https://api.mercadolibre.com/users/206946886/addresses'
```

### 4. Obter Métodos de Pagamento Aceitos

**Endpoint**: `GET /users/{user_id}/accepted_payment_methods`

**Response**:
```json
[
  {
    "id": "visa",
    "name": "Visa",
    "payment_type_id": "credit_card",
    "thumbnail": "https://www.mercadopago.com/org-img/MP3/API/logos/visa.gif"
  },
  {
    "id": "master",
    "name": "Mastercard",
    "payment_type_id": "credit_card",
    "thumbnail": "https://www.mercadopago.com/org-img/MP3/API/logos/master.gif"
  },
  {
    "id": "pix",
    "name": "PIX",
    "payment_type_id": "transfer",
    "thumbnail": "https://www.mercadopago.com/org-img/MP3/API/logos/pix.gif"
  }
]
```

### 5. Obter Marcas do Usuário

**Endpoint**: `GET /users/{user_id}/brands`

**Response**:
```json
{
  "cust_id": 206946886,
  "tags": [
    "large_seller",
    "user_info_verified",
    "brand"
  ],
  "brands": [
    {
      "id": 12345,
      "name": "Minha Marca",
      "official_store_id": 16,
      "categories_ids": ["MLA123", "MLA456"]
    }
  ]
}
```

### 6. Obter Dados da Aplicação

**Endpoint**: `GET /applications/{app_id}`

**Response**:
```json
{
  "id": 3022782903258037,
  "site_id": "MLB",
  "name": "Minha Aplicação",
  "description": "Descrição da aplicação",
  "owner_id": 206946886,
  "status": "active",
  "redirect_urls": [
    "https://minha-app.com/callback"
  ],
  "scopes": {
    "read": true,
    "write": true,
    "offline_access": true
  }
}
```

## Permissões do Usuário para a Aplicação

### Visualizar Permissões

**Endpoint**: `GET /users/{user_id}/applications/{app_id}`

Retorna se um usuário deu permissão para sua aplicação.

### Revogar Permissão

**Endpoint**: `DELETE /users/{user_id}/applications/{app_id}`

```bash
curl -X DELETE \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  'https://api.mercadolibre.com/users/206946886/applications/3022782903258037'
```

## Disponibilidade de Tipos de Listagem

### Listar Tipos de Publicação Disponíveis

**Endpoint**: `GET /users/{user_id}/available_listing_types`

**Response**:
```json
{
  "available": [
    {
      "site_id": "MLB",
      "id": "gold_pro",
      "name": "Ouro Premium Full",
      "remaining_listings": null,
      "mapping": "gold_pro"
    },
    {
      "site_id": "MLB",
      "id": "silver",
      "name": "Prata",
      "remaining_listings": 50,
      "mapping": "silver"
    }
  ]
}
```

### Verificar Disponibilidade por Categoria

**Endpoint**: `GET /users/{user_id}/available_listing_type/{listing_type_id}?category_id={category_id}`

**Response (não disponível)**:
```json
{
  "available": false,
  "cause": "Your feedback does not allow you to use this listing type.",
  "code": "listing.feedback.not_allowed"
}
```

## Histórico de Notificações

### Obter Notificações Perdidas

**Endpoint**: `GET /missed_feeds?app_id={app_id}`

Retorna o histórico de notificações que você pode ter perdido.

## Boas Práticas

1. **Cache de Dados**
   - Armazene informações do usuário para reduzir requisições
   - Renove a cada 24 horas

2. **Validação de Permissões**
   - Sempre verifique se o usuário deu permissão
   - Use o endpoint `/users/{user_id}/applications/{app_id}`

3. **Tratamento de Erros**
   - 401 Unauthorized: Token expirado ou inválido
   - 403 Forbidden: Sem permissão para acessar
   - 404 Not Found: Usuário não existe

4. **Dados Sensíveis**
   - Nunca exponha CPF/CNPJ em logs
   - Use HTTPS obrigatoriamente
   - Armazene dados criptografados

## Tipos de Identificação Aceitos

- **CPF**: Para pessoa física
- **CNPJ**: Para pessoa jurídica
- **Passport**: Para estrangeiros
- **CI**: Cédula de identidad
