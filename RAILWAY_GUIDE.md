# 🚂 GUIA RAILWAY - DEPLOY SISTEMA MLH

## ⚡ Comandos Rápidos Railway

### 1. Instalar Railway CLI (se ainda não tiver)

```powershell
npm install -g @railway/cli
```

### 2. Login no Railway

```powershell
railway login
```

Isso abrirá o navegador para autenticação.

### 3. Inicializar Projeto

```powershell
# Na pasta raiz do projeto (sistema-mlh/)
railway init
```

Você será perguntado:
- **Project name**: `sistema-mlh`
- **Create new project**: Yes

### 4. Adicionar PostgreSQL

```powershell
railway add -s postgresql
```

Isso criará automaticamente:
- Um serviço PostgreSQL
- A variável `DATABASE_URL` configurada

### 5. Configurar Variáveis de Ambiente

Acesse o painel do Railway (https://railway.app) e adicione:

```env
# Tiny ERP
TINY_API_KEY=seu_token_tiny_aqui
TINY_BASE_URL=https://api.tiny.com.br/api/v3

# Shopee
SHOPEE_PARTNER_ID=123456
SHOPEE_PARTNER_KEY=sua_chave_aqui
SHOPEE_SHOP_ID=789012
SHOPEE_BASE_URL=https://partner.shopeemobile.com/api/v2

# JWT
JWT_SECRET=sua_chave_jwt_segura_aqui

# App
NODE_ENV=production
PORT=3000
SYNC_INTERVAL_HOURS=4
SYNC_AUTO_START=true
```

**Ou via CLI:**

```powershell
railway variables set TINY_API_KEY=seu_token
railway variables set SHOPEE_PARTNER_ID=123456
railway variables set JWT_SECRET=sua_chave_jwt
```

### 6. Deploy da Aplicação

```powershell
cd backend
railway up
```

O Railway irá:
1. Detectar o Dockerfile
2. Fazer build da imagem
3. Fazer deploy automaticamente

### 7. Aplicar Migrations no Banco

```powershell
railway run npx prisma db push
```

### 8. Popular Banco com Dados Iniciais (Opcional)

```powershell
railway run npm run db:seed
```

### 9. Ver Logs em Tempo Real

```powershell
railway logs
```

### 10. Abrir Painel do Projeto

```powershell
railway open
```

### 11. Ver URL da Aplicação

No painel do Railway, vá em:
- **Settings** → **Networking** → **Generate Domain**

Sua API estará disponível em:
```
https://sistema-mlh-production.up.railway.app
```

---

## 🔧 Comandos Úteis Adicionais

### Executar Comando no Container

```powershell
railway run <comando>
```

Exemplos:
```powershell
railway run npm run sync          # Sync manual
railway run npx prisma studio      # Abrir Prisma Studio
railway run node dist/scripts/seed.js  # Executar seed
```

### Conectar ao PostgreSQL Diretamente

```powershell
railway connect postgresql
```

### Ver Variáveis de Ambiente

```powershell
railway variables
```

### Criar Novo Ambiente (Staging)

```powershell
railway environment create staging
railway environment use staging
```

### Fazer Rollback de Deploy

No painel web:
1. Vá em **Deployments**
2. Selecione deploy anterior
3. Clique em **Redeploy**

---

## 📊 Monitoramento

### Health Check

Acesse:
```
https://sua-url.railway.app/health
```

Deve retornar:
```json
{
  "status": "healthy",
  "database": "connected",
  "uptime": 3600
}
```

### Logs de Sincronização

Consultar no banco:
```sql
SELECT * FROM logs_sync ORDER BY criado_em DESC LIMIT 20;
```

### Métricas no Painel Railway

- **CPU Usage**
- **Memory Usage**
- **Network I/O**
- **Request Count**

---

## 🐛 Troubleshooting Railway

### Deploy Falhou

```powershell
railway logs --json
```

Verificar:
- Build do Dockerfile concluiu?
- Variáveis de ambiente configuradas?
- DATABASE_URL disponível?

### Banco não Conecta

```powershell
railway run npx prisma db push
```

Se falhar, verificar:
- DATABASE_URL está correta?
- PostgreSQL service está rodando?

### Aplicação Reiniciando

Verificar logs:
```powershell
railway logs
```

Possíveis causas:
- Erro ao conectar banco
- Variáveis de ambiente faltando
- Port não configurada corretamente

### Limpar e Recriar Tudo

```powershell
railway down
railway init
railway add -s postgresql
railway up
```

---

## 💰 Custos Railway

### Plano Gratuito

- **$5/mês** de crédito gratuito
- **500 horas** de execução
- **1GB RAM**
- **1GB storage** PostgreSQL

### Plano Pro ($20/mês)

- **Unlimited** deploy
- **8GB RAM** 
- **Escalável**
- **Priority support**

---

## 🔐 Segurança

### Adicionar Secrets (para chaves sensíveis)

```powershell
railway secrets set JWT_SECRET=$(openssl rand -base64 32)
```

### Restringir Acesso ao Banco

No painel Railway:
1. PostgreSQL service → **Settings**
2. **Networking** → **Private Networking Only**

---

## 🚀 CI/CD com GitHub

### Conectar Repositório GitHub

1. No painel Railway, vá em **Settings**
2. **Source** → **Connect GitHub Repo**
3. Selecione o repositório

### Deploy Automático

Railway detectará pushes na branch `main` e fará deploy automaticamente.

### Branch de Staging

```powershell
railway environment create staging
railway link staging --branch develop
```

---

## 📈 Escalar Aplicação

### Horizontal Scaling (Múltiplas Instâncias)

No painel:
1. **Settings** → **Scaling**
2. **Replicas** → Aumentar para 2, 3, etc.

### Vertical Scaling (Mais Recursos)

1. **Settings** → **Resources**
2. Ajustar **Memory** e **CPU**

---

## 🎯 Checklist de Deploy

- [ ] Railway CLI instalado
- [ ] Login no Railway feito
- [ ] Projeto inicializado
- [ ] PostgreSQL adicionado
- [ ] Variáveis de ambiente configuradas
- [ ] Deploy feito com sucesso
- [ ] Migrations aplicadas
- [ ] Health check funcionando
- [ ] Testes de integração passaram
- [ ] Logs monitorados

---

**Pronto! Seu Sistema MLH está no ar! 🎉**
