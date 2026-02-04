# 🚀 Sistema MLH - Integração Tiny ERP v3 + Shopee Open API v2

> **Status:** ✅ SISTEMA OPERACIONAL E FUNCIONAL (produção)  
> **Versão:** 1.0.1  
> **Data:** 2026-01-28

---

## ⚡ INÍCIO RÁPIDO

### 🎯 Você está em: Setup Automático Completo

**O que já foi feito:**
- ✅ Backend completo implementado (5.000+ linhas)
- ✅ Railway configurado (projeto + PostgreSQL)
- ✅ Documentação extensiva (2.500+ linhas)
- ✅ Scripts de automação e teste
- ✅ JWT_SECRET gerado

**Próximo passo:** Deploy em 20 minutos

### 📖 Documentação Essencial

| Para quê | Arquivo | Tempo |
|----------|---------|-------|
| 🚀 **Deploy Rápido** | [GUIA_RAPIDO.md](GUIA_RAPIDO.md) | 5 min |
| 📚 **Navegar Docs** | [INDEX.md](INDEX.md) | 2 min |
| 📖 **Guia Completo** | [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) | 30 min |
| ✅ **Validação** | [CHECKLIST_DEPLOY.md](CHECKLIST_DEPLOY.md) | 20 min |

### 🎯 3 Passos para Deploy

```bash
# 1. Obter credenciais (Tiny + Shopee)
# 2. Configurar Railway (variáveis)
# 3. Deploy
cd backend
railway service
railway up
```

**Detalhes:** Ver [GUIA_RAPIDO.md](GUIA_RAPIDO.md)

---

## ✅ Produção (Railway)

- 🌐 URL Frontend: https://sistema-mlh-frontend-production.up.railway.app
- ⚙️ URL Backend: https://api-backend-production-af22.up.railway.app

### 🟢 Status operacional

- Healthcheck Backend: OK
- Healthcheck Frontend: OK
- Alertas/Relatórios: habilitados (env vars), aguardando credenciais reais de Slack/Email

### 🧾 Anúncios (Catálogo Shopee)

A página `/anuncios` **não depende de Ads** (que pode retornar 404 dependendo da conta/permissão). Ela mostra uma visão **consolidada por anúncio (`item_id`)** e focada em **rentabilidade**, agrupando variações (`model_id`).

**UI simplificada (rentabilidade):**
- Resumo no topo (anúncios ativos, estoque valorizado, lucro total, margem média, pendências de custo)
- Tabela enxuta por anúncio (preço médio, estoque total, custo, lucro e margem)
- Detalhes por clique com variações + edição de custo e mapeamento SKU Shopee → Tiny
- Filtros rápidos (alta margem, baixo estoque, sem custo)

- API (catálogo bruto): `GET /api/anuncios` (filtros: `q`, `status`, `sku`, `shopId`, `dataInicio`, `dataFim`, `page`, `limit`)
- API (rentabilidade consolidada): `GET /api/anuncios/rentabilidade` (filtros: `status`, `margemMinima`, `estoqueMinimo`, `semCusto`, `page`, `limit`, `sort`)
- Sync (produção):

```bash
railway ssh -s api-backend -- node dist/scripts/sync.js --service=shopee --anuncios --days=30
```

Ads continua separado em `/api/ads/**` e o backend expõe `GET /api/ads/status` para avisar quando Ads estiver indisponível.

### ⏱️ Guia de primeiros passos (5 minutos)

1. Acesse https://sistema-mlh-frontend-production.up.railway.app/config
2. Cole o `OAUTH_ADMIN_SECRET` e salve.
3. Vá em **Pedidos** e valide um SKU.
4. Abra **Otimização** e gere sugestões.
5. (Opcional) Ajuste preço via botão **Aplicar Ajuste**.

### ❓ FAQ rápido

