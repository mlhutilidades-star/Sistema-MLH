# 🚀 GUIA RÁPIDO DE DEPLOY - 5 MINUTOS

## ⚡ SETUP AUTOMÁTICO JÁ EXECUTADO

✅ **O que já está pronto:**
- Railway CLI instalado e autenticado
- Projeto Railway criado
- PostgreSQL adicionado
- JWT_SECRET gerado
- Documentação completa (2000+ linhas)
- Backend implementado (5000+ linhas de código)
- Scripts de teste e monitoramento

---

## 📋 3 PASSOS PARA DEPLOY

### 🔑 PASSO 1: Obter Credenciais (10 min)

#### Tiny ERP v3
```
1. 🌐 Acesse: https://tiny.com.br
2. 🔐 Login no painel
3. ⚙️  Menu: Configurações > API
4. 🎯 Clique: "Gerar Token"
5. 📋 Copie o token
```

#### Shopee Open API v2
```
1. 🌐 Acesse: https://open.shopee.com
2. 🔐 Login ou criar conta
3. 📱 Criar nova aplicação
4. 📋 Copie:
   • Partner ID (número)
   • Partner Key (string)
   • Shop ID (número)
```

---

### ⚙️ PASSO 2: Configurar Railway (5 min)

#### A. Criar Serviço Backend (CLI)

```powershell
# A partir da raiz do projeto
cd "c:\Users\lemop\Desktop\sistema mlh"

# Criar serviço (tipo: Empty Service)
railway add --service api-backend
```

#### B. Configurar Variáveis (CLI)

Variáveis **obrigatórias** no serviço `api-backend`:

- `NODE_ENV=production`
- `PORT=3000`
- `JWT_SECRET` (forte e único)
- `DATABASE_URL` (Postgres interno do Railway)
- `TINY_API_KEY`
- `SHOPEE_PARTNER_ID`
- `SHOPEE_PARTNER_KEY`
- `SHOPEE_SHOP_ID`

Variáveis **opcionais** (há defaults no código):

- `TINY_BASE_URL` (default: `https://api.tiny.com.br/api/v3`)
- `SHOPEE_BASE_URL` (default: `https://partner.shopeemobile.com/api/v2`)

Exemplo (substitua pelos seus valores):

```powershell
railway variable set -s api-backend NODE_ENV=production PORT=3000
railway variable set -s api-backend JWT_SECRET="<gerar/colar aqui>"
railway variable set -s api-backend DATABASE_URL="postgresql://..."

railway variable set -s api-backend TINY_API_KEY="<token>"
railway variable set -s api-backend SHOPEE_PARTNER_ID="<id>" SHOPEE_PARTNER_KEY="<key>" SHOPEE_SHOP_ID="<shopId>"

# Sync automático (recomendado ligar só depois das credenciais completas)
railway variable set -s api-backend SYNC_AUTO_START=false
```

Nota de segurança: o comando `railway variable list` pode imprimir valores. Evite rodar isso em terminais compartilhados/gravados.

---

### 🚀 PASSO 3: Deploy (5 min)

#### No Terminal PowerShell:

```powershell
# 1. Ir para pasta backend
cd "c:\Users\lemop\Desktop\sistema mlh\backend"

# 2. Selecionar serviço (escolha: api-backend)
railway service

# 3. Fazer deploy
railway up

# 4. Acompanhar logs (aguarde "Server listening on port 3000")
railway logs --follow
```

#### Configurar Banco de Dados:

```bash
# 5. Aplicar migrations
railway run npx prisma db push

# 6. Popular com dados de exemplo
railway run npm run db:seed:prod

# 7. Verificar
railway run npx prisma studio
```

---

## ✅ VALIDAÇÃO

### Testar API Online

```bash
# Health check (substitua [URL] pela URL gerada)
curl https://api-backend-production-[ID].up.railway.app/health

# Resposta esperada:
# {
#   "status": "ok",
#   "timestamp": "2024-01-15...",
#   "database": "connected",
#   "version": "1.0.0"
# }
```

### Testar Integrações

```bash
# Teste completo
railway run node scripts/test-integrations.js

# Health monitoring
railway run node scripts/monitor-health.js
```

---

## 📊 ENDPOINTS DISPONÍVEIS

Após deploy, você terá acesso a:

```
🏥 Health Check
GET /health

📦 Produtos
GET    /api/produtos
GET    /api/produtos/:id
POST   /api/produtos/sync

💰 Financeiro
GET    /api/financeiro/contas-pagar
GET    /api/financeiro/contas-receber
POST   /api/financeiro/sync

📢 Ads
GET    /api/ads/consumo
POST   /api/ads/consumo

🔄 Conciliação
GET    /api/conciliacao/regras
POST   /api/conciliacao/processar
```

---

## 🆘 PROBLEMAS?

### Erro no Deploy?
```bash
railway logs --tail 100
railway up --force
```

### Erro no Database?
```bash
# Prefira checar o DATABASE_URL no painel do Railway (Variables) para não expor o valor no terminal.
railway run npx prisma db status
```

### Erro nas APIs Externas?
```bash
railway run node scripts/test-integrations.js
```

### Ver Documentação Completa
```
📚 DEPLOY_GUIDE.md - Guia completo de deploy
📚 RAILWAY_COMMANDS.md - Referência de comandos
📚 CHECKLIST_DEPLOY.md - Checklist completo
📚 RELATORIO_FINAL.md - Relatório do que foi feito
```

---

## 🎯 RESUMO

```
✅ Setup automático → JÁ EXECUTADO
⏳ Obter credenciais → 10 minutos
⏳ Configurar Railway → 5 minutos
⏳ Deploy → 5 minutos
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏱️  TOTAL: ~20 minutos
```

---

## 📞 LINKS IMPORTANTES

**Railway:**
https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f

**Tiny ERP:**
https://tiny.com.br

**Shopee:**
https://open.shopee.com

**Variáveis:**
`c:\Users\lemop\Desktop\sistema mlh\railway-env-vars.txt`

---

## 🎉 PRONTO!

Após completar os 3 passos, seu **Sistema MLH** estará online e sincronizando automaticamente produtos e dados financeiros entre **Tiny ERP** e **Shopee** a cada 4 horas! 🚀

**Conta:** mlhutilidades@gmail.com  
**Versão:** 1.0.0
