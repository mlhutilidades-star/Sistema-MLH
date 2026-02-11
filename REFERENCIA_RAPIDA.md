# Índice de Referência Rápida

## Documentação por Tópico

### 🔐 Autenticação
| Marketplace | Tipo | Duração | Referência |
|------------|------|---------|-----------|
| Mercado Livre | OAuth 2.0 | 6h (access) | [02_AUTENTICACAO.md](docs/mercado-livre/02_AUTENTICACAO.md) |
| Shopee | API Key + Token | 24h | [01_INTRODUCAO.md](docs/shopee/01_INTRODUCAO.md) |
| TikTok Shop | OAuth 2.0 | 1h (access) | [01_INTRODUCAO.md](docs/tiktok-shop/01_INTRODUCAO.md) |

### 📦 Produtos
| Operação | Mercado Livre | Shopee | TikTok Shop |
|----------|---|---|---|
| Listar | GET /items | GET /product/get_item_list | GET /products |
| Criar | POST /items | POST /product/add_item | POST /products |
| Atualizar | PUT /items/{id} | POST /product/update_item | PUT /products/{id} |
| Deletar | PUT /items/{id} (status) | POST /product/delete_item | DELETE /products/{id} |

### 📦 Pedidos
| Operação | Mercado Livre | Shopee | TikTok Shop |
|----------|---|---|---|
| Listar | GET /orders/search/seller | GET /order/get_order_list | GET /orders |
| Detalhe | GET /orders/{id} | GET /order/get_order | GET /orders/{id} |
| Atualizar | Webhook | Webhook/Polling | Webhook |

## URLs Importantes

