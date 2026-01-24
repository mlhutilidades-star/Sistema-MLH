# 🚀 COMANDOS RAILWAY - REFERÊNCIA RÁPIDA

## 📋 SETUP INICIAL

### Instalação e Login

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Verificar status
railway whoami
railway --version
```

## 🏗️ PROJETO E SERVIÇOS

### Criar/Gerenciar Projeto

```bash
# Criar novo projeto
railway init

# Linkar projeto existente
railway link

# Ver status do projeto
railway status

# Abrir no navegador
railway open
```

### Gerenciar Serviços

```bash
# Listar serviços
railway service

# Selecionar serviço
railway service api-backend

# Adicionar PostgreSQL
railway add -d postgres

# Adicionar Redis
railway add -d redis
```

## 🔧 VARIÁVEIS DE AMBIENTE

### Gerenciar Variáveis

```bash
# Listar variáveis
railway variables

# Adicionar variável
railway variables --set "KEY=value"

# Adicionar múltiplas
railway variables --set "KEY1=value1" --set "KEY2=value2"

# Remover variável
railway variables --unset KEY

# Ver valor específico
railway variables | grep KEY
```

### Variáveis de Referência

```bash
# DATABASE_URL automático
# Railway cria quando conecta PostgreSQL ao serviço

# Ver todas variáveis disponíveis
railway variables --json
```

## 🚀 DEPLOY

### Deploy Manual

```bash
# Deploy código local
railway up

# Deploy específico
railway up --detach

# Deploy com logs
railway up && railway logs --follow
```

### Deploy via Git

```bash
# Conectar repositório
git init
git remote add railway [URL]

# Push e deploy automático
git push railway main
```

### Rollback

```bash
# Ver deployments
railway deployments

# Rollback para deployment anterior
railway rollback [DEPLOYMENT_ID]
```

## 📊 LOGS E MONITORAMENTO

### Ver Logs

```bash
# Logs em tempo real
railway logs --follow

# Últimas N linhas
railway logs --tail 100

# Filtrar por texto
railway logs | grep ERROR

# Logs de deployment específico
railway logs --deployment [ID]
```

### Debugging

```bash
# Ver variáveis (debug)
railway run env

# Executar comando no ambiente Railway
railway run [comando]

# Exemplos
railway run node --version
railway run npm --version
railway run npx prisma --version
```

## 🗄️ BANCO DE DADOS

### Prisma

```bash
# Migrations
railway run npx prisma db push

# Pull schema
railway run npx prisma db pull

# Status
railway run npx prisma db status

# Studio (interface visual)
railway run npx prisma studio

# Generate client
railway run npx prisma generate

# Seed
railway run npm run db:seed
```

### PostgreSQL Direto

```bash
# Conectar via psql
railway run psql $DATABASE_URL

# Backup
railway run pg_dump $DATABASE_URL > backup.sql

# Restore
railway run psql $DATABASE_URL < backup.sql

# Query simples
railway run psql $DATABASE_URL -c "SELECT COUNT(*) FROM produtos;"
```

## 🧪 TESTES E SCRIPTS

### Executar Scripts

```bash
# Script npm
railway run npm run [script]

# Exemplos
railway run npm run build
railway run npm run test
railway run npm run sync:manual

# Script Node.js
railway run node [arquivo.js]

# Scripts personalizados
railway run node scripts/test-integrations.js
railway run node scripts/monitor-health.js
```

### Health Checks

```bash
# Verificar health
curl https://[SEU_DOMINIO]/health

# Via Railway
railway run curl http://localhost:3000/health
```

## 📦 GESTÃO DE DEPENDÊNCIAS

### NPM/Yarn

```bash
# Instalar dependências
railway run npm install

# Instalar pacote específico
railway run npm install [package]

# Atualizar dependências
railway run npm update

# Verificar outdated
railway run npm outdated
```

## 🔐 SEGREDOS E CREDENCIAIS

### Boas Práticas

```bash
# NUNCA commitar secrets
echo ".env" >> .gitignore

# Usar variáveis Railway
railway variables --set "API_KEY=$(openssl rand -base64 32)"

# Rotacionar secrets
railway variables --set "JWT_SECRET=$(openssl rand -base64 32)"
```

## 📈 ESCALABILIDADE

### Configurar Replicas

```bash
# Editar railway.toml
[deploy]
numReplicas = 2
memoryLimitMB = 1024
```

### Restart Policy

```bash
# railway.toml
[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

## 🔄 CI/CD

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install Railway CLI
        run: npm install -g @railway/cli
      
      - name: Deploy
        run: railway up --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

### Obter Railway Token

```bash
# No terminal
railway login --browserless

# Copiar token e adicionar no GitHub Secrets
```

## 🛠️ TROUBLESHOOTING

### Problemas Comuns

```bash
# Erro: "No service linked"
railway service
# Selecione o serviço correto

# Erro: "Not logged in"
railway login

# Erro: Build failed
railway logs --deployment [ID]

# Limpar cache
railway up --force

# Reiniciar serviço
railway restart

# Ver eventos
railway events
```

## 📚 COMANDOS ÚTEIS COMBINADOS

### Deploy Completo

```bash
# Sequence completa
cd backend
railway service api-backend
railway up
railway run npx prisma db push
railway run npm run db:seed
railway logs --follow
```

### Health Check Completo

```bash
# Verificar tudo
railway status
railway variables | grep -E "(DATABASE_URL|NODE_ENV|PORT)"
railway logs --tail 50
curl https://[DOMINIO]/health
railway run npx prisma db status
```

### Backup e Restore

```bash
# Backup completo
railway run pg_dump $DATABASE_URL -Fc > backup-$(date +%Y%m%d).dump

# Restore
railway run pg_restore -d $DATABASE_URL backup-20240115.dump
```

## 🔗 LINKS ÚTEIS

### Railway Dashboard
- **Projeto**: https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f
- **Docs**: https://docs.railway.app
- **CLI Reference**: https://docs.railway.app/reference/cli-api

### API Externa
- **Tiny ERP**: https://tiny.com.br/documentacao-api
- **Shopee**: https://open.shopee.com/documents

## ⚡ ATALHOS E ALIASES

### Criar Aliases (PowerShell)

```powershell
# Adicionar ao $PROFILE
function rw-up { railway up }
function rw-logs { railway logs --follow }
function rw-vars { railway variables }
function rw-db { railway run npx prisma studio }
function rw-health { railway run node scripts/monitor-health.js }
```

### Criar Aliases (Bash/Zsh)

```bash
# Adicionar ao ~/.bashrc ou ~/.zshrc
alias rw-up='railway up'
alias rw-logs='railway logs --follow'
alias rw-vars='railway variables'
alias rw-db='railway run npx prisma studio'
alias rw-health='railway run node scripts/monitor-health.js'
```

## 📞 SUPORTE

### Obter Ajuda

```bash
# Ajuda geral
railway --help

# Ajuda de comando específico
railway up --help
railway variables --help
railway logs --help
```

### Informações de Debug

```bash
# Coletar informações para suporte
echo "=== Railway Info ===" > debug-info.txt
railway --version >> debug-info.txt
railway whoami >> debug-info.txt
railway status >> debug-info.txt
railway variables >> debug-info.txt
railway logs --tail 100 >> debug-info.txt
```

---

**Última atualização:** 2024-01-15  
**Versão Railway CLI:** 4.15.1  
**Projeto:** sistema-mlh-prod