- **Não consigo aplicar ajuste de preço**: confirme `OAUTH_ADMIN_SECRET` na tela Config.
- **Relatório semanal não apareceu**: verifique `WEEKLY_AUTOMATION_ENABLED=true` e o cron no backend.
- **Alertas não chegam no Slack**: configure `ALERTS_SLACK_WEBHOOK_URL` no Railway.

### 🧾 Shopee — renda líquida (escrow) e correções

- Regra de verdade para **renda líquida**: usar o valor de escrow (repasse) retornado pela Shopee.
- Observação importante: em alguns pedidos, o endpoint de pedido (`get_order_detail`) pode retornar `escrow_amount=0/ausente` mesmo quando existe repasse real.
- Solução aplicada no backend: quando isso acontece, o sync consulta `/payment/get_escrow_detail` e usa `response.order_income.escrow_amount`.

**Validação em produção (admin):**

- Debug de um pedido (não persiste no banco): `GET /api/shopee/orders/:orderSn/debug` (header `x-admin-secret`).
- Reprocessar lucro/margem usando Shopee (server-side): `POST /api/shopee/reprocess-profit-from-shopee?days=30` (header `x-admin-secret`).
- Ver status do job: `GET /api/shopee/reprocess-profit-from-shopee/status` (header `x-admin-secret`).

### 🔐 Shopee — OAuth resiliente (tokens no banco + refresh automático)

Para evitar o cenário comum de **refresh token expirar** e o sistema ficar dias sem sincronizar, o backend agora suporta:

- Persistência de tokens no Postgres (tabela `shopee_tokens`) com **backup do token anterior**.
- Persistência do último callback OAuth (tabela `shopee_oauth_callbacks`) para facilitar o fluxo de troca/exchange.
- Script de refresh diário + endpoint de status.

**Endpoints (admin, header `x-admin-secret`):**

- Status de tokens: `GET /api/shopee/oauth/status` (alias: `GET /api/shopee/token-status`)
- URL de autorização: `GET /api/shopee/oauth/authorize-url`
- Callback (Shopee redireciona aqui): `GET /api/shopee/oauth/callback`
- Trocar code por tokens (e salvar no DB): `POST /api/shopee/oauth/exchange`
- Refresh manual (e salvar no DB): `POST /api/shopee/oauth/refresh`

**UI (recomendado):**

- A tela https://sistema-mlh-frontend-production.up.railway.app/config possui a seção **Shopee OAuth** com:
  - Botão **Autorizar Shopee** (abre popup/aba com a autorização)
  - Botão **Concluir autorização** (troca o `code` por tokens no backend)
  - Botão **Refresh agora**
  - Status de tokens (access/refresh, expiração, último refresh e último erro)
  - Auto-atualização do status a cada ~30s

**Passo-a-passo (produção):**

1. Acesse https://sistema-mlh-frontend-production.up.railway.app/config
2. Cole o `OAUTH_ADMIN_SECRET` (fica salvo no navegador).
3. Em **Shopee OAuth**, clique em **Autorizar Shopee** e conclua no popup.
4. Ao voltar, clique em **Concluir autorização** (se não concluir automaticamente).
5. Verifique o status (deve ficar **Ativo** e `needsReauth=false`).

**Job/Script:**

- Rodar refresh manual: `cd backend && npm run shopee:refresh-token`
- Habilitar refresh automático no servidor (padrão: a cada 3 horas):
  - `SHOPEE_OAUTH_AUTO_REFRESH=true`
  - (opcional) `SHOPEE_OAUTH_REFRESH_CRON="0 */3 * * *"`
  - (opcional) `SHOPEE_OAUTH_IF_EXPIRING_IN_SEC=3600` (refresh quando access expira em < 1h)
  - (opcional) `SHOPEE_OAUTH_FORCE_REFRESH_TOKEN_DAYS=5` (renova refresh token antes de expirar)

**Notas operacionais:**

