# Shopee OAuth — Troubleshooting

## Quando o OAuth travar (popup bloqueado)
1. Verifique se o `OAUTH_ADMIN_SECRET` está configurado em /config.
2. Clique em **Autorizar sem popup** (abre o fluxo na mesma aba).
3. Se ainda falhar, use o modo **Trocar code manualmente**.

## Fluxo sem popup (recomendado)
1. Em /config, clique em **Autorizar sem popup**.
2. Faça login/autorize na Shopee.
3. Você será redirecionado para `/config?shopee_code=...`.
4. A troca do code por tokens é automática e o code é removido da URL.

## Fluxo manual (último recurso)
1. Abra a URL de autorização (mostrada em /config).
2. Copie o `code` retornado no callback.
3. Em /config, abra **Trocar code manualmente** e cole o code.

## Causas comuns
- Popup bloqueado pelo navegador.
- `window.close()` bloqueado.
- Cookies de terceiros desabilitados.
- Admin secret ausente (401 no exchange).
- `code` expirado (>= 9 min).

## Validação rápida
- Endpoint de status:
  - `GET /api/shopee/token-status`
- Tokens válidos:
  - `needsReauth=false`
  - `lastRefreshError=null`
  - `accessTokenExpiresAt` futuro
