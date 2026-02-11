# Limites e Erros — Shopee Open Platform

> **Fonte primária**: `docs/shopee/01_INTRODUCAO.md` (dados já no repo) +
> documentação oficial Shopee Open Platform.
> Campos marcados com `TODO` precisam ser confirmados na doc oficial.

---

## 1. Rate Limits

### 1.1. Limites Gerais (conforme repo)

| Tipo              | Limite              | Janela    |
|-------------------|---------------------|-----------|
| Requisições totais | 10.000 por shop    | 24 horas  |

> `TODO`: Confirmar na doc Shopee (atualizada em 10/02/2026):
> - Se o limite é por shop ou por partner_id
> - Se há limites diferenciados por endpoint
> - Se há limites por segundo (burst)

### 1.2. Limites por Endpoint (prováveis)

| Endpoint                       | Limite provável    | Confirmado? |
|--------------------------------|--------------------| ------------|
| `/api/v2/order/get_order_list` | `TODO`             | `TODO`      |
| `/api/v2/order/get_order_detail` | `TODO`           | `TODO`      |
| `/api/v2/payment/get_escrow_detail` | `TODO`        | `TODO`      |
| `/api/v2/ads/get_daily_report`  | `TODO`            | `TODO`      |
| `/api/v2/auth/token/get`       | `TODO`             | `TODO`      |
| `/api/v2/auth/access_token/get` | `TODO`            | `TODO`      |

### 1.3. Headers de Rate Limit

> `TODO`: Confirmar se a Shopee retorna headers de rate limit no response:
> - `X-RateLimit-Limit`
> - `X-RateLimit-Remaining`
> - `Retry-After`

---

## 2. Códigos de Erro Comuns

### 2.1. Estrutura do Erro

Todas as responses da Shopee v2 seguem esta estrutura:

```json
{
  "error": "error.code.here",
  "message": "Human-readable error message",
  "request_id": "uuid-for-debugging",
  "response": null
}
```

### 2.2. Tabela de Erros

| Código de Erro                    | HTTP Status | Descrição                               | Ação recomendada |
|-----------------------------------|-------------|----------------------------------------|------------------|
| (vazio)                           | 200         | Sucesso                                | — |
| `error_auth`                      | 403         | Falha de autenticação                  | Verificar partner_id/sign |
| `error_permission`                | 403         | Sem permissão para o recurso           | Verificar escopos |
| `error_param`                     | 400         | Parâmetro inválido ou ausente          | Validar params |
| `error_sign`                      | 403         | Assinatura HMAC inválida               | Recalcular sign |
| `error_not_found`                 | 404         | Recurso não encontrado                 | Verificar ID |
| `error_too_many_request`          | 429         | Rate limit atingido                    | Exponential backoff |
| `error_server`                    | 500         | Erro interno Shopee                    | Retry com backoff |
| `error_token_invalid`             | 403         | Access token expirado/inválido         | Refresh token |
| `error_shop_not_found`            | 404         | Shop ID inválido                       | Verificar shop_id |

> `TODO`: Confirmar na doc Shopee (atualizada em 10/02/2026) a lista completa
> de códigos de erro. Os acima são os mais prováveis baseados no padrão da API.

---

## 3. Estratégia de Retry / Backoff Idempotente

### 3.1. Princípios

1. **Idempotência**: Só fazer retry em operações de leitura (GET).
   Para operações de escrita (POST/PUT), verificar se a operação completou antes de retry.
2. **Exponential Backoff**: Aumentar o tempo entre tentativas exponencialmente.
3. **Jitter**: Adicionar variação aleatória para evitar thundering herd.
4. **Max Retries**: Limitar o número máximo de tentativas.

### 3.2. Configuração Padrão

```typescript
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,       // 1 segundo
  maxDelayMs: 30000,       // 30 segundos
  backoffMultiplier: 2,
  jitterPercent: 0.25,     // ±25%
};
```

### 3.3. Pseudocódigo

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  config = RETRY_CONFIG
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error)) {
        throw error; // Erro não retentável
      }

      if (attempt === config.maxRetries) {
        break; // Esgotou tentativas
      }

      const delay = calculateDelay(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRetryable(error: ShopeeApiError): boolean {
  const retryableCodes = [
    'error_too_many_request',
    'error_server',
  ];
  return retryableCodes.includes(error.code);
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const base = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );
  const jitter = base * config.jitterPercent * (Math.random() * 2 - 1);
  return Math.max(0, base + jitter);
}
```

### 3.4. Quando NÃO fazer retry

| Código de erro        | Motivo para não retry |
|-----------------------|-----------------------|
| `error_auth`          | Credenciais erradas — retry não resolve |
| `error_permission`    | Falta escopo — retry não resolve |
| `error_param`         | Parâmetro errado — retry não resolve |
| `error_sign`          | Assinatura errada — retry não resolve |
| `error_not_found`     | Recurso não existe — retry não resolve |
| `error_token_invalid` | Precisa renovar token, não retry cego |

### 3.5. Fluxo especial: Token Expirado

```
Request → error_token_invalid
    │
    ▼
Refresh Token (POST /auth/access_token/get)
    │
    ├─ Sucesso → Retry request original com novo token
    │
    └─ Falha → Reautenticar (fluxo completo OAuth)
```

---

## 4. Timeouts

| Tipo                | Valor recomendado | Notas |
|---------------------|-------------------|-------|
| Connection timeout  | 10 segundos       | Tempo para estabelecer conexão |
| Read timeout        | 30 segundos       | Conforme `01_INTRODUCAO.md` |
| Total timeout       | 60 segundos       | Inclui retries |

---

## 5. Logging e Observabilidade

### Campos obrigatórios no log de cada request

```json
{
  "timestamp": "2026-02-11T10:30:00Z",
  "endpoint": "/api/v2/order/get_order_list",
  "method": "GET",
  "shop_id": 123456789,
  "request_id": "uuid-from-response",
  "status_code": 200,
  "error_code": "",
  "latency_ms": 350,
  "retry_attempt": 0
}
```

### Alertas sugeridos

| Condição                              | Severidade | Ação |
|---------------------------------------|------------|------|
| Rate limit atingido (>3x em 1 hora)  | WARNING    | Revisar frequência de polling |
| Erro de auth (>1x em 5 min)          | CRITICAL   | Verificar credenciais |
| Erro de servidor (>5x em 10 min)     | WARNING    | Aguardar / contatar Shopee |
| Latência > 10s (média de 5 min)      | WARNING    | Avaliar carga |

---

## 6. TODOs Pendentes

| # | Item | Status |
|---|------|--------|
| 1 | Confirmar se limite é por shop ou partner | `TODO` |
| 2 | Confirmar limites por endpoint | `TODO` |
| 3 | Confirmar headers de rate limit no response | `TODO` |
| 4 | Confirmar lista completa de códigos de erro | `TODO` |
| 5 | Capturar exemplos reais de erros | `TODO` |
