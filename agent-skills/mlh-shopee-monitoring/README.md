# MLH Shopee Monitoring

Objetivo: padronizar monitoramento do catálogo Shopee, validade de tokens e saúde do endpoint de rentabilidade.

## Checklist rápido (diário)
1. Verificar status do backend e frontend no Railway.
2. Validar endpoint de rentabilidade:
   - GET /api/anuncios/rentabilidade?limit=1
3. Checar status de tokens (UI /config) e último refresh.
4. Validar sync manual se necessário.

## Indicadores de alerta
- `lastRefreshError` não nulo no status OAuth.
- `needsReauth=true` no status OAuth.
- Endpoint /api/anuncios/rentabilidade retornando `total=0`.
- Sync Shopee falhando com 401/403.

## Ações recomendadas
- Reautorizar Shopee em /config.
- Rodar sync manual do catálogo.
- Conferir tabelas `anuncios` e `anuncio_variacoes`.

## Scripts disponíveis
- `check-status.ps1`: valida endpoints críticos e loga resultados.
- `sync-catalog.ps1`: dispara sync manual via Railway.
