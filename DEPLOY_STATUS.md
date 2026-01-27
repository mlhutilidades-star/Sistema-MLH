# ✅ DEPLOY STATUS — Sistema MLH

**Data:** 2026-01-27

## URLs de Produção
- Frontend: https://sistema-mlh-frontend-production.up.railway.app
- Backend: https://api-backend-production-af22.up.railway.app

## Status Atual
- Healthcheck Backend: OK
- Healthcheck Frontend: OK
- Endpoints críticos: OK (relatórios exigem `dataInicio`/`dataFim`)
- Automações semanais: HABILITADAS
- Alertas: HABILITADOS (aguardando webhook Slack real e/ou SMTP)

## Pendências para “100% pronto”
1. Inserir webhook real do Slack do Grupo MLH em `ALERTS_SLACK_WEBHOOK_URL` e confirmar recebimento.
2. (Opcional) Configurar SMTP para envio por email (ou decidir “somente Slack”).
3. Executar smoke test completo na UI com `OAUTH_ADMIN_SECRET` real (edição de custo + otimização + relatório).
4. Adicionar screenshots em `docs/screenshots/` e referenciar no README.

## Última validação técnica (2026-01-27)
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
