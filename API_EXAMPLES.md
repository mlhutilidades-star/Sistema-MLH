# 📡 SISTEMA MLH - EXEMPLOS DE USO DA API

## 🌐 Base URL

```
Development: http://localhost:3000
Production: https://seu-app.railway.app
```

---

## 🔍 PRODUTOS

### Listar Todos os Produtos

```bash
curl http://localhost:3000/api/produtos
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx123...",
      "sku": "PROD001",
      "descricao": "Produto Exemplo 1",
      "custoReal": 50.00,
      "precoVenda": 100.00,
      "estoqueTiny": 10,
      "ativo": true
    }
  ],
  "total": 1
}
```

### Filtrar Produtos Ativos

```bash
curl "http://localhost:3000/api/produtos?ativo=true"
```

### Buscar por SKU

```bash
curl "http://localhost:3000/api/produtos?sku=PROD001"
```

### Obter Produto por ID

```bash
curl http://localhost:3000/api/produtos/clx123abc
```

### Sincronizar Produtos do Tiny

```bash
curl -X POST http://localhost:3000/api/produtos/sync/tiny \
  -H "Content-Type: application/json"
```

**Resposta:**
```json
{
  "success": true,
  "message": "Sincronização concluída",
  "data": {
    "total": 150,
    "criados": 10,
    "atualizados": 140
  }
}
```

### Sincronizar Produtos do Shopee

```bash
curl -X POST http://localhost:3000/api/produtos/sync/shopee \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "seu_access_token_shopee"
  }'
```

### Atualizar Custo Real

```bash
curl -X PATCH http://localhost:3000/api/produtos/clx123abc/custo \
  -H "Content-Type: application/json" \
  -d '{
    "custoReal": 55.50
  }'
```

---

## 💰 FINANCEIRO

### Listar Contas a Pagar

```bash
curl http://localhost:3000/api/financeiro/contas-pagar
```

**Resposta:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx456...",
      "vencimento": "2026-02-01T00:00:00.000Z",
      "descricao": "Fornecedor XYZ - Mercadorias",
      "fornecedor": "Fornecedor XYZ Ltda",
      "categoria": "FORNECEDOR",
      "valor": 5000.00,
      "status": "PENDENTE"
    }
  ]
}
```

### Listar Contas a Receber

```bash
curl http://localhost:3000/api/financeiro/contas-receber
```

### Sincronizar Contas a Pagar do Tiny

```bash
curl -X POST http://localhost:3000/api/financeiro/contas-pagar/sync \
  -H "Content-Type: application/json" \
  -d '{
    "dataInicio": "2026-01-01",
    "dataFim": "2026-01-31"
  }'
```

### Sincronizar Contas a Receber do Tiny

```bash
curl -X POST http://localhost:3000/api/financeiro/contas-receber/sync \
  -H "Content-Type: application/json" \
  -d '{
    "dataInicio": "2026-01-01",
    "dataFim": "2026-01-31"
  }'
```

### Fluxo de Caixa

```bash
curl "http://localhost:3000/api/financeiro/fluxo-caixa?dataInicio=2026-01-01&dataFim=2026-01-31"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "periodo": {
      "inicio": "2026-01-01T00:00:00.000Z",
      "fim": "2026-01-31T23:59:59.999Z"
    },
    "pagar": {
      "total": 15000.00,
      "quantidade": 10
    },
    "receber": {
      "bruto": 50000.00,
      "liquido": 45000.00,
      "quantidade": 25
    },
    "saldo": 30000.00
  }
}
```

---

## 📊 ADS (SHOPEE)

### Sincronizar Relatório de Ads

```bash
curl -X POST http://localhost:3000/api/ads/sync \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "seu_access_token_shopee",
    "startDate": "2026-01-01",
    "endDate": "2026-01-31"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "total": 30
  }
}
```

### Ratear Custos de Ads

```bash
curl -X POST http://localhost:3000/api/ads/ratear-custos \
  -H "Content-Type: application/json" \
  -d '{
    "dataInicio": "2026-01-01",
    "dataFim": "2026-01-31"
  }'
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "atualizados": 25,
    "totalGasto": 5000.00
  }
}
```

### Relatório de Performance

```bash
curl "http://localhost:3000/api/ads/relatorio?dataInicio=2026-01-01&dataFim=2026-01-31"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "periodo": {
      "inicio": "2026-01-01",
      "fim": "2026-01-31"
    },
    "totais": {
      "impressoes": 100000,
      "cliques": 5000,
      "gasto": 2500.00,
      "pedidos": 250,
      "gmv": 50000.00
    },
    "metricas": {
      "ctrMedio": 5.0,
      "cpcMedio": 0.50,
      "roasTotal": 20.0
    },
    "detalhes": [
      {
        "data": "2026-01-01",
        "campanhaId": "12345",
        "campanhaNome": "Campanha Teste",
        "impressoes": 5000,
        "cliques": 250,
        "gasto": 125.00,
        "pedidos": 12,
        "gmv": 2400.00,
        "roas": 19.2
      }
    ]
  }
}
```

---

## 🔄 CONCILIAÇÃO

### Processar Extrato Bancário

```bash
curl -X POST http://localhost:3000/api/conciliacao/processar \
  -H "Content-Type: application/json"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "processados": 15
  }
}
```

### Conciliar Contas Automaticamente

```bash
curl -X POST http://localhost:3000/api/conciliacao/conciliar \
  -H "Content-Type: application/json"
