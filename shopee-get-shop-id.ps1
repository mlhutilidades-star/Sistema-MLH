param(
  [string]$BaseUrl = "https://api-backend-production-af22.up.railway.app",
  [int]$TimeoutSeconds = 900,
  [int]$PollSeconds = 5,
  [switch]$OpenBrowser,
  [switch]$SetRailwayVar,
  [string]$RailwayService = "api-backend",
  [string]$RailwayVarName = "SHOPEE_SHOP_ID"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Join-Url([string]$base, [string]$path) {
  $b = $base.TrimEnd('/')
  $p = $path
  if (-not $p.StartsWith('/')) { $p = '/' + $p }
  return "$b$p"
}

$authorizeEndpoint = Join-Url $BaseUrl "/api/shopee/oauth/authorize-url"
$lastEndpoint = Join-Url $BaseUrl "/api/shopee/oauth/last"
$healthEndpoint = Join-Url $BaseUrl "/health"

Write-Host "BaseUrl: $BaseUrl"
Write-Host "1) Gerando URL de autorização..."

$auth = Invoke-RestMethod -Method Get -Uri $authorizeEndpoint
if (-not $auth -or -not $auth.url) {
  throw "Resposta inesperada de $authorizeEndpoint"
}

Write-Host "RedirectUrl: $($auth.redirectUrl)"
Write-Host "AuthorizeUrl: $($auth.url)"
Write-Host ""
Write-Host "2) Autorize a loja no navegador (Shopee Partner)."

if ($OpenBrowser) {
  try {
    Start-Process $auth.url | Out-Null
    Write-Host "(Browser aberto automaticamente.)"
  } catch {
    Write-Warning "Não consegui abrir o navegador automaticamente. Abra manualmente a URL acima."
  }
}

Write-Host ""
Write-Host "3) Aguardando callback capturar shop_id em /api/shopee/oauth/last ..."

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$shopId = $null

while ((Get-Date) -lt $deadline) {
  $resp = Invoke-RestMethod -Method Get -Uri $lastEndpoint

  if ($resp -and $resp.latest -and $resp.latest.shopId) {
    $shopId = [string]$resp.latest.shopId
    $receivedAt = [string]$resp.latest.receivedAt
    Write-Host "OK: Capturado shop_id=$shopId (receivedAt=$receivedAt)"
    break
  }

  Start-Sleep -Seconds $PollSeconds
}

if (-not $shopId) {
  throw "Timeout: callback não chegou em $TimeoutSeconds segundos. Verifique se o redirect foi cadastrado/whitelist no painel Shopee Partner e tente novamente."
}

if ($SetRailwayVar) {
  Write-Host ""
  Write-Host "4) Setando $RailwayVarName no Railway (service=$RailwayService)..."

  $railwayCmd = Get-Command railway -ErrorAction SilentlyContinue
  if (-not $railwayCmd) {
    throw "Railway CLI não encontrado no PATH. Instale/ative o Railway CLI ou rode sem -SetRailwayVar."
  }

  & railway variables set -s $RailwayService "$RailwayVarName=$shopId"

  Write-Host "Aguardando 10s para restart..."
  Start-Sleep -Seconds 10

  Write-Host "Health:"
  Invoke-RestMethod -Method Get -Uri $healthEndpoint | ConvertTo-Json -Depth 10
}

Write-Host ""
Write-Host "Pronto. shop_id=$shopId"
Write-Host "Se quiser setar no Railway automaticamente, rode com: -SetRailwayVar"
