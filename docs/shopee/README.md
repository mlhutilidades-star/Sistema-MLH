# Shopee — Integração Contract-Driven

## Visão Geral

Esta integração segue a abordagem **contract-driven**: toda comunicação com a
Shopee Open Platform é definida e validada por um contrato YAML centralizado.

**Regra de ouro:** a integração **só pode mapear campos definidos no contrato**.
Qualquer campo novo deve ser adicionado em
`contracts/shopee.endpoints.yaml` antes de ser usado no código.

---

## Estrutura de Arquivos

```
contracts/
  shopee.endpoints.yaml        ← Single source of truth

docs/shopee/
  01_INTRODUCAO.md
  02_AUTENTICACAO_E_ASSINATURA.md
  03_PEDIDOS.md
  04_FINANCEIRO_MINHA_RENDA.md
  05_SHOPEE_ADS.md
  06_LIMITES_E_ERROS.md
  samples/
    order_detail.sample.json
    ads_spend_by_sku_daily.sample.json

scripts/
  validateShopeeContract.ts    ← Validador do contrato

src/integrations/shopee/
  contract.ts                  ← Loader + helpers do contrato
  ShopeeClient.ts              ← Interface (Pedidos + Financeiro)
  ShopeeClientImpl.ts          ← Implementação stub
  ShopeeAdsClient.ts           ← Interface (Ads)
  ShopeeAdsClientImpl.ts       ← Implementação stub
```

---

## Como Usar

### 1. Validar o Contrato

```bash
npm run validate:contracts
```

O validador verifica:
- Endpoints sem `method` ou `path`
- Campos `required` com TODO pendente
- Campos sem `type` definido
- Path contendo "TODO"

**Erros** (exit code 1) = bloqueiam o build.  
**Warnings** = TODOs informativos que não bloqueiam, mas devem ser resolvidos antes de produção.

### 2. Capturar Samples Reais

Para confirmar os TODOs, você precisa de acesso real à API da Shopee.

1. Configure as variáveis de ambiente:
   ```bash
   export SHOPEE_PARTNER_ID="seu_partner_id"
   export SHOPEE_PARTNER_KEY="sua_chave_secreta"
   export SHOPEE_SHOP_ID="sua_shop_id"
   export SHOPEE_ACCESS_TOKEN="token_obtido_via_auth"
   ```

2. Faça uma chamada real ao endpoint e salve o response:
   ```bash
   # Exemplo com curl (substituir valores):
   curl -s "https://partner.shopeemobile.com/api/v2/order/get_order_detail?\
   partner_id=123&timestamp=$(date +%s)&access_token=TOKEN\
   &shop_id=456&sign=COMPUTED_SIGN&order_sn_list=ORDER_SN" \
   | python -m json.tool > docs/shopee/samples/order_detail.sample.json
   ```

3. Atualize o contrato YAML com os campos reais encontrados.

4. Execute `npm run validate:contracts` novamente para confirmar.

### 3. Adicionar Novos Campos

1. Edite `contracts/shopee.endpoints.yaml`
2. Adicione o campo em `responseFields` do endpoint correto
3. Se não confirmado, adicione `todo: "Confirmar na doc Shopee"`
4. Execute `npm run validate:contracts`
5. Atualize a interface em `ShopeeClient.ts` ou `ShopeeAdsClient.ts`
6. Atualize o mapping na implementação

### 4. Remover um TODO

Quando confirmar um campo na documentação oficial:

1. Remova a linha `todo:` do campo em `shopee.endpoints.yaml`
2. Atualize o `jsonPath` se necessário
3. Substitua valores placeholder nos samples
4. Execute `npm run validate:contracts` — warnings devem diminuir

---

## Regras da Integração

| Regra | Descrição |
|-------|-----------|
| **Só campos do contrato** | Métodos retornam apenas campos listados em `responseFields` |
| **Erro em campo desconhecido** | `isFieldMapped()` lança erro se campo não existe no contrato |
| **Warning em campos TODO** | `warnUnconfirmedFields()` emite console.warn para campos com TODO |
| **Validação no build** | `npm run build` executa o validador antes de compilar |
| **Sem invenção** | Nunca adicionar endpoint ou campo sem referência oficial |

---

## Status dos Endpoints

| Endpoint                  | Status      | TODOs |
|---------------------------|-------------|-------|
| `getAuthUrl`              | 🟡 Parcial | 1     |
| `getAccessToken`          | 🟡 Parcial | 1     |
| `refreshAccessToken`      | ✅ OK       | 0     |
| `listOrders`              | 🟡 Parcial | 2     |
| `getOrderDetail`          | 🟡 Parcial | 2     |
| `getEscrowDetail`         | 🟡 Parcial | 3     |
| `getAdsSpendBySkuDaily`   | 🔴 Crítico | 5     |

**Legenda:**
- ✅ OK = todos os campos confirmados
- 🟡 Parcial = funcional mas com TODOs pendentes
- 🔴 Crítico = path ou campos essenciais não confirmados

---

## Próximos Passos

1. [ ] Obter acesso ao Shopee Open Platform (partner account)
2. [ ] Capturar samples reais de cada endpoint
3. [ ] Confirmar todos os TODOs e atualizar o contrato
4. [ ] Implementar `computeSign()` com HMAC-SHA256 real
5. [ ] Implementar `httpGet()` / `httpPost()` com retry
6. [ ] Adicionar testes unitários com mocks baseados nos samples
7. [ ] Adicionar integração com Mercado Livre e TikTok Shop (mesma abordagem contract-driven)
