# ✅ CHECKLIST DEPLOY COMPLETO - SISTEMA MLH

## 📋 PRÉ-DEPLOY

### Ambiente Local

- [x] Node.js 18+ instalado
- [x] NPM/Yarn funcionando
- [x] Git instalado
- [x] Código compilado sem erros (`npm run build`)
- [x] Testes locais passando
- [x] Variáveis .env.example documentadas
- [ ] README.md atualizado com instruções

### Railway Setup

- [x] Railway CLI instalado (`railway --version`)
- [x] Login Railway (`railway whoami`)
- [x] Conta Railway ativa (mlhutilidades@gmail.com)
- [x] Projeto criado: `sistema-mlh-prod`
- [ ] Domínio customizado (opcional)

## 🏗️ INFRAESTRUTURA

### Serviços Railway

- [x] PostgreSQL adicionado
- [ ] Serviço `api-backend` criado
- [ ] PostgreSQL linkado ao api-backend
- [ ] Health check configurado
- [ ] Restart policy definido

### Arquivos de Configuração

- [x] `Dockerfile` criado
- [x] `.dockerignore` criado
- [x] `railway.toml` criado
- [x] `railway.json` criado
- [x] `prisma/schema.prisma` atualizado

## 🔐 CREDENCIAIS

### Variáveis Básicas

- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `JWT_SECRET` (gerado com script)
- [ ] `DATABASE_URL` (automático do Railway)

### Tiny ERP v3

- [ ] Conta Tiny criada em https://tiny.com.br
- [ ] Token API gerado
- [ ] `TINY_API_KEY` configurado
- [ ] `TINY_BASE_URL=https://api.tiny.com.br/api/v3`
- [ ] Teste de conexão OK

### Shopee Open API v2

- [ ] App criada em https://open.shopee.com
- [ ] `SHOPEE_PARTNER_ID` obtido
- [ ] `SHOPEE_PARTNER_KEY` obtido
- [ ] `SHOPEE_SHOP_ID` obtido
- [ ] `SHOPEE_BASE_URL=https://partner.shopeemobile.com/api/v2`
- [ ] OAuth2 flow testado

### Opcionais

- [ ] `SYNC_INTERVAL_HOURS=4`
- [ ] `SYNC_AUTO_START=true`
- [ ] `CORS_ORIGIN=*` (ou domínio específico)
- [ ] `LOG_LEVEL=info`

## 🚀 DEPLOY

### Build e Deploy

```bash
cd backend
railway service api-backend
railway up
```

- [ ] Build iniciado
- [ ] Docker build successful
- [ ] Deploy completo
- [ ] Status = "Deployed"
- [ ] URL gerada

### Logs

```bash
railway logs --follow
```

- [ ] Sem erros críticos
- [ ] "Server listening on port 3000"
- [ ] "Database connected successfully"
- [ ] Health check passando

## 🗄️ BANCO DE DADOS

### Migrations

```bash
railway run npx prisma db push
```

- [ ] Migrations aplicadas
- [ ] Todas as 7 tabelas criadas:
  - [ ] `Produto`
  - [ ] `ContaPagar`
  - [ ] `ContaReceber`
  - [ ] `ExtratoBanco`
  - [ ] `RegraConciliacao`
  - [ ] `ConsumoAds`
  - [ ] `LogSync`
- [ ] Indexes criados
- [ ] Constraints aplicadas

### Seed

```bash
railway run npm run db:seed
```

- [ ] Seed executado
- [ ] Dados de exemplo inseridos
- [ ] Verificado no Prisma Studio

### Verificação

```bash
railway run npx prisma studio
```

- [ ] Prisma Studio acessível
- [ ] Tabelas visíveis
- [ ] Dados corretos

## 🧪 TESTES

### Health Check

```bash
curl https://[SEU_DOMINIO]/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected",
  "version": "1.0.0"
}
```

- [ ] Status 200
- [ ] JSON válido
- [ ] Database = "connected"

### Teste Tiny ERP

```bash
railway run node scripts/test-integrations.js
```

