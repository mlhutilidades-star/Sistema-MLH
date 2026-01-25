# Sistema MLH — Status Operacional

## Status (última validação)

Validação em produção (Railway) em **2026-01-25**.

- Projeto Railway: `sistema-mlh-prod`
- Serviço: `api-backend`
- Base URL: https://api-backend-production-af22.up.railway.app

- Health check: **OK** (`/health` retorna `healthy` e DB `connected`)
- Shopee OAuth v2: **OK** (tokens obtidos e persistidos no Railway)
- Shopee Products/Orders (runtime): **OK**
- Tiny (runtime /produtos.pesquisa): **OK**
- Sync manual Shopee (dentro do container): **OK**
  - Produtos: 112 processados
  - Shopee Ads: endpoint 404 → **pulado** (warning) para não derrubar o sync

Contagens do banco (via `scripts/monitor-health.js` no container):

- `produtos`: 516
- `contasPagar`: 4
- `contasReceber`: 4
- `extratosBanco`: 0

## Checklist de variáveis (Railway)

### Banco
- `DATABASE_URL`

### Shopee (Open Platform v2)
- `SHOPEE_PARTNER_ID`
- `SHOPEE_PARTNER_KEY`
- `SHOPEE_SHOP_ID`
- `SHOPEE_ACCESS_TOKEN`
- `SHOPEE_REFRESH_TOKEN`

### Tiny
- `TINY_API_KEY`
- `TINY_BASE_URL` (opcional)
  - Se você usa token “clássico” do Tiny (API2), pode setar `https://api.tiny.com.br/api2`.
  - Mesmo que fique `https://api.tiny.com.br/api/v3`, o backend agora faz fallback automático para API2 quando usar endpoints legados `*.pesquisa/*.obter`.

### Segurança (admin)
- `OAUTH_ADMIN_SECRET` (protege endpoints admin do OAuth)

## Fluxo Shopee OAuth (tokens)

1) Autorizar e capturar callback
- Endpoint de authorize: `/api/shopee/oauth/authorize-url`
- Callback: `/api/shopee/oauth/callback`
- Ver último callback: `/api/shopee/oauth/last`

2) Trocar code por tokens (admin)
- `POST /api/shopee/oauth/exchange`
- Header: `x-admin-secret: <OAUTH_ADMIN_SECRET>`

## Testes rápidos (runtime)

No serviço do Railway (recomendado):

- Teste integrações:
  - `node scripts/test-integrations.js`
  - Observação: o teste Tiny aceita `status_processamento` como string/número e também `status=OK` (fallback API2).

Local (com `.env` preenchido):

- Build:
  - `cd backend && npm run build`

- Rodar testes de integração (compilado):
  - `cd backend && node scripts/test-integrations.js`

## Sync manual

Importante: tarefas que acessam o Postgres privado devem rodar **dentro do container** (evitar `railway run`, que pode falhar com Prisma `P1001`).

- Sync Shopee (dentro do container):
  - `railway ssh -s api-backend node dist/scripts/sync.js --service=shopee`

- Sync Tiny (dentro do container):
  - `railway ssh -s api-backend node dist/scripts/sync.js --service=tiny`

- Sync completo (dentro do container):
  - `railway ssh -s api-backend node dist/scripts/sync.js --service=all`

## Observações

- Tiny: os métodos atuais do backend (`produtos.pesquisa`, `produto.obter`, `estoque.busca`, etc) são endpoints “legados” do Tiny e requerem POST com form-urlencoded (API2). O client agora faz isso automaticamente.
- Shopee: tokens podem vir em formatos diferentes (com/sem `response`); o parser já normaliza.

## Monitoramento (recomendado)

- Uptime externo: configurar um monitor (ex: UptimeRobot/BetterUptime) para checar `GET /health` a cada 1–5 min e alertar em falha.
- Script de health + contagens do DB (manual/cron externo):
  - `railway ssh -s api-backend node scripts/monitor-health.js`

## 💰 Gestão de Margem e Lucro

- Fórmula: **Lucro Real = Renda Líquida (Escrow Shopee) - Custo Real (Tiny)**.
- Renda Líquida: `escrow_amount` do `order.get_order_detail` (Shopee).
- Custo Real: `Produto.custoReal` (Tiny) buscado por SKU.
- Regra de catálogo: o sistema **ignora produtos do Tiny** que não estejam à venda na Shopee; o sync parte dos SKUs da Shopee.
- Sync automático a cada 4 horas mantém produtos/pedidos atualizados.

### Comandos

- Calcular margem completa (produtos + pedidos) em produção:
  - `railway ssh -s api-backend node dist/scripts/sync.js --service=shopee --full-margin-calc`

### Relatórios

- Lista simples (pedido, renda, custo, lucro, margem):
  - `GET /api/relatorios/margem`
- Detalhado por pedidos:
  - `GET /api/relatorios/lucro-pedidos`
- Agregado por produto (SKU):
  - `GET /api/relatorios/lucro-produtos`
- Anúncios (quando houver dados em ConsumoAds):
  - `GET /api/relatorios/lucro-anuncios`
