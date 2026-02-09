# Shopee Webhooks (Push Mechanism)

Este documento descreve como habilitar e testar a integração de webhooks Shopee no Sistema MLH.  
Observação: a validação de assinatura é configurável via env, pois a doc oficial de Push Mechanism não estava acessível no momento da implementação. Confirme os headers e a fórmula de assinatura no painel Open Platform e ajuste os envs listados abaixo.

**Endpoint**
- `POST /api/shopee/webhook` (alias: `/api/shopee/push`)

**Fluxo**
- Recebe evento → valida assinatura + timestamp/nonce → persiste em `shopee_webhook_events` → worker processa em background → atualiza `anuncios` e `anuncio_variacoes`.

**Eventos suportados (MVP)**
- Eventos relacionados a itens: atualização de item, preço, estoque, status, variações.  
- Eventos sem `item_id` são marcados como `IGNORED`.

## Configuração no Shopee Open Platform
- URL do webhook: `https://<SEU_DOMINIO_PUBLICO>/api/shopee/webhook`
- Selecione eventos de item/stock/price (nomes exatos conforme painel).
- Configure a secret usada na assinatura.

## Variáveis Railway
Obrigatórias:
- `SHOPEE_WEBHOOK_SECRET`  
  Se não definido, usa `SHOPEE_PARTNER_KEY`.
- `SHOPEE_PARTNER_ID`  
  Usado para montar a base string quando necessário.

Recomendadas:
- `SHOPEE_WEBHOOK_SIGNATURE_HEADER`  
  Cabeçalho que carrega a assinatura. Ex: `x-shopee-signature` ou `authorization`.
- `SHOPEE_WEBHOOK_TIMESTAMP_HEADER`  
  Cabeçalho com timestamp. Ex: `x-shopee-timestamp`.
- `SHOPEE_WEBHOOK_NONCE_HEADER`  
  Cabeçalho com nonce. Ex: `x-shopee-nonce`.
- `SHOPEE_WEBHOOK_SIGNATURE_MODE`  
  Opções: `template`, `body`, `body+timestamp`, `path+timestamp+body`, `partner_id+path+timestamp+body`, `auto`.  
  Valores como `hmac-sha256` são tratados como `template`.
- `SHOPEE_WEBHOOK_SIGNATURE_TEMPLATE`  
  Base string da assinatura. Ex: `${partner_id}${path}${timestamp}${body}`.  
  Tokens aceitos: `partner_id`, `secret`, `path`, `timestamp`, `body`, `shop_id`, `event_type`, `nonce`.
- `SHOPEE_WEBHOOK_SIGNATURE_ENCODING`  
  `hex` ou `base64`. Default: `hex`.
- `SHOPEE_WEBHOOK_SECRET_FORMAT`  
  `utf8` ou `hex`. Default: auto (detecta hex).
- `SHOPEE_WEBHOOK_MAX_SKEW_SEC`  
  Janela anti-replay (default 300s).
- `SHOPEE_WEBHOOK_REQUIRE_TIMESTAMP`  
  Default `true`. Ajuste se o Push Mechanism não enviar timestamp.
- `SHOPEE_WEBHOOK_ALLOW_UNSIGNED`  
  Default `false`. Use apenas em dev.

Verify bypass (apenas para o botao Verify do console Shopee):
- `SHOPEE_WEBHOOK_VERIFY_BYPASS_ENABLED`
  Default `false`. Quando `true`, permite resposta 204 somente se o request nao tiver timestamp ou assinatura.
- `SHOPEE_WEBHOOK_VERIFY_BYPASS_IP_ALLOWLIST`
  Lista de IPs permitidos (CSV). Ex: `202.181.90.36`.
  O IP avaliado e o primeiro de `x-forwarded-for` (quando presente), senao `req.ip`.

Worker:
- `SHOPEE_WEBHOOK_WORKER_ENABLED` (default `true`)
- `SHOPEE_WEBHOOK_WORKER_INTERVAL_MS` (default `5000`)
- `SHOPEE_WEBHOOK_WORKER_BATCH_SIZE` (default `10`)
- `SHOPEE_WEBHOOK_WORKER_MAX_ATTEMPTS` (default `5`)
- `SHOPEE_WEBHOOK_WORKER_FAIL_BACKOFF_MS` (default `30000`)
- `SHOPEE_WEBHOOK_PROCESSING_TIMEOUT_MS` (default `600000`)
- `SHOPEE_WEBHOOK_FETCH_MODELS` (default `true`)

## Teste Local
Script:
- `npm run shopee:webhook:test` (executa `scripts/testShopeeWebhook.ts`)

Via curl (exemplo genérico):
```bash
curl -X POST "http://localhost:3000/api/shopee/webhook" \
  -H "Content-Type: application/json" \
  -H "x-shopee-signature: <ASSINATURA>" \
  -H "x-shopee-timestamp: <TIMESTAMP>" \
  -H "x-shopee-nonce: <NONCE>" \
  -d '{"event_type":"item_update","shop_id":123,"item_id":456,"timestamp":1700000000}'
```

## Reprocessar eventos falhos
SQL (exemplo):
```sql
UPDATE shopee_webhook_events
SET status = 'PENDING'
WHERE status = 'FAILED';
```

## Verify do console Shopee (sem timestamp/assinatura)
1. Defina `SHOPEE_WEBHOOK_VERIFY_BYPASS_ENABLED=true`.
2. Defina `SHOPEE_WEBHOOK_VERIFY_BYPASS_IP_ALLOWLIST=<ip do verify>`.
3. Clique em Verify no console Shopee.
4. Confirme log `webhook_verify_bypass` e status 204.
5. Desative o bypass: `SHOPEE_WEBHOOK_VERIFY_BYPASS_ENABLED=false`.
6. Garanta `SHOPEE_WEBHOOK_REQUIRE_TIMESTAMP=true` e `SHOPEE_WEBHOOK_ALLOW_UNSIGNED=false`.

## Observabilidade
Logs:
- `webhook_received`
- `webhook_processed`
- `webhook_failed`
- `webhook_ignored`
- `webhook_metrics`

Métricas (logs agregados):
- `received`, `processed`, `failed`, `ignored`
- `avgProcessLatencyMs`, `avgQueueLatencyMs`
- `queueDepth`