- [ ] ✅ Teste 1: Listar Produtos
- [ ] ✅ Teste 2: Buscar Produto por ID
- [ ] ✅ Teste 3: Listar Contas a Pagar
- [ ] ✅ Teste 4: Listar Contas a Receber
- [ ] Rate limiting funcionando (600ms entre requests)

### Teste Shopee

```bash
railway run node scripts/test-integrations.js
```

- [ ] ✅ Teste 1: Gerar Signature HMAC-SHA256
- [ ] ✅ Teste 2: Construir URL com Auth
- [ ] ✅ Teste 3: Inicializar ShopeeClient
- [ ] OAuth2 flow documentado

### Endpoints REST

Testar todos endpoints:

#### Produtos
```bash
curl https://[SEU_DOMINIO]/api/produtos
curl https://[SEU_DOMINIO]/api/produtos/:id
curl https://[SEU_DOMINIO]/api/produtos/sync -X POST
```

- [ ] GET /api/produtos (200)
- [ ] GET /api/produtos/:id (200)
- [ ] POST /api/produtos/sync (200)

#### Financeiro
```bash
curl https://[SEU_DOMINIO]/api/financeiro/contas-pagar
curl https://[SEU_DOMINIO]/api/financeiro/contas-receber
curl https://[SEU_DOMINIO]/api/financeiro/sync -X POST
```

- [ ] GET /api/financeiro/contas-pagar (200)
- [ ] GET /api/financeiro/contas-receber (200)
- [ ] POST /api/financeiro/sync (200)

#### Ads
```bash
curl https://[SEU_DOMINIO]/api/ads/consumo
curl https://[SEU_DOMINIO]/api/ads/consumo -X POST -H "Content-Type: application/json" -d '{...}'
```

- [ ] GET /api/ads/consumo (200)
- [ ] POST /api/ads/consumo (201)

#### Conciliação
```bash
curl https://[SEU_DOMINIO]/api/conciliacao/regras
curl https://[SEU_DOMINIO]/api/conciliacao/processar -X POST
```

- [ ] GET /api/conciliacao/regras (200)
- [ ] POST /api/conciliacao/processar (200)

## ⚙️ FUNCIONALIDADES

### Sync Automático

- [ ] Cron job configurado (4 horas)
- [ ] Primeira execução bem-sucedida
- [ ] Logs mostrando "Sync completed"
- [ ] LogSync registrado no banco

### Sync Manual

```bash
railway run npm run sync:manual
```

- [ ] Sync Tiny executado
- [ ] Sync Shopee executado
- [ ] Produtos atualizados
- [ ] Financeiro atualizado

### Rate Limiting

- [ ] Tiny: máx 100 req/min (600ms intervalo)
- [ ] Shopee: máx 1000 req/hora
- [ ] Backoff exponencial em caso de erro
- [ ] Logs mostrando retry attempts

## 📊 MONITORAMENTO

### Railway Dashboard

- [ ] Métricas de CPU < 80%
- [ ] Métricas de Memory < 90%
- [ ] Network I/O estável
- [ ] Request count crescente

### Health Monitor

```bash
railway run node scripts/monitor-health.js
```

- [ ] API online
- [ ] Database conectado
- [ ] Tiny API respondendo
- [ ] Shopee API configurado

### Logs Estruturados

- [ ] Winston logger funcionando
- [ ] Logs em console visíveis
- [ ] Logs em arquivo (se configurado)
- [ ] Níveis de log corretos (info, warn, error)

### Alertas

- [ ] Alerta de CPU alto configurado
- [ ] Alerta de memória alto configurado
- [ ] Alerta de deploy failed configurado
- [ ] Alerta de health check failed configurado

## 📚 DOCUMENTAÇÃO

### Arquivos Criados

- [x] `README.md` - Visão geral do projeto
- [x] `DEPLOY_GUIDE.md` - Guia completo de deploy
- [x] `RAILWAY_COMMANDS.md` - Referência de comandos
- [x] `API_EXAMPLES.md` - Exemplos de API
- [x] `CHECKLIST_DEPLOY.md` - Este checklist

