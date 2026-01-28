# ✅ DEPLOY STATUS — Sistema MLH

**Data:** 2026-01-28

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

## Comandos úteis (Railway)
```bash
railway variables set -s api-backend ALERTS_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
railway variables set -s api-backend ALERTS_EMAIL_ENABLED=true ALERTS_SMTP_HOST=... ALERTS_SMTP_PORT=587 ALERTS_SMTP_USER=... ALERTS_SMTP_PASS=... ALERTS_EMAIL_TO=equipe@grupomlh.com
railway ssh -s api-backend node dist/scripts/triggerTestAlert.js
```