### Developers
- 🔗 [Mercado Livre DevCenter](https://developers.mercadolivre.com.br/devcenter)
- 🔗 [Shopee Open Platform](https://open.shopee.com/documents)
- 🔗 [TikTok Shop Developer](https://seller.tiktokshop.com/developer)

### Plataformas
- 🛒 [Mercado Livre Brasil](https://www.mercadolivre.com.br)
- 🛒 [Shopee Brasil](https://www.shopee.com.br)
- 🛒 [TikTok Shop](https://www.tiktokshop.com)

## Erros Comuns e Soluções

### 401 Unauthorized
```
Problema: Token expirado ou inválido
Solução:  Renovar token usando refresh_token
```

### 403 Forbidden
```
Problema: Sem permissão para acessar recurso
Solução:  Verificar escopos de permissão
```

### 404 Not Found
```
Problema: Recurso não existe
Solução:  Verificar ID do produto/pedido
```

### 429 Too Many Requests
```
Problema: Rate limit atingido
Solução:  Implementar exponential backoff
          Aguardar segundo aviso em header Retry-After
```

### 500 Internal Server Error
```
Problema: Erro interno do servidor
Solução:  Retry com backoff exponencial
          Contatar suporte da plataforma
```

## Rate Limits

| Marketplace | Limite | Janela | Link |
|-------------|--------|--------|------|
| Mercado Livre | 600 | 10 min | [Documentação](docs/mercado-livre/01_INTRODUCAO.md) |
| Shopee | 10.000 | 24h | [Documentação](docs/shopee/01_INTRODUCAO.md) |
| TikTok Shop | ~100 | 1 min | [Documentação](docs/tiktok-shop/01_INTRODUCAO.md) |

## Headers HTTP Obrigatórios

### Mercado Livre
```
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

### Shopee
```
Authorization: Bearer ACCESS_TOKEN
X-Shop-ID: SHOP_ID
Content-Type: application/json
```

### TikTok Shop
```
Authorization: Bearer ACCESS_TOKEN
X-Client-ID: CLIENT_ID
Content-Type: application/json
```

## Webhooks - Configuração

### URL Obrigatória: HTTPS
```
✅ https://seu-app.com/webhooks/meli
❌ http://seu-app.com/webhooks/meli
```

### Timeout Máximo
| Marketplace | Timeout |
|-------------|---------|
| Mercado Livre | 22 segundos |
| Shopee | 5 segundos |
| TikTok Shop | 10 segundos |

### Resposta Esperada
```
HTTP/1.1 200 OK
Content-Type: application/json

{"status": "ok"}
```

## Fluxos de Integração

### 1. Autenticação do Usuário
```
1. Gerar URL de autorização
2. Redirecionar usuário
3. Receber código de autorização
4. Trocar código por access token
5. Armazenar tokens com segurança
```

### 2. Listar Produtos
```
1. Autenticar
2. Chamar GET /products (ou equivalente)
3. Processar response
4. Salvar no banco de dados com IDs externos
```

### 3. Publicar Produto
```
1. Autenticar
2. Validar dados por marketplace
3. POST /products com dados do produto
4. Salvar ID externo
5. Sincronizar para outros marketplaces
```

### 4. Sincronizar Pedidos
```
Mercado Livre:
1. Receber webhook de novo pedido
2. Verificar webhook (X-MELI-DELIVERY-ID)
3. Buscar dados completos da API
4. Processar e salvar

Shopee:
1. Fazer polling a cada 5 minutos
2. Comparar com última sincronização
3. Processar pedidos novos

TikTok Shop:
1. Receber webhook
2. Validar assinatura HMAC
3. Buscar dados completos
4. Processar e salvar
```

## Variáveis de Ambiente Necessárias

```env
# Mercado Livre
MELI_CLIENT_ID=
MELI_CLIENT_SECRET=
MELI_REDIRECT_URI=

# Shopee
SHOPEE_PARTNER_ID=
SHOPEE_PARTNER_KEY=

# TikTok Shop
TIKTOK_CLIENT_ID=
TIKTOK_CLIENT_SECRET=
TIKTOK_REDIRECT_URI=

# Banco de Dados
DATABASE_URL=

# Webhook
WEBHOOK_SECRET_MELI=
WEBHOOK_SECRET_SHOPEE=
WEBHOOK_SECRET_TIKTOK=
```

## Checklist de Deployment

- [ ] Configurar HTTPS em todas as URLs
- [ ] Gerar secrets seguros para webhooks
- [ ] Configurar variáveis de ambiente
- [ ] Criar banco de dados
- [ ] Executar migrations
- [ ] Configurar logging e monitoramento
- [ ] Testar autenticação
- [ ] Testar webhooks
- [ ] Configurar rate limiting
- [ ] Implementar circuit breaker
- [ ] Testar fallback em caso de falha
- [ ] Documentar runbooks

## Recursos de Código

- [Exemplo de Cliente Python](EXEMPLO_CODIGO.md)
- [Arquitetura do Sistema](ARQUITETURA.md)
- [Checklist de Desenvolvimento](CHECKLIST.md)
- [README com Quick Start](README.md)

## Contatos de Suporte

| Marketplace | Canal |
|-------------|-------|
| Mercado Livre | [Formulário de Denúncias](https://forms.gle/KZphgzp9Dj2zhr9k8) |
| Shopee | [Seller Support](https://seller.shopee.com.br) |
| TikTok Shop | [Support Center](https://support.tiktokshop.com) |

## Atualizações Registradas

| Data | Marketplace | Mudança |
|------|-------------|---------|
| 2024-01 | Mercado Livre | IDs Int64 para novos usuários |
| 2024-06 | Mercado Livre | Campo payment_id alfanumérico no MLB |
| 2024-12 | TikTok Shop | Sandbox environment disponível |

## Topicos Para Estudo Aprofundado

- [ ] Implementar PKCE flow (Mercado Livre)
- [ ] Criptografar tokens no banco de dados
- [ ] Implementar circuit breaker
- [ ] Rate limiting distribuído com Redis
- [ ] Caching com TTL
- [ ] Monitoramento e alertas
- [ ] Análise de performance
- [ ] Testes de carga
- [ ] Disaster recovery
- [ ] Multi-tenant architecture

---

**Última atualização**: Fevereiro 2026
**Documentação completa**: Ver pasta `docs/`
