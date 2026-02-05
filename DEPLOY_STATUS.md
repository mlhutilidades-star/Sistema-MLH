# ✅ DEPLOY STATUS — Sistema MLH

**Data:** 2026-02-04

## URLs de Produção
- Frontend: https://sistema-mlh-frontend-production.up.railway.app
- Backend: https://api-backend-production-af22.up.railway.app

## Status

**SISTEMA OPERACIONAL ✅**

## Status Atual
- Healthcheck Backend: ✅ OK
- Healthcheck Frontend: ✅ OK
- Endpoints críticos: ✅ OK (relatórios exigem `dataInicio`/`dataFim`)
- Fluxo de edição de custos (impacto em lucro/margem): ✅ OK (recalcula imediatamente)
- Relatórios (PDF semanal): ✅ GERADO (distribuição automática opcional)
- Automações semanais: ✅ HABILITADAS
- UX Produtos: ✅ Removida exibição de preço de venda; custo é o único campo editável
- Página Anúncios (catálogo Shopee): ✅ DESACOPLADA de Ads (usa Product API)
- Página Anúncios (rentabilidade): ✅ SIMPLIFICADA (resumo no topo, tabela enxuta, detalhes por variação)
- Shopee OAuth: ⚠️ REAUTORIZAÇÃO PENDENTE (tokens limpos para forçar fluxo novo)
- Sync catálogo Shopee: ⚠️ PENDENTE (aguardando nova autorização)

## Validação pós-deploy (2026-02-04 20:25Z)
- Deploy Railway: ✅ Serviço ativo (health OK); mensagens de startup não apareceram no tail recente
- `GET /health`: ✅ 200 (database: connected)
- `GET /api/anuncios?limit=5`: ✅ 200 (total=112)
- `GET /api/anuncios/rentabilidade?limit=5`: ✅ 200 (total=112; semCusto=18)
- `GET /api/shopee/token-status`: ⚠️ PENDENTE (requer `x-admin-secret`)
- Sync status: ⚠️ sem logs de sync no tail recente (última atividade visível: 404 Shopee item_detail)
- Resiliência Shopee: ✅ logs de stats (cacheHitRate=0%, rateLimitCount=0, breakerOpenCount=0)
- Frontend /anuncios: ⚠️ página aberta; validação de filtros/busca/ordenação/paginação requer verificação manual no navegador

## Shopee — renda líquida (escrow) ✅

- Correção aplicada: quando `get_order_detail` retorna `escrow_amount=0/ausente`, o backend consulta `/payment/get_escrow_detail` e usa `response.order_income.escrow_amount` como **renda líquida real**.
- Evidência (caso real): pedido `260123SMBEYS4B` (23/01/2026) foi corrigido para `rendaLiquida = 42.36` (custo 35.97; lucro 6.39; margem ~15.1%).

### Endpoints admin úteis (produção)

> Todos exigem header `x-admin-secret` (mesmo valor de `OAUTH_ADMIN_SECRET`).

- Debug do pedido na Shopee (não persiste): `GET /api/shopee/orders/:orderSn/debug`
- Reprocessamento DB-only (corrige renda via soma de itens, sem chamar Shopee):
	- `POST /api/shopee/reprocess-profit?days=30`
	- `GET /api/shopee/reprocess-profit/status`
- Reprocessamento via Shopee API (recalcula margem/lucro usando Shopee, incluindo escrow detail):
	- `POST /api/shopee/reprocess-profit-from-shopee?days=30`
	- `GET /api/shopee/reprocess-profit-from-shopee/status`

## Shopee — OAuth auto-refresh (ERP-like)

O backend suporta persistência de tokens no Postgres e refresh automático para evitar expiração silenciosa.

- Persistência: tabela `shopee_tokens` (com backup do token anterior)
- Callback OAuth: tabela `shopee_oauth_callbacks`
- Refresh automático: cron no backend (padrão: a cada 3 horas) + lógica condicional
  - refresh quando access token expira em < 1h (`SHOPEE_OAUTH_IF_EXPIRING_IN_SEC`, default 3600)
  - e/ou quando refresh token entra na janela de risco (`SHOPEE_OAUTH_FORCE_REFRESH_TOKEN_DAYS`, default 5)

### Endpoints admin (monitoramento)

- Status: `GET /api/shopee/oauth/status` (alias: `GET /api/shopee/token-status`)
- Trocar code por tokens (salva no DB): `POST /api/shopee/oauth/exchange`
- Refresh manual (salva no DB): `POST /api/shopee/oauth/refresh`

### UI (Config)

- Página: https://sistema-mlh-frontend-production.up.railway.app/config
- Seção **Shopee OAuth**:
	- **Autorizar Shopee** (abre popup)
	- **Concluir autorização** (exchange do `code` salvo pelo callback)
	- **Refresh agora**
	- Status de tokens + auto-refresh de status (~30s)

### Observação

Reautorização normalmente é **1x** (como ERPs), mas pode ser necessária novamente se a Shopee revogar permissões/app ou se o refresh token já tiver expirado.

## Ressalvas (podem ser ativadas depois)
- Notificações Slack: ⚠️ PENDENTE (webhook real pode ser configurado depois)
- Email automático: ⚠️ PENDENTE (SMTP pode ser configurado depois)
- Distribuição automática de relatórios: ⚠️ PENDENTE (nenhum canal configurado no momento)

## Checklist final (validado)
- ✅ Health checks funcionando
- ✅ Fluxo de edição de custos validado (recalcula lucro/margem)
- ✅ Relatórios gerados
- ✅ Interface responsiva (frontend em produção)
- ✅ Documentação atualizada
- ⚠️ Notificações (Slack/Email): pendente (ativar quando necessário)

## Última validação técnica (2026-01-28)
- `GET /health` backend: OK
- `GET /health` frontend: OK
- `GET /api/relatorios/lucro-total?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD`: OK
- `triggerTestAlert`: falha esperada enquanto webhook/SMTP reais não forem configurados

## Anúncios (Catálogo Shopee)

- Fonte de verdade: **Product API** (catálogo/listings), não Ads.
- Endpoint (catálogo bruto): `GET /api/anuncios` (retorna nome, sku/item_id, status, preço, estoque, updated_at; opcional: variações).
- Endpoint (rentabilidade): `GET /api/anuncios/rentabilidade` (consolida por `item_id`, calcula custo/lucro/margem estimados, resumo no topo e filtros rápidos).
- Ads permanece separado em `/api/ads/**` e o sistema tolera 404 ("Ads indisponível").

### Comandos úteis (produção)

```bash
# Sync catálogo Shopee (listings)
railway ssh -s api-backend -- node dist/scripts/sync.js --service=shopee --anuncios --days=30

# Verificar contagem no banco (via psql no container)
railway ssh -s api-backend -- psql "$DATABASE_URL" -c "SELECT COUNT(*) AS total_anuncios FROM anuncios;"

# Checar status Ads (best-effort)
curl "https://api-backend-production-af22.up.railway.app/api/ads/status"
```

## Comandos úteis (Railway)
```bash
railway variables set -s api-backend ALERTS_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
railway variables set -s api-backend ALERTS_EMAIL_ENABLED=true ALERTS_SMTP_HOST=... ALERTS_SMTP_PORT=587 ALERTS_SMTP_USER=... ALERTS_SMTP_PASS=... ALERTS_EMAIL_TO=equipe@grupomlh.com
railway ssh -s api-backend node dist/scripts/triggerTestAlert.js
```
