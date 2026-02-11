# Autenticação e Assinatura — Shopee Open Platform

> **Fonte primária**: `docs/shopee/01_INTRODUCAO.md` (dados já no repo) +
> documentação oficial Shopee Open Platform.
> Campos marcados com `TODO` precisam ser confirmados na doc oficial antes de ir para produção.

---

## 1. Modelo de Autenticação

A Shopee Open Platform usa um esquema **Partner + Shop-level token**:

| Conceito        | Descrição |
|-----------------|-----------|
| **Partner ID**  | Identificador único da aplicação parceira. |
| **Partner Key** | Chave secreta usada para gerar assinaturas (HMAC). |
| **Shop ID**     | Identificador da loja do seller que autorizou o acesso. |
| **Access Token**| Token de curta duração que autoriza chamadas em nome de uma loja. |
| **Refresh Token** | Token usado para renovar o access token sem reautorização. |

---

## 2. Fluxo de Autorização (OAuth-like)

```
┌──────────┐        ┌───────────────┐       ┌──────────────┐
│ Sua App  │──(1)──▸│ Shopee Auth   │──(2)─▸│ Seller       │
│          │◂─(4)───│ Page          │◂─(3)──│ (autoriza)   │
└──────────┘        └───────────────┘       └──────────────┘
     │
     │ (5) POST /auth/token/get  →  access_token + refresh_token
     ▼
  API calls com access_token + assinatura
```

### 2.1. Etapa 1 — Gerar Auth Link

```
GET https://partner.shopeemobile.com/api/v2/shop/auth_partner
```

**Query Params obrigatórios (conforme repo)**:

| Param        | Tipo   | Descrição |
|-------------|--------|-----------|
| `partner_id` | int64  | Seu Partner ID |
| `timestamp`  | int    | Unix timestamp em **segundos** |
| `sign`       | string | HMAC-SHA256 (ver seção 3) |
| `redirect`   | string | URL de callback registrada |

> `TODO`: Confirmar na doc Shopee (atualizada em 10/02/2026) se o path é
> `/api/v2/shop/auth_partner` ou se houve migração para v3.

### 2.2. Etapa 2 — Seller autoriza no navegador

O seller faz login na Shopee e autoriza sua aplicação. Após autorizar, a Shopee
redireciona para `redirect` com query params:

```
https://YOUR_REDIRECT?code=AUTH_CODE&shop_id=SHOP_ID
```

### 2.3. Etapa 3 — Trocar code por Access Token

**Endpoint**: `POST /api/v2/auth/token/get`

**Content-Type**: `application/json`

**Body**:
```json
{
  "code": "AUTH_CODE_RECEBIDO",
  "shop_id": 123456789,
  "partner_id": 1234567
}
```

> Além do body, a request precisa dos **common params** (ver seção 4).

**Response esperada**:
```json
{
  "access_token": "TOKEN_STRING",
  "refresh_token": "REFRESH_TOKEN_STRING",
  "expire_in": 14400,
  "request_id": "request-uuid",
  "error": "",
  "message": ""
}
```

| Campo           | Tipo   | Notas |
|-----------------|--------|-------|
| `access_token`  | string | Válido por `expire_in` segundos (~4 horas) |
| `refresh_token` | string | Usado para renovar; expira em ~30 dias |
| `expire_in`     | int    | Tempo em segundos até a expiração |

> `TODO`: Confirmar duração exata do refresh token na doc Shopee (atualizada em 10/02/2026).

### 2.4. Etapa 4 — Refresh Token

**Endpoint**: `POST /api/v2/auth/access_token/get`

**Body**:
```json
{
  "refresh_token": "REFRESH_TOKEN_STRING",
  "shop_id": 123456789,
  "partner_id": 1234567
}
```

**Response**: mesma estrutura de token/get, retornando novos `access_token` e `refresh_token`.

---

## 3. Assinatura de Requests (HMAC-SHA256)

Todas as chamadas à API v2 da Shopee precisam de uma **assinatura** calculada
como HMAC-SHA256.

### 3.1. Fórmula

```
base_string = partner_id + path + timestamp + access_token + shop_id
sign = HMAC-SHA256(partner_key, base_string)
```

**Pseudocódigo (TypeScript)**:
```typescript
import crypto from 'crypto';

function signRequest(
  partnerId: number,
  partnerKey: string,
  path: string,        // ex.: "/api/v2/order/get_order_list"
  timestamp: number,    // Unix seconds
  accessToken: string,
  shopId: number
): string {
  const baseString =
    `${partnerId}${path}${timestamp}${accessToken}${shopId}`;
  return crypto
    .createHmac('sha256', partnerKey)
    .update(baseString)
    .digest('hex');
}
```

### 3.2. Onde enviar a assinatura

A assinatura e os common params vão como **query parameters** na URL:

```
https://partner.shopeemobile.com/api/v2/order/get_order_list
  ?partner_id=1234567
  &timestamp=1707609600
  &access_token=TOKEN
  &shop_id=123456789
  &sign=CALCULATED_HMAC
```

> `TODO`: Confirmar na doc Shopee se o host para Brasil é
> `partner.shopeemobile.com` ou `partner.shopeebr.com` (atualizada em 10/02/2026).

---

## 4. Common Parameters (obrigatórios em toda request)

| Param          | Tipo   | Onde    | Descrição |
|----------------|--------|--------|-----------|
| `partner_id`   | int64  | query  | Seu Partner ID |
| `timestamp`    | int    | query  | Unix timestamp (segundos) |
| `access_token` | string | query  | Token retornado no auth |
| `shop_id`      | int64  | query  | ID da loja autorizada |
| `sign`         | string | query  | HMAC-SHA256 calculado |

---

## 5. Variáveis de Ambiente Padronizadas

O sistema MLH deve usar as seguintes env vars:

```env
# Shopee — credenciais da aplicação parceira
SHOPEE_PARTNER_ID=         # int64
SHOPEE_PARTNER_KEY=        # string (secret)

# Shopee — tokens da loja conectada
SHOPEE_SHOP_ID=            # int64
SHOPEE_ACCESS_TOKEN=       # string
SHOPEE_REFRESH_TOKEN=      # string

# Shopee — configuração
SHOPEE_API_HOST=partner.shopeemobile.com   # TODO: confirmar host Brasil
SHOPEE_API_VERSION=v2                       # TODO: confirmar se migrou para v3
```

---

## 6. Cuidados de Segurança

1. **Partner Key** nunca deve ser exposta no front-end ou em logs.
2. **Access Token** deve ser armazenado criptografado no banco.
3. **Refresh Token** deve ser renovado proativamente (5 min antes de expirar).
4. **Timestamp** deve ter drift máximo de ±5 minutos vs. servidor Shopee.
5. Todas as chamadas devem ser feitas via **HTTPS**.

---

## 7. TODOs pendentes

| # | Item | Status |
|---|------|--------|
| 1 | Confirmar path exato de auth_partner (v2 vs v3) | `TODO` |
| 2 | Confirmar host da API para Brasil | `TODO` |
| 3 | Confirmar duração do refresh token (30 dias?) | `TODO` |
| 4 | Confirmar se há rate limit específico para /auth/* | `TODO` |
| 5 | Capturar sample real de response de /auth/token/get | `TODO` |
