# Mapeamento SKU Shopee → Tiny

- UI: `/mapeamento`
- API (protegida):
  - `GET /api/mapeamento/pendentes?days=30` (header `x-admin-secret`)
  - `GET /api/mapeamento/listar` (header `x-admin-secret`)
  - `GET /api/mapeamento/buscar-tiny?q=...` (header `x-admin-secret`)
  - `POST /api/mapeamento/adicionar` (header `x-admin-secret`)
  - `POST /api/mapeamento/importar` (header `x-admin-secret`)

A proteção usa o mesmo segredo do módulo Shopee OAuth: `OAUTH_ADMIN_SECRET`.

## Importação em lote (rápido)

Use a UI `/mapeamento` (seção "Importar em lote") ou faça via API:

```bash
curl -X POST "$BASE_URL/api/mapeamento/importar" \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $OAUTH_ADMIN_SECRET" \
  -d '{
    "atualizarCusto": true,
    "items": [
      {"skuShopee": "27083093496-EXEMPLO", "codigoTiny": "12345"}
    ]
  }'
```