```

**Resposta:**
```json
{
  "success": true,
  "data": {
    "conciliados": 8
  }
}
```

---

## 🏥 HEALTH CHECK

### Verificar Saúde da Aplicação

```bash
curl http://localhost:3000/health
```

**Resposta:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-21T10:30:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "memory": {
    "rss": 45678912,
    "heapTotal": 18874368,
    "heapUsed": 12345678,
    "external": 1234567
  }
}
```

---

## 🔐 AUTENTICAÇÃO SHOPEE

### Fluxo OAuth2 Completo

#### 1. Gerar URL de Autorização

```javascript
const crypto = require('crypto');

const partnerId = 123456;
const partnerKey = 'sua_chave';
const redirectUrl = 'https://seu-app.com/callback';
const path = '/api/v2/auth/authorize';
const timestamp = Math.floor(Date.now() / 1000);

const baseString = `${partnerId}${path}${timestamp}`;
const sign = crypto.createHmac('sha256', partnerKey)
  .update(baseString)
  .digest('hex');

const authUrl = `https://partner.shopeemobile.com/api/v2/auth/authorize?partner_id=${partnerId}&redirect=${redirectUrl}&sign=${sign}&timestamp=${timestamp}`;

console.log('Redirecione o usuário para:', authUrl);
```

#### 2. Trocar Code por Access Token

Após o usuário autorizar, você receberá um `code` no callback:

```bash
curl -X POST 'https://partner.shopeemobile.com/api/v2/auth/token/get' \
  -H 'Content-Type: application/json' \
  -d '{
    "code": "codigo_recebido",
    "partner_id": 123456,
    "shop_id": 789012
  }'
```

**Resposta:**
```json
{
  "access_token": "token_de_acesso",
  "expire_in": 14400,
  "refresh_token": "token_de_refresh",
  "partner_id": 123456,
  "shop_id": 789012
}
```

#### 3. Usar Access Token nas Requisições

```bash
curl -X POST http://localhost:3000/api/produtos/sync/shopee \
  -H "Content-Type: application/json" \
  -d '{
    "accessToken": "token_de_acesso_obtido"
  }'
```

---

## 🧪 TESTES COM CURL

### Script Completo de Teste

Salve como `test-api.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:3000"

echo "🔍 Testando Health Check..."
curl -s "$BASE_URL/health" | jq

echo "\n📦 Sincronizando Produtos do Tiny..."
curl -s -X POST "$BASE_URL/api/produtos/sync/tiny" | jq

echo "\n📊 Listando Produtos..."
curl -s "$BASE_URL/api/produtos" | jq

echo "\n💰 Sincronizando Contas a Pagar..."
curl -s -X POST "$BASE_URL/api/financeiro/contas-pagar/sync" \
  -H "Content-Type: application/json" \
  -d '{"dataInicio":"2026-01-01","dataFim":"2026-01-31"}' | jq

echo "\n💵 Fluxo de Caixa..."
curl -s "$BASE_URL/api/financeiro/fluxo-caixa?dataInicio=2026-01-01&dataFim=2026-01-31" | jq

echo "\n✅ Testes concluídos!"
```

Execute:
```bash
chmod +x test-api.sh
./test-api.sh
```

---

## 📝 POSTMAN COLLECTION

### Importar no Postman

Crie um arquivo `sistema-mlh.postman_collection.json`:

```json
{
  "info": {
    "name": "Sistema MLH API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health Check",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/health",
          "host": ["{{baseUrl}}"],
          "path": ["health"]
        }
      }
    },
    {
      "name": "Listar Produtos",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}/api/produtos",
          "host": ["{{baseUrl}}"],
          "path": ["api", "produtos"]
        }
      }
    },
    {
      "name": "Sync Produtos Tiny",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "url": {
          "raw": "{{baseUrl}}/api/produtos/sync/tiny",
          "host": ["{{baseUrl}}"],
          "path": ["api", "produtos", "sync", "tiny"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000"
    }
  ]
}
```

Importe no Postman e configure a variável `baseUrl`.

---

## 🚀 SCRIPTS NPM ÚTEIS

```bash
# Desenvolvimento local
npm run dev

# Build para produção
npm run build

# Executar produção
npm start

# Sync manual completo
npm run sync

# Popular banco de dados
npm run db:seed

# Gerar Prisma Client
npm run db:generate

# Aplicar migrations
npm run db:push
```

---

**API pronta para uso! 🎉**
