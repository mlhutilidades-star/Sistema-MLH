# Integração com TikTok Shop

## Informações Básicas
- **API Base URL**: https://api.tiktokshop.com
- **Documentação Oficial**: https://seller.tiktokshop.com/developer
- **Status**: Plataforma em crescimento (2023+)

## Primeiros Passos

### 1. Registrar na Plataforma
1. Acesse: https://seller.tiktokshop.com
2. Realize o cadastro como vendedor
3. Complete verificação de identidade
4. Aguarde aprovação

### 2. Criar App de Integração
1. Acesse Developer Console
2. Clique em "Create App"
3. Selecione "e-commerce"
4. Preencha informações da aplicação

### 3. Obter Credenciais
Você receberá:
- **Client ID**: ID da sua aplicação
- **Client Secret**: Chave secreta (guarde com segurança)
- **Authorization URL**: URL de autorização OAuth 2.0

## Autenticação

### Fluxo OAuth 2.0

**Etapa 1: Redirecionar Usuário**
```
GET https://auth.tiktokshop.com/oauth/authorize?
    client_id=YOUR_CLIENT_ID&
    redirect_uri=YOUR_REDIRECT_URI&
    response_type=code&
    scope=openid,shop.basic,products.read,orders.read
```

**Etapa 2: Receber Código**
```
https://your-redirect-uri.com?code=AUTH_CODE&state=STATE
```

**Etapa 3: Trocar por Access Token**
```
POST https://api.tiktokshop.com/v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
client_id=YOUR_CLIENT_ID&
client_secret=YOUR_CLIENT_SECRET&
code=AUTH_CODE&
redirect_uri=YOUR_REDIRECT_URI
```

**Response**:
```json
{
  "access_token": "ey...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "eyJ...",
  "scope": "openid shop.basic products.read orders.read"
}
```

### Usar Token em Requisições

```
Authorization: Bearer YOUR_ACCESS_TOKEN
X-Client-ID: YOUR_CLIENT_ID
```

## Recursos Principais

### Loja
- Obter informações da loja
- Atualizar configurações
- Gerenciar categorias

### Produtos
- Listar produtos
- Criar/editar produtos
- Gerenciar variações
- Controlar estoque

### Pedidos
- Listar pedidos
- Obter detalhes do pedido
- Atualizar status
- Rastrear envios

### Análises
- Dados de vendas
- Tráfego da loja
- Produtos populares

## Rate Limiting
- **Limite**: Varia por endpoint
- **Típico**: 100 requisições por minuto
- **Retry-After**: Header indica tempo de espera

## Escopos de Permissão

| Escopo | Descrição |
|--------|-----------|
| `openid` | Informações básicas de usuário |
| `shop.basic` | Informações básicas da loja |
| `products.read` | Ler informações de produtos |
| `products.write` | Criar/editar produtos |
| `orders.read` | Ler informações de pedidos |
| `orders.write` | Atualizar pedidos |
| `logistics.read` | Ler informações de envios |
| `analytics.read` | Acessar dados analíticos |

## Próximos Passos
Consulte os arquivos específicos para cada recurso:
- `02_TIKTOKSHOP_AUTENTICACAO.md`
- `03_TIKTOKSHOP_PRODUTOS.md`
- `04_TIKTOKSHOP_PEDIDOS.md`

## Observações Importantes

1. **Ambiente Sandbox**
   - Use https://api-sandbox.tiktokshop.com para testes
   - Cada request precisa de `X-Sandbox-Mode: true`

2. **Timestamps**
   - Use milliseconds (não segundos)
   - Format: Unix timestamp * 1000

3. **Paginação**
   - Use `cursor` para navegação
   - Máximo 100 itens por página

4. **Webhooks**
   - Configure para receber atualizações em tempo real
   - Todos os eventos incluem assinatura (HMAC-SHA256)

5. **IDs**
   - Shop ID
   - Product ID
   - Order ID
   - Buyer ID

## Mercados Suportados
- Estados Unidos
- Brasil
- Indonésia
- Vietnã
- Tailândia
- Filipinas
- Malásia
- Singapura
- Reino Unido
- França
- Espanha
- Itália
- Alemanha

## Links Úteis
- [Seller Center](https://seller.tiktokshop.com)
- [Developer Console](https://seller.tiktokshop.com/developer)
- [API Documentation](https://developer.tiktokshop.com)
- [Support Center](https://support.tiktokshop.com)
