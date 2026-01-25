param(
  [string]$BaseUrl = "https://api-backend-production-af22.up.railway.app",
  [string]$RailwayService = "api-backend",
  [string]$AdminSecret,
  [int]$TimeoutSeconds = 900,
  [int]$PollSeconds = 5,
  [switch]$OpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Join-Url([string]$base, [string]$path) {
  $b = $base.TrimEnd('/')
  $p = $path
  if (-not $p.StartsWith('/')) { $p = '/' + $p }
  return "$b$p"
}

function New-RandomSecret([int]$bytes = 24) {
  $b = New-Object byte[]($bytes)
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b)
}

$authorizeEndpoint = Join-Url $BaseUrl "/api/shopee/oauth/authorize-url"
$lastEndpoint = Join-Url $BaseUrl "/api/shopee/oauth/last"
$exchangeEndpoint = Join-Url $BaseUrl "/api/shopee/oauth/exchange"

Write-Host "1) Garantindo OAUTH_ADMIN_SECRET no Railway..."
$secret = if ($AdminSecret -and $AdminSecret.Trim().Length -gt 0) { $AdminSecret } else { New-RandomSecret }
# Set sempre (idempotente). Não imprime o valor.
& railway variables set -s $RailwayService "OAUTH_ADMIN_SECRET=$secret" | Out-Null

# `railway variables set` reinicia o serviço. Aguarde para o backend ler o novo secret.
Start-Sleep -Seconds 15

Write-Host "2) Gerando URL de autorização Shopee..."
$auth = Invoke-RestMethod -Method Get -Uri $authorizeEndpoint
if (-not $auth -or -not $auth.url) { throw "Resposta inesperada de $authorizeEndpoint" }
Write-Host "RedirectUrl: $($auth.redirectUrl)"
Write-Host "AuthorizeUrl: $($auth.url)"

if ($OpenBrowser) {
  try { Start-Process $auth.url | Out-Null } catch { }
}

Write-Host "3) Aguardando callback (hasCode=true)..."
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  $resp = Invoke-RestMethod -Method Get -Uri $lastEndpoint
  if ($resp.latest -and $resp.latest.hasCode -and ($resp.latest.shopId -or $resp.latest.hasMainAccountId)) {
    break
  }
  Start-Sleep -Seconds $PollSeconds
}

$resp = Invoke-RestMethod -Method Get -Uri $lastEndpoint
if (-not ($resp.latest -and $resp.latest.hasCode -and ($resp.latest.shopId -or $resp.latest.hasMainAccountId))) {
  throw "Timeout aguardando callback. Confirme login/autorizar e redirect cadastrado/whitelist no painel Shopee Partner.";
}

Write-Host "4) Trocando code por tokens (server-side) e salvando no Railway..."
$tokens = Invoke-RestMethod -Method Post -Uri $exchangeEndpoint -Headers @{ 'x-admin-secret' = $secret } -Body '{}' -ContentType 'application/json'
if (-not $tokens -or -not $tokens.accessToken -or -not $tokens.refreshToken) {
  throw "Falha ao obter tokens (resposta inesperada)."
}

$shopId = if ($tokens.shopId) { [string]$tokens.shopId } elseif ($resp.latest.shopId) { [string]$resp.latest.shopId } else { $null }

# Salvar tokens como variáveis Railway. Não imprime tokens.
# Importante: não setar variáveis ANTES do exchange, pois isso reinicia o serviço
# e apaga o `code` armazenado em memória.
if ($shopId) {
  & railway variables set -s $RailwayService "SHOPEE_SHOP_ID=$shopId" | Out-Null
} else {
  Write-Warning "Não foi possível determinar shop_id para salvar no Railway (callback/exchange não retornou)."
}
& railway variables set -s $RailwayService "SHOPEE_ACCESS_TOKEN=$($tokens.accessToken)" | Out-Null
& railway variables set -s $RailwayService "SHOPEE_REFRESH_TOKEN=$($tokens.refreshToken)" | Out-Null

Write-Host "OK: Tokens salvos no Railway (SHOPEE_ACCESS_TOKEN / SHOPEE_REFRESH_TOKEN)."
Write-Host "shop_id=$shopId"
Write-Host "access_token(masked)=$($tokens.accessTokenMasked)"
Write-Host "refresh_token(masked)=$($tokens.refreshTokenMasked)"
