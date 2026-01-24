# ==========================================
# SETUP AUTOMÁTICO - SISTEMA MLH RAILWAY
# ==========================================

Write-Host "🚀 Setup Automático Sistema MLH no Railway" -ForegroundColor Cyan
Write-Host ""

# Verificar Railway CLI
Write-Host "📋 Verificando Railway CLI..." -ForegroundColor Yellow
if (!(Get-Command railway -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Railway CLI não encontrado. Instalando..." -ForegroundColor Red
    npm install -g @railway/cli
} else {
    $version = railway --version
    Write-Host "✅ Railway CLI instalado: $version" -ForegroundColor Green
}

# Verificar login
Write-Host ""
Write-Host "📋 Verificando login Railway..." -ForegroundColor Yellow
$whoami = railway whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Não logado. Execute: railway login" -ForegroundColor Red
    exit 1
} else {
    Write-Host "✅ $whoami" -ForegroundColor Green
}

# Informações do projeto
Write-Host ""
Write-Host "📊 PROJETO CRIADO:" -ForegroundColor Cyan
Write-Host "  Nome: sistema-mlh-prod" -ForegroundColor White
Write-Host "  URL: https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f" -ForegroundColor White

# Gerar JWT Secret
Write-Host ""
Write-Host "🔑 Gerando JWT Secret..." -ForegroundColor Yellow
$jwtSecret = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Write-Host "✅ JWT_SECRET gerado" -ForegroundColor Green

# Criar arquivo com variáveis
Write-Host ""
Write-Host "📝 Criando arquivo de configuração..." -ForegroundColor Yellow
$envContent = @"
# ==========================================
# VARIÁVEIS DE AMBIENTE - RAILWAY
# Configure no painel: https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f
# ==========================================

# Geradas automaticamente
NODE_ENV=production
PORT=3000
JWT_SECRET=$jwtSecret

# Database (criado automaticamente pelo Railway PostgreSQL)
DATABASE_URL=postgresql://...

# Tiny ERP v3 (OBRIGATÓRIO - Obter em https://tiny.com.br)
TINY_API_KEY=SEU_TOKEN_TINY_AQUI
TINY_BASE_URL=https://api.tiny.com.br/api/v3

# Shopee Open API v2 (OBRIGATÓRIO - Obter em https://open.shopee.com)
SHOPEE_PARTNER_ID=SEU_PARTNER_ID_AQUI
SHOPEE_PARTNER_KEY=SEU_PARTNER_KEY_AQUI
SHOPEE_SHOP_ID=SEU_SHOP_ID_AQUI
SHOPEE_BASE_URL=https://partner.shopeemobile.com/api/v2

# Configurações opcionais
SYNC_INTERVAL_HOURS=4
SYNC_AUTO_START=true
CORS_ORIGIN=*
LOG_LEVEL=info
"@

$envContent | Out-File -FilePath "railway-env-vars.txt" -Encoding UTF8
Write-Host "✅ Arquivo criado: railway-env-vars.txt" -ForegroundColor Green

# Próximos passos
Write-Host ""
Write-Host "==========================================  " -ForegroundColor Cyan
Write-Host "✅ SETUP INICIAL COMPLETO!" -ForegroundColor Green
Write-Host "=========================================="  -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 PRÓXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1️⃣  Configurar Variáveis de Ambiente:" -ForegroundColor White
Write-Host "   • Acesse: https://railway.com/project/12e34a8b-1ad0-4204-bd2d-2de4eb73f88f" -ForegroundColor Gray
Write-Host "   • Clique em 'New Service' > 'Empty Service' > Nome: 'api-backend'" -ForegroundColor Gray
Write-Host "   • Vá em 'Variables' e adicione as variáveis do arquivo railway-env-vars.txt" -ForegroundColor Gray
Write-Host ""
Write-Host "2️⃣  Obter Chaves API:" -ForegroundColor White
Write-Host "   📦 Tiny ERP:" -ForegroundColor Cyan
Write-Host "      • Acesse: https://tiny.com.br" -ForegroundColor Gray
Write-Host "      • Vá em: Configurações > API > Gerar Token" -ForegroundColor Gray
Write-Host "      • Copie o token e adicione em TINY_API_KEY" -ForegroundColor Gray
Write-Host ""
Write-Host "   🛒 Shopee:" -ForegroundColor Cyan
Write-Host "      • Acesse: https://open.shopee.com" -ForegroundColor Gray
Write-Host "      • Crie uma aplicação" -ForegroundColor Gray
Write-Host "      • Copie: Partner ID, Partner Key, Shop ID" -ForegroundColor Gray
Write-Host ""
Write-Host "3️⃣  Fazer Deploy:" -ForegroundColor White
Write-Host "   cd backend" -ForegroundColor Gray
Write-Host "   railway service" -ForegroundColor Gray
Write-Host "   railway up" -ForegroundColor Gray
Write-Host ""
Write-Host "4️⃣  Configurar Banco de Dados:" -ForegroundColor White
Write-Host "   railway run npx prisma db push" -ForegroundColor Gray
Write-Host "   railway run npm run db:seed" -ForegroundColor Gray
Write-Host ""
Write-Host "==========================================  " -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Dica: Todas as instruções estão documentadas em DEPLOY_GUIDE.md" -ForegroundColor Yellow
Write-Host ""
