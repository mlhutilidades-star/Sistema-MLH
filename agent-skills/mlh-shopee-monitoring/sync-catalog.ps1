param(
  [string]$Service = "api-backend"
)

$ErrorActionPreference = "Stop"

Write-Host "Disparando sync Shopee catálogo..."
railway ssh -s $Service -- node dist/scripts/sync.js --service=shopee --anuncios --days=30
