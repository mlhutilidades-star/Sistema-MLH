param(
  [string]$ApiBase = "https://api-backend-production-af22.up.railway.app"
)

$ErrorActionPreference = "Stop"

Write-Host "== Health =="
try {
  $health = Invoke-RestMethod -Uri "$ApiBase/health" -Method Get
  Write-Host "Health OK: $($health.status)"
} catch {
  Write-Host "Health FAIL: $($_.Exception.Message)"
}

Write-Host "== Rentabilidade =="
try {
  $rent = Invoke-RestMethod -Uri "$ApiBase/api/anuncios/rentabilidade?limit=1" -Method Get
  Write-Host "Rentabilidade OK: total=$($rent.total)"
} catch {
  Write-Host "Rentabilidade FAIL: $($_.Exception.Message)"
}

Write-Host "== Ads Status =="
try {
  $ads = Invoke-RestMethod -Uri "$ApiBase/api/ads/status" -Method Get
  Write-Host "Ads OK: available=$($ads.data.available) lastStatus=$($ads.data.lastStatus)"
} catch {
  Write-Host "Ads FAIL: $($_.Exception.Message)"
}