- Por padrão, o backend tenta usar tokens do DB primeiro (`SHOPEE_TOKEN_USE_DB!=false`), com fallback para env vars.
- Se `refreshTokenExpiresAt` não vier da Shopee, o campo pode ficar `null`; nesse caso o sistema mantém refresh frequente para evitar expiração.
- Reautorização normalmente é **apenas 1x** (como ERPs), mas pode ser necessária novamente se a Shopee revogar o app/permissões ou se o refresh token já tiver expirado.

### 🧑‍💼 Contatos de suporte

- Suporte MLH: (preencher nome + WhatsApp/email)
- Operações/DevOps: (preencher nome + WhatsApp/email)

### 🔔 Como ativar notificações (futuro)

O sistema já suporta alertas (Slack/email) e distribuição de relatório semanal. Para ativar quando necessário:

- **Slack** (recomendado): configure `ALERTS_SLACK_WEBHOOK_URL` no Railway do serviço `api-backend`.
- **Email** (opcional): configure `ALERTS_EMAIL_ENABLED=true` e as variáveis SMTP no Railway.

Depois de configurar, use o teste de alerta:

```bash
railway ssh -s api-backend node dist/scripts/triggerTestAlert.js
```

### 🧭 Como usar (com screenshots)

> Adicione imagens em `docs/screenshots/` e referencie aqui.
> Exemplo: `docs/screenshots/config.png`, `docs/screenshots/pedidos.png`, `docs/screenshots/otimizacao.png`.

### 🔑 Guia rápido — Admin Secret na UI

1. Acesse https://sistema-mlh-frontend-production.up.railway.app/config
2. Cole o valor de `OAUTH_ADMIN_SECRET`.
3. Salve/valide. A UI passa a liberar ações administrativas (ex.: aplicar ajustes de preço).

### 📊 Guia de Relatórios — PDF semanal

- O relatório semanal é gerado automaticamente quando `WEEKLY_AUTOMATION_ENABLED=true`.
- O backend salva o PDF em `reports/` e registra o caminho no log (ex.: `reports/relatorio-semanal-AAAA-MM-DD.pdf`).
- Para visualizar, use o Railway SSH e copie o arquivo gerado (ou baixe via shell).

## 🖥️ Frontend (React)

O projeto inclui um frontend moderno em React em `frontend/`.

### Rodar local

```bash
cd frontend
npm install
npm run dev
```

### Variáveis (frontend)

- `VITE_API_BASE_URL` (obrigatório em produção): URL do backend (ex.: Railway)
- `VITE_GA_MEASUREMENT_ID` (opcional): GA4 (ex.: `G-XXXXXXXXXX`)

### Healthcheck

- O frontend expõe `GET /health` (usado pelo Railway).

### Otimização de preços

- Tela em `/otimizacao` consome `GET /api/otimizacao/precos`.
- Botão “Aplicar Ajuste” chama `PATCH /api/produtos/:id/preco-venda` e requer `x-admin-secret` (definido na tela Config).

### Produtos (custos)

- Tela em `/produtos` foca em **preço de custo** (único campo editável na listagem).
- O **preço de venda não é exibido** nessa tela para evitar decisões com base em valores inconsistentes.
- Mostra **status do custo** (ex.: `OK`, `PENDENTE`) e data de atualização do custo.
- Permite upload de planilha do Tiny para atualização em lote (exige `x-admin-secret`).

---

## 🔁 CI/CD (GitHub Actions)

- CI: [ci.yml](.github/workflows/ci.yml)
- Deploy opcional via Railway CLI: [deploy-railway.yml](.github/workflows/deploy-railway.yml)
- Para habilitar deploy automático, crie os secrets no GitHub: `RAILWAY_API_TOKEN` e `RAILWAY_PROJECT_ID` (e opcionalmente `RAILWAY_SERVICE_BACKEND`, `RAILWAY_SERVICE_FRONTEND`, `RAILWAY_ENVIRONMENT`).

---
# 🚀 Sistema MLH - Integração Tiny ERP v3 + Shopee Open API v2

