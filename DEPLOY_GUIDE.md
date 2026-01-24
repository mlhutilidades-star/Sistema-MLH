# 🚀 GUIA COMPLETO DE DEPLOY - SISTEMA MLH

## 📋 ÍNDICE

1. [Pré-requisitos](#pré-requisitos)
2. [Setup Automático](#setup-automático)
3. [Configuração Manual](#configuração-manual)
4. [Deploy Railway](#deploy-railway)
5. [Banco de Dados](#banco-de-dados)
6. [Testes de Integração](#testes-de-integração)
7. [Monitoramento](#monitoramento)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 PRÉ-REQUISITOS

### ✅ Ferramentas Necessárias

- [x] Node.js 18+
- [x] Railway CLI v4.15.1
- [x] Git
- [x] Conta Railway (mlhutilidades@gmail.com)

### ✅ Credenciais Externas

#### 📦 Tiny ERP v3
- **URL**: https://tiny.com.br
- **Como obter**:
  1. Login no painel Tiny
  2. Menu: Configurações > API
  3. Clique em "Gerar Token"
  4. Copie o token (ex: `abc123def456`)
  5. Guarde em local seguro

#### 🛒 Shopee Open API v2
- **URL**: https://open.shopee.com
- **Como obter**:
  1. Acesse Shopee Open Platform
  2. Crie nova aplicação
  3. Obtenha:
     - Partner ID (número)
     - Partner Key (string)
     - Shop ID (número)
  4. Configure Redirect URL: `https://[SEU_DOMINIO]/api/shopee/callback`

---

## 🤖 SETUP AUTOMÁTICO

### Opção 1: Script PowerShell (Windows)

```powershell
# Execute o script automático
.\setup-railway.ps1
```

**O que o script faz:**
- ✅ Verifica Railway CLI instalado
- ✅ Verifica login Railway
- ✅ Gera JWT_SECRET automaticamente
- ✅ Cria arquivo railway-env-vars.txt com variáveis
- ✅ Mostra próximos passos

### Opção 2: Manual (Todos OS)

```bash
# 1. Verificar Railway CLI
railway --version

# 2. Login Railway (se necessário)
railway login

# 3. Ver projeto criado
railway status
```

---

## ⚙️ CONFIGURAÇÃO MANUAL

### 1️⃣ Criar Serviço Backend

**Via Painel Railway:**

1. Acesse: https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f
2. Clique em **"New Service"**
3. Selecione **"Empty Service"**
4. Nome do serviço: `api-backend`
5. Clique em **"Add Service"**

### 2️⃣ Configurar Variáveis de Ambiente

**No painel Railway (serviço `api-backend`):**

1. Clique no serviço **api-backend**
2. Vá para aba **"Variables"**
3. Adicione as seguintes variáveis:

#### Variáveis Básicas

```env
NODE_ENV=production
PORT=3000
```

#### JWT Secret (gerar com)

```bash
# PowerShell
$jwtSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Write-Host $jwtSecret

# Linux/Mac
openssl rand -base64 32
```

```env
JWT_SECRET=[COLE_O_SECRET_GERADO]
```

#### Database URL

⚠️ **IMPORTANTE**: Railway cria automaticamente quando você conecta o PostgreSQL.

No painel:
1. Clique em **api-backend**
2. Vá para **"Settings"** > **"Service Variables"**
3. Clique **"Add Variable Reference"**
4. Selecione: `postgres` > `DATABASE_URL`

Ou adicione manualmente:
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/railway
```

#### Tiny ERP v3

```env
TINY_API_KEY=[SEU_TOKEN_TINY]
TINY_BASE_URL=https://api.tiny.com.br/api/v3
```

#### Shopee Open API v2

```env
SHOPEE_PARTNER_ID=[SEU_PARTNER_ID]
SHOPEE_PARTNER_KEY=[SEU_PARTNER_KEY]
SHOPEE_SHOP_ID=[SEU_SHOP_ID]
SHOPEE_BASE_URL=https://partner.shopeemobile.com/api/v2
```

#### Configurações Opcionais

```env
SYNC_INTERVAL_HOURS=4
SYNC_AUTO_START=true
CORS_ORIGIN=*
LOG_LEVEL=info
```

### 3️⃣ Conectar PostgreSQL ao Backend

**No painel Railway:**

1. Clique no serviço **postgres**
2. Vá para **"Connect"**
3. Clique em **"Link to another service"**
4. Selecione **api-backend**
5. Confirme

---

## 🚀 DEPLOY RAILWAY

### Via Railway CLI

```bash
# 1. Navegar para backend
cd backend

# 2. Linkar serviço (escolha api-backend)
railway service

# 3. Deploy
railway up

# 4. Acompanhar logs
railway logs --follow
```

### Via Git Push (Alternativo)

```bash
# 1. Inicializar git (se não inicializado)
git init
git add .
git commit -m "Initial commit"

# 2. Conectar ao Railway
railway link

# 3. Deploy automático
git push railway main
```

### ✅ Verificar Deploy

```bash
# Status do deploy
railway status

# Ver URL do serviço
railway open

# Ver logs
railway logs --tail 100
```

**URL esperada:**
```
https://api-backend-production-[ID].up.railway.app
```

---

## 🗄️ BANCO DE DADOS

### 1️⃣ Migração Prisma

```bash
# Executar migrations
railway run npx prisma db push

# Ver status
railway run npx prisma db status
```

### 2️⃣ Seed de Dados

```bash
# Popular banco com dados exemplo
railway run npm run db:seed
```

### 3️⃣ Verificar Banco

```bash
# Abrir Prisma Studio (Railway)
railway run npx prisma studio

# Ou via connection string
railway run npx prisma db execute --stdin < query.sql
```

### 4️⃣ Backup (Recomendado)

```bash
# Exportar schema
railway run npx prisma db pull

# Backup manual
railway run pg_dump -Fc -d $DATABASE_URL > backup.dump
```

---

## 🧪 TESTES DE INTEGRAÇÃO

### Health Check

```bash
# Verificar API online
curl https://[SEU_DOMINIO]/health

# Resposta esperada:
# {
#   "status": "ok",
#   "timestamp": "2024-01-15T10:30:00.000Z",
#   "database": "connected",
#   "version": "1.0.0"
# }
```

### Teste Tiny ERP v3

```bash
# Testar conexão Tiny
railway run node -e "
const { TinyClient } = require('./dist/integrations/tiny/client');
const tiny = new TinyClient(process.env.TINY_API_KEY);

(async () => {
  try {
    const produtos = await tiny.getProdutos({ page: 1, limit: 5 });
    console.log('✅ Tiny ERP conectado!');
    console.log('Produtos encontrados:', produtos.length);
  } catch (error) {
    console.error('❌ Erro Tiny:', error.message);
  }
})();
"
```

**Validações:**
- ✅ Status 200
- ✅ Rate limit respeitado (100 req/min)
- ✅ Produtos retornados
- ✅ Campos: id, nome, codigo, preco

### Teste Shopee Open API v2

```bash
# Testar assinatura Shopee
railway run node -e "
const { generateShopeeSignature, buildShopeeUrl } = require('./dist/integrations/shopee/auth');

const partnerId = parseInt(process.env.SHOPEE_PARTNER_ID);
const partnerKey = process.env.SHOPEE_PARTNER_KEY;
const shopId = parseInt(process.env.SHOPEE_SHOP_ID);

const timestamp = Math.floor(Date.now() / 1000);
const path = '/api/v2/product/get_item_list';

try {
  const signature = generateShopeeSignature(partnerId, path, timestamp, partnerKey);
  const url = buildShopeeUrl(path, timestamp, signature, partnerId, shopId);
  
  console.log('✅ Shopee Auth configurado!');
  console.log('Signature:', signature.substring(0, 20) + '...');
  console.log('URL gerada com sucesso');
} catch (error) {
  console.error('❌ Erro Shopee:', error.message);
}
"
```

**Validações:**
- ✅ Signature HMAC-SHA256 gerada
- ✅ URL com query params corretos
- ✅ Partner ID e Shop ID válidos

### Teste Sync Completo

```bash
# Sync manual de produtos
railway run npm run sync:manual

# Logs esperados:
# 🔄 Sincronizando produtos Tiny...
# ✅ 50 produtos sincronizados
# 🔄 Sincronizando produtos Shopee...
# ✅ 30 produtos sincronizados
```

### Teste Endpoints REST

```bash
# 1. Produtos
curl https://[SEU_DOMINIO]/api/produtos

# 2. Financeiro - Contas a Pagar
curl https://[SEU_DOMINIO]/api/financeiro/contas-pagar

# 3. Financeiro - Contas a Receber
curl https://[SEU_DOMINIO]/api/financeiro/contas-receber

# 4. Ads - Consumo
curl https://[SEU_DOMINIO]/api/ads/consumo

# 5. Conciliação - Regras
curl https://[SEU_DOMINIO]/api/conciliacao/regras
```

---

## 📊 MONITORAMENTO

### Logs Railway

```bash
# Ver logs em tempo real
railway logs --follow

# Filtrar por erro
railway logs --follow | grep ERROR

# Últimas 100 linhas
railway logs --tail 100
```

### Métricas

**No painel Railway:**
1. Clique em **api-backend**
2. Vá para **"Metrics"**
3. Monitore:
   - CPU Usage
   - Memory Usage
   - Network I/O
   - Request Count

### Alertas

**Configurar no Railway:**
1. **Settings** > **Alerts**
2. Adicionar:
   - CPU > 80% por 5 minutos
   - Memory > 90% por 5 minutos
   - Deploy failed
   - Health check failed

### Health Checks

**Railway automático:**
- Endpoint: `/health`
- Intervalo: 30s
- Timeout: 300s
- Retries: 3

---

## 🔧 TROUBLESHOOTING

### ❌ Deploy Failed

**Erro:** Build failed

```bash
# Ver logs detalhados
railway logs --deployment [DEPLOYMENT_ID]

# Rebuild
railway up --force
```

**Erro:** Out of memory

```bash
# Aumentar limite no railway.toml
[deploy]
numReplicas = 1
memoryLimitMB = 1024
```

### ❌ Database Connection Failed

**Erro:** P1001: Can't reach database

```bash
# 1. Verificar DATABASE_URL
railway variables

# 2. Testar conexão
railway run npx prisma db status

# 3. Recriar conexão
railway unlink
railway link
```

### ❌ Tiny API Rate Limit

**Erro:** 429 Too Many Requests

**Solução:**
- Rate limit: 100 req/min (implementado automaticamente)
- Backoff exponencial: 1s, 2s, 4s, 8s
- Verificar `src/integrations/tiny/client.ts`

### ❌ Shopee Auth Failed

**Erro:** Invalid signature

**Checklist:**
1. Partner Key correto?
2. Timestamp sincronizado?
3. Path inclui query params?
4. Ordem dos parâmetros: partner_id, path, timestamp

```javascript
// Verificar signature
const crypto = require('crypto');
const partnerId = 123456;
const path = '/api/v2/shop/get_shop_info';
const timestamp = Math.floor(Date.now() / 1000);
const partnerKey = 'YOUR_KEY';

const baseString = `${partnerId}${path}${timestamp}`;
const signature = crypto
  .createHmac('sha256', partnerKey)
  .update(baseString)
  .digest('hex');

console.log('Signature:', signature);
```

### ❌ Sync Not Running

**Erro:** Cron job não executando

```bash
# 1. Verificar variáveis
railway variables | grep SYNC

# 2. Verificar logs
railway logs --follow | grep CRON

# 3. Trigger manual
railway run npm run sync:manual
```

### ❌ Missing Environment Variables

```bash
# Listar todas variáveis
railway variables

# Adicionar variável faltante
railway variables --set "VAR_NAME=value"

# Ou via painel Railway
```

---

## 📚 REFERÊNCIAS

### Documentação Oficial

- **Railway**: https://docs.railway.app
- **Prisma**: https://www.prisma.io/docs
- **Tiny ERP**: https://tiny.com.br/documentacao-api
- **Shopee**: https://open.shopee.com/documents

### Arquivos do Projeto

- **Backend**: `c:\Users\lemop\Desktop\sistema mlh\backend\`
- **README**: `README.md`
- **API Examples**: `API_EXAMPLES.md`
- **Railway Config**: `railway.toml`, `railway.json`

### Comandos Úteis

```bash
# Railway
railway login
railway logout
railway status
railway open
railway logs
railway variables
railway service
railway up
railway run [comando]

# Prisma
npx prisma db push
npx prisma db pull
npx prisma studio
npx prisma generate

# NPM
npm run build
npm run dev
npm run start
npm run db:seed
npm run sync:manual
```

---

## ✅ CHECKLIST FINAL

### Antes do Deploy

- [ ] Railway CLI instalado e logado
- [ ] Projeto Railway criado: `sistema-mlh-prod`
- [ ] PostgreSQL adicionado
- [ ] Serviço `api-backend` criado
- [ ] Variáveis de ambiente configuradas
- [ ] DATABASE_URL conectado
- [ ] Tiny API Key válida
- [ ] Shopee credentials válidas
- [ ] JWT_SECRET gerado

### Após Deploy

- [ ] Deploy successful (green check)
- [ ] Health check respondendo `/health`
- [ ] Database migrations aplicadas
- [ ] Seed executado com sucesso
- [ ] Teste Tiny API funcionando
- [ ] Teste Shopee API funcionando
- [ ] Endpoints REST acessíveis
- [ ] Logs sem erros críticos
- [ ] Cron job sync ativo
- [ ] Monitoramento configurado

### Documentação

- [ ] README.md atualizado
- [ ] API_EXAMPLES.md com exemplos
- [ ] DEPLOY_GUIDE.md completo
- [ ] Credenciais documentadas (seguro)
- [ ] URLs de produção documentadas

---

## 📞 SUPORTE

**Projeto Railway:**
https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f

**Email:**
mlhutilidades@gmail.com

**Versão:**
Sistema MLH v1.0.0

---

**Última atualização:** 2024-01-15
