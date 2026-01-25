# Mapeamento SKU Shopee → Tiny

- UI: `/mapeamento`
- API (protegida):
  - `GET /api/mapeamento/pendentes?days=30` (header `x-admin-secret`)
  - `GET /api/mapeamento/buscar-tiny?q=...` (header `x-admin-secret`)
  - `POST /api/mapeamento/adicionar` (header `x-admin-secret`)

A proteção usa o mesmo segredo do módulo Shopee OAuth: `OAUTH_ADMIN_SECRET`.