### Documentação Técnica

- [ ] Arquitetura documentada
- [ ] Fluxo de dados explicado
- [ ] Modelos de dados (ERD)
- [ ] API documentation (Swagger/OpenAPI)
- [ ] Troubleshooting guide

### Onboarding

- [ ] Setup instructions para novos devs
- [ ] Como obter credenciais
- [ ] Como rodar local
- [ ] Como fazer deploy
- [ ] Como testar integrações

## 🔒 SEGURANÇA

### Credenciais

- [ ] Todas as secrets em variáveis Railway (não no código)
- [ ] JWT_SECRET forte (32+ chars)
- [ ] DATABASE_URL não exposta
- [ ] API keys rotacionadas periodicamente
- [ ] .env.example sem valores reais

### Configuração

- [ ] CORS configurado corretamente
- [ ] Helmet.js ativado
- [ ] Rate limiting ativo (100 req/15min)
- [ ] HTTPS enforced (Railway automático)
- [ ] Logs não expõem secrets

### Compliance

- [ ] LGPD considerado (dados pessoais)
- [ ] Backup strategy definida
- [ ] Data retention policy
- [ ] Incident response plan

## 🚦 PERFORMANCE

### Otimizações

- [ ] Prisma connection pooling
- [ ] Queries otimizadas (indexes)
- [ ] Rate limiting nas APIs externas
- [ ] Cache strategy (se aplicável)
- [ ] Gzip compression ativado

### Limites

- [ ] Memory limit: 512MB-1GB
- [ ] CPU: 1 vCPU
- [ ] Database connections: 10-20
- [ ] Request timeout: 30s
- [ ] File upload limit: 10MB

## 📈 ESCALABILIDADE

### Configuração

- [ ] Horizontal scaling ready (stateless)
- [ ] Load balancer (Railway automático)
- [ ] Database connection pooling
- [ ] Caching layer (se necessário)

### Futuro

- [ ] Redis para cache (se necessário)
- [ ] Queue system para jobs (Bull/BullMQ)
- [ ] CDN para assets estáticos
- [ ] Multi-region deployment

## 🎯 PÓS-DEPLOY

### Validação Final

- [ ] Todos os testes passando
- [ ] Sem erros nos logs (24h)
- [ ] Métricas dentro do esperado
- [ ] Integrações funcionando
- [ ] Sync automático executando

### Comunicação

- [ ] Stakeholders notificados
- [ ] Documentação compartilhada
- [ ] URLs de produção compartilhadas
- [ ] Credenciais guardadas em local seguro
- [ ] Runbook criado

### Próximos Passos

- [ ] Monitorar por 48h
- [ ] Ajustar configurações conforme uso
- [ ] Implementar melhorias identificadas
- [ ] Coletar feedback dos usuários
- [ ] Planejar próximas features

## 📝 RELATÓRIO FINAL

### Informações de Deploy

```
Data do Deploy: ___________________
Versão: v1.0.0
Ambiente: Production

URLs:
- API: https://api-backend-production-[ID].up.railway.app
- Dashboard Railway: https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f
- Documentação: https://github.com/[seu-repo]/docs

Credenciais:
- Railway: mlhutilidades@gmail.com
- Tiny ERP: [documentado em local seguro]
- Shopee: [documentado em local seguro]

Status:
- Build: ✅ Success
- Deploy: ✅ Success
- Health: ✅ OK
- Database: ✅ Connected
- Tiny API: ✅ Connected
- Shopee API: ⚠️ OAuth2 pending

Métricas Iniciais:
- Response Time: ___ ms
- CPU Usage: ___ %
- Memory Usage: ___ MB
- Database Size: ___ MB

Observações:
_________________________________
_________________________________
_________________________________
```

---

## ✅ APROVAÇÃO FINAL

**Deploy aprovado por:** ___________________  
**Data:** ___________________  
**Assinatura:** ___________________

---

**🎉 PARABÉNS! Sistema MLH em produção no Railway! 🎉**

---

**Última atualização:** 2024-01-15  
**Versão:** 1.0.0
