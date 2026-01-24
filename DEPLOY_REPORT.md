# Relatório de Deploy - Sistema MLH

Data: 2026-01-24

## Status: ⚠️ PARCIAL (deploy OK, integrações pendentes)

- URL pública: https://api-backend-production-af22.up.railway.app
- Projeto Railway: sistema-mlh-prod
- Serviço Railway: api-backend

## Deploy / Runtime

- `railway service status`: SUCCESS
- Healthcheck do Railway: OK (`/health`)
- `SYNC_AUTO_START`: true (sync automático habilitado)
- Avisos no log: integração Shopee desabilitada (faltando `SHOPEE_SHOP_ID`)

## Variáveis (estado atual)

- ✅ `NODE_ENV=production`
- ✅ `PORT=3000`
- ✅ `DATABASE_URL` (interno Railway)
- ✅ `JWT_SECRET`
- ✅ `TINY_API_KEY`
- ✅ `SHOPEE_PARTNER_ID`
- ✅ `SHOPEE_PARTNER_KEY`
- ⚠️ `SHOPEE_SHOP_ID` (ainda ausente)

## Banco de dados

- `prisma db push` (via `railway ssh`): database em sync com o schema
- Seed (via `railway ssh`, `npm run db:seed:prod`): ajustado para não duplicar em produção; se já existir `PROD001`, o seed é pulado

## Testes executados

### API pública

- `GET /health`: ✅ OK (database: connected)
- `GET /api/produtos`: ✅ OK (retornou 3 itens)
- `POST /api/produtos/sync/tiny`: ❌ FAIL (500) — causa raiz: Tiny retornando HTTP 403

### Integração Tiny

- Teste via CLI (`TinyClient.buscarProdutos` com env do Railway): ❌ FAIL (HTTP 403)

### Integração Shopee

- Teste básico de assinatura (build URL): ⚠️ NÃO EXECUTADO — faltando `SHOPEE_SHOP_ID`

## Correções aplicadas durante o deploy

- Corrigido erro de build “`/prisma`: not found”:
  - Adicionado Dockerfile na raiz do repositório e ajustado `railway.json` para usar `dockerfilePath: "Dockerfile"`
  - Adicionado `.dockerignore` na raiz para reduzir o contexto de build
  - Expandido `watchPatterns` para incluir arquivos da raiz
- Corrigido warning/erro do `express-rate-limit` em ambiente com proxy:
  - `app.set('trust proxy', 1)` no Express

## Pendências / Próximos passos

1. **Obter e configurar `SHOPEE_SHOP_ID`**
   - Acesse https://open.shopee.com
   - Faça login
   - Vá em Developer Center
   - Em “My Applications”, localize o “Shop ID”
   - Rode:
     - `railway variable set -s api-backend SHOPEE_SHOP_ID="<SEU_SHOP_ID>"`

2. **Corrigir acesso ao Tiny (HTTP 403)**
   - Verificar no painel Tiny se o token tem permissões/escopo correto
   - Confirmar se a conta/loja está autorizada para a API v3
   - Após corrigir, reexecutar:
     - `curl -X POST https://api-backend-production-af22.up.railway.app/api/produtos/sync/tiny`

3. **Revalidar integrações após Shop ID + Tiny OK**
   - `railway run -s api-backend node backend/scripts/test-integrations.js`

4. **Segurança (recomendado)**
   - Como valores de variáveis já apareceram em output de terminal nesta sessão, recomenda-se rotacionar tokens/keys (Tiny e Shopee) e reaplicar no Railway.