Sistema completo de sincronização e gestão integrada entre **Tiny ERP v3** e **Shopee Open API v2** com PostgreSQL hospedado no **Railway**.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Tecnologias](#tecnologias)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Instalação e Configuração](#instalação-e-configuração)
- [Deploy no Railway](#deploy-no-railway)
- [Uso da API](#uso-da-api)
- [Sincronização Automática](#sincronização-automática)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

O Sistema MLH é uma solução completa para:

- ✅ Sincronizar produtos entre Tiny ERP e Shopee
- ✅ Gerenciar contas a pagar e receber
- ✅ Acompanhar performance de ads do Shopee
- ✅ Conciliar extratos bancários automaticamente
- ✅ Calcular custos reais e rentabilidade
- ✅ Ratear custos de ads proporcionalmente

---

## 🛠 Tecnologias

- **Backend**: Node.js 18+ com TypeScript
- **Framework**: Express.js
- **ORM**: Prisma
- **Banco de Dados**: PostgreSQL 15
- **Hospedagem**: Railway
- **Integrações**: 
  - Tiny ERP v3 API
  - Shopee Open API v2 (OAuth2 + HMAC-SHA256)

---

## 📁 Estrutura do Projeto

```
sistema-mlh/
├── backend/
│   ├── src/
│   │   ├── modules/            # Módulos de negócio
│   │   │   ├── produtos/       # Gestão de produtos
│   │   │   ├── financeiro/     # Contas a pagar/receber
│   │   │   ├── ads/           # Performance de ads
│   │   │   └── conciliacao/   # Conciliação bancária
│   │   ├── integrations/      # Clientes API externos
│   │   │   ├── tiny/          # Tiny ERP v3
│   │   │   └── shopee/        # Shopee v2
│   │   ├── shared/            # Código compartilhado
│   │   ├── app.ts             # App Express
│   │   └── server.ts          # Servidor
│   ├── prisma/
│   │   └── schema.prisma      # Schema do banco
│   ├── scripts/
│   │   ├── seed.ts           # Dados iniciais
│   │   └── sync.ts           # Sync manual
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── railway.json               # Config Railway
└── README.md
```

---

## 🚀 Instalação e Configuração

### 1. Pré-requisitos

- Node.js 18+ instalado
- PostgreSQL 15+ (ou usar Docker)
- Conta no Railway (gratuita)
- Chaves de API do Tiny e Shopee

### 2. Clonar e Instalar Dependências

```bash
cd sistema-mlh/backend
npm install
```

### 3. Configurar Variáveis de Ambiente

Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
# Database (local)
DATABASE_URL="postgresql://mlh_user:mlh_password@localhost:5432/sistema_mlh"

# Tiny ERP v3
TINY_API_KEY="seu_token_aqui"

# Shopee (obtenha no Partner Portal)
SHOPEE_PARTNER_ID="123456"
SHOPEE_PARTNER_KEY="sua_chave_aqui"
SHOPEE_SHOP_ID="789012"

# JWT Secret (gere com: openssl rand -base64 32)
JWT_SECRET="sua_chave_jwt_segura"
```

### 4. Inicializar Banco de Dados Local (Docker)

```bash
docker-compose up -d postgres
```

Ou use PostgreSQL instalado localmente.

### 5. Gerar Prisma Client e Criar Tabelas

```bash
npm run db:generate
npm run db:push
```

### 6. Popular Banco com Dados de Exemplo

```bash
npm run db:seed
```

### 7. Executar em Desenvolvimento

```bash
npm run dev
```

A API estará disponível em: **http://localhost:3000**

---

## ☁️ Deploy no Railway

### Passo 1: Instalar Railway CLI

```bash
npm install -g @railway/cli
```

### Passo 2: Login no Railway

```bash
railway login
```

### Passo 3: Inicializar Projeto

```bash
cd sistema-mlh
railway init --name "sistema-mlh"
```

### Passo 4: Adicionar PostgreSQL

```bash
railway add postgresql
```

O Railway criará automaticamente a variável `DATABASE_URL`.

### Passo 5: Configurar Variáveis de Ambiente

No painel do Railway, adicione:

```
TINY_API_KEY=seu_token_tiny
SHOPEE_PARTNER_ID=123456
SHOPEE_PARTNER_KEY=sua_chave
SHOPEE_SHOP_ID=789012
JWT_SECRET=sua_chave_jwt_segura
NODE_ENV=production
SYNC_INTERVAL_HOURS=4
SYNC_AUTO_START=true
```

### Passo 6: Deploy

```bash
cd backend
railway up
```

### Passo 7: Executar Migrations no Railway

```bash
railway run npx prisma db push
railway run npm run db:seed
```

### Passo 8: Verificar Health Check

Acesse a URL gerada pelo Railway + `/health`:

```
https://seu-app.railway.app/health
```

---

## 📡 Uso da API

### Health Check

```bash
GET /health
```

**Resposta:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-21T...",
  "uptime": 3600,
  "database": "connected"
}
```

### Produtos

#### Listar Produtos

```bash
GET /api/produtos?ativo=true
```

#### Sincronizar Produtos do Tiny

```bash
POST /api/produtos/sync/tiny
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "criados": 10,
    "atualizados": 140
  }
}
```

#### Sincronizar Produtos do Shopee

```bash
POST /api/produtos/sync/shopee
Content-Type: application/json

{
  "accessToken": "seu_access_token_shopee"
}
```

### Financeiro

#### Listar Contas a Pagar

```bash
GET /api/financeiro/contas-pagar
```

#### Sincronizar Contas do Tiny

```bash
POST /api/financeiro/contas-pagar/sync

{
  "dataInicio": "2026-01-01",
  "dataFim": "2026-01-31"
}
```

#### Fluxo de Caixa

```bash
GET /api/financeiro/fluxo-caixa?dataInicio=2026-01-01&dataFim=2026-01-31
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "periodo": { "inicio": "...", "fim": "..." },
    "pagar": { "total": 15000, "quantidade": 10 },
    "receber": { "bruto": 50000, "liquido": 45000, "quantidade": 25 },
    "saldo": 30000
  }
}
```

### Ads (Shopee)

#### Sincronizar Relatório de Ads

```bash
POST /api/ads/sync
Content-Type: application/json

{
  "accessToken": "seu_access_token_shopee",
  "startDate": "2026-01-01",
  "endDate": "2026-01-31"
}
```

#### Ratear Custos de Ads

```bash
POST /api/ads/ratear-custos

{
  "dataInicio": "2026-01-01",
  "dataFim": "2026-01-31"
}
```

#### Relatório de Performance

```bash
GET /api/ads/relatorio?dataInicio=2026-01-01&dataFim=2026-01-31
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "totais": {
      "impressoes": 100000,
      "cliques": 5000,
      "gasto": 2500,
      "pedidos": 250,
      "gmv": 50000
    },
    "metricas": {
      "ctrMedio": 5.0,
      "cpcMedio": 0.50,
      "roasTotal": 20.0
    }
  }
}
```

### Conciliação

#### Processar Extrato Bancário

```bash
POST /api/conciliacao/processar
```

#### Conciliar Contas

```bash
POST /api/conciliacao/conciliar
```

---

## ⏰ Sincronização Automática

O sistema possui sincronização automática via **cron jobs**.

### Configuração

No arquivo `.env`:

```env
SYNC_INTERVAL_HOURS=4    # Sincronizar a cada 4 horas
SYNC_AUTO_START=true     # Ativar sync automático
```

### O que é Sincronizado Automaticamente

1. **Produtos do Tiny** → Base de dados local
2. **Contas a Pagar** → Financeiro
3. **Contas a Receber** → Financeiro

### Sincronização Manual

Execute o script de sync quando necessário:

```bash
npm run sync
```

Ou via API:

```bash
POST /api/produtos/sync/tiny
POST /api/financeiro/contas-pagar/sync
POST /api/financeiro/contas-receber/sync
```

---

## 🔐 Autenticação Shopee OAuth2

### 1. Obter Authorization Code

Redirecione o usuário para:

```
https://partner.shopeemobile.com/api/v2/auth/authorize?partner_id=YOUR_ID&redirect=YOUR_URL&sign=GENERATED_SIGN&timestamp=TIMESTAMP
```

### 2. Trocar Code por Access Token

Use o código retornado para obter o `access_token` via:

```
POST https://partner.shopeemobile.com/api/v2/auth/token/get
```

### 3. Usar Access Token nas Requisições

Todas as rotas do Shopee requerem `accessToken` no body:

```json
{
  "accessToken": "seu_access_token_aqui"
}
```

---

## 🐛 Troubleshooting

### Erro: "DATABASE_URL não configurada"

**Solução**: Configure a variável `DATABASE_URL` no `.env`:

```env
DATABASE_URL="postgresql://user:password@host:5432/database"
```

### Erro: "Tiny API Error: Invalid token"

**Solução**: Verifique sua `TINY_API_KEY` no painel do Tiny ERP.

### Erro: "Shopee API Error: Invalid signature"

**Solução**: 
- Verifique `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY` e `SHOPEE_SHOP_ID`
- Certifique-se de que o timestamp está correto
- O signature é gerado automaticamente pelo sistema

### Banco de Dados não conecta

**Solução**:
```bash
# Verificar se o PostgreSQL está rodando
docker ps

# Recriar container
docker-compose down
docker-compose up -d postgres

# Testar conexão
npx prisma db push
```

### Rate Limit Exceeded

**Solução**: 
- **Tiny**: Aguarde ~1 minuto (limite: 100 req/min)
- **Shopee**: Aguarde ~1 hora (limite: 1000 req/hora)

O sistema já possui rate limiting automático.

### Logs do Railway

```bash
railway logs
```

---

## 📊 Métricas e Monitoramento

### Logs Estruturados

Todos os logs são estruturados com Winston:

```typescript
logger.info('Mensagem', { contexto: 'dados' });
logger.error('Erro', { error: errorObject });
```

### Logs de Sincronização

Acesse a tabela `logs_sync` no banco:

```sql
SELECT * FROM logs_sync ORDER BY criado_em DESC LIMIT 10;
```

### Health Check

Monitore a saúde da aplicação:

```bash
curl https://seu-app.railway.app/health
```

---

## 🔄 Backup e Restore

### Backup PostgreSQL (Railway)

```bash
railway run pg_dump $DATABASE_URL > backup.sql
```

### Restore

```bash
railway run psql $DATABASE_URL < backup.sql
```

---

## 📈 Escalabilidade

### Aumentar Recursos no Railway

1. Acesse o painel do Railway
2. Vá em Settings → Resources
3. Ajuste CPU e Memória conforme necessário

### Otimizações

- Use **índices** nas queries frequentes (já configurado no Prisma)
- Ative **cache** para consultas repetidas
- Use **background jobs** para syncs pesados
- Configure **read replicas** no PostgreSQL

---

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch: `git checkout -b feature/nova-feature`
3. Commit suas mudanças: `git commit -m 'Adiciona nova feature'`
4. Push para a branch: `git push origin feature/nova-feature`
5. Abra um Pull Request

---

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes.

---

## 🆘 Suporte

Para dúvidas ou problemas:

1. Verifique a seção [Troubleshooting](#troubleshooting)
2. Consulte os logs: `railway logs` ou `docker-compose logs`
3. Abra uma issue no GitHub

---

## 🎉 Próximos Passos

- [ ] Implementar autenticação JWT para API
- [ ] Adicionar dashboard web com gráficos
- [ ] Integrar com mais marketplaces (Mercado Livre, Amazon)
- [ ] Notificações por email/Telegram
- [ ] Relatórios PDF automáticos
- [ ] API de webhooks para eventos em tempo real

---

**Desenvolvido com ❤️ para otimizar gestão de e-commerce**

