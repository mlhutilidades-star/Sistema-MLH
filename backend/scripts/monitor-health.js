/**
 * 🏥 Script de Monitoramento de Health
 * Monitora status da aplicação e dependências
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

// ==========================================
// CONFIGURAÇÃO
// ==========================================

const config = {
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  checkInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000, // 30s
  maxRetries: 3,
  timeout: 5000,
};

const prisma = new PrismaClient();

// ==========================================
// HEALTH CHECKS
// ==========================================

async function checkAPI() {
  try {
    const response = await axios.get(`${config.appUrl}/health`, {
      timeout: config.timeout,
    });

    return {
      status: 'ok',
      statusCode: response.status,
      data: response.data,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    const counts = {
      produtos: await prisma.produto.count(),
      contasPagar: await prisma.contaPagar.count(),
      contasReceber: await prisma.contaReceber.count(),
      extratosBanco: await prisma.extratoBanco.count(),
    };

    return {
      status: 'ok',
      connected: true,
      counts,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'error',
      connected: false,
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkTinyAPI() {
  if (!process.env.TINY_API_KEY || process.env.TINY_API_KEY === 'SEU_TOKEN_TINY_AQUI') {
    return {
      status: 'warning',
      message: 'TINY_API_KEY não configurada',
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const response = await axios.get(
      `${process.env.TINY_BASE_URL || 'https://api.tiny.com.br/api/v3'}/produtos`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TINY_API_KEY}`,
        },
        params: { limit: 1 },
        timeout: config.timeout,
      }
    );

    return {
      status: 'ok',
      statusCode: response.status,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'error',
      statusCode: error.response?.status,
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

async function checkShopeeAPI() {
  if (!process.env.SHOPEE_PARTNER_ID || !process.env.SHOPEE_PARTNER_KEY) {
    return {
      status: 'warning',
      message: 'Credenciais Shopee não configuradas',
      timestamp: new Date().toISOString(),
    };
  }

  // Nota: Shopee requer OAuth2, então verificamos apenas config
  return {
    status: 'configured',
    message: 'Credenciais configuradas (OAuth2 requerido para testes)',
    timestamp: new Date().toISOString(),
  };
}

// ==========================================
// RELATÓRIO DE HEALTH
// ==========================================

async function generateHealthReport() {
  console.log('\n🏥 ==========================================');
  console.log('🏥 HEALTH CHECK - SISTEMA MLH');
  console.log('🏥 ==========================================\n');

  const checks = {
    api: await checkAPI(),
    database: await checkDatabase(),
    tinyAPI: await checkTinyAPI(),
    shopeeAPI: await checkShopeeAPI(),
  };

  // API Status
  console.log('🌐 API Status:');
  if (checks.api.status === 'ok') {
    console.log(`   ✅ Online (${checks.api.statusCode})`);
    console.log(`   URL: ${config.appUrl}`);
  } else {
    console.log(`   ❌ Offline: ${checks.api.message}`);
  }

  // Database Status
  console.log('\n🗄️  Database Status:');
  if (checks.database.status === 'ok') {
    console.log('   ✅ Conectado');
    console.log('   Registros:');
    Object.entries(checks.database.counts).forEach(([table, count]) => {
      console.log(`      • ${table}: ${count}`);
    });
  } else {
    console.log(`   ❌ Erro: ${checks.database.message}`);
  }

  // Tiny ERP Status
  console.log('\n📦 Tiny ERP v3 Status:');
  if (checks.tinyAPI.status === 'ok') {
    console.log(`   ✅ Conectado (${checks.tinyAPI.statusCode})`);
  } else if (checks.tinyAPI.status === 'warning') {
    console.log(`   ⚠️  ${checks.tinyAPI.message}`);
  } else {
    console.log(`   ❌ Erro: ${checks.tinyAPI.message}`);
  }

  // Shopee Status
  console.log('\n🛒 Shopee Open API v2 Status:');
  if (checks.shopeeAPI.status === 'configured') {
    console.log(`   ⚠️  ${checks.shopeeAPI.message}`);
  } else if (checks.shopeeAPI.status === 'warning') {
    console.log(`   ⚠️  ${checks.shopeeAPI.message}`);
  } else {
    console.log(`   ❌ Erro: ${checks.shopeeAPI.message}`);
  }

  // Overall Status
  console.log('\n==========================================');
  const allOk = checks.api.status === 'ok' && checks.database.status === 'ok';
  
  if (allOk) {
    console.log('✅ SISTEMA OPERACIONAL');
  } else {
    console.log('⚠️  SISTEMA COM PROBLEMAS');
  }
  console.log('==========================================\n');

  return checks;
}

// ==========================================
// MONITOR CONTÍNUO
// ==========================================

async function startMonitor() {
  console.log('🏥 Iniciando monitor de health...');
  console.log(`   Intervalo: ${config.checkInterval}ms`);
  console.log(`   URL: ${config.appUrl}`);
  console.log('   Pressione Ctrl+C para parar\n');

  let checkCount = 0;
  let errorCount = 0;

  const monitor = async () => {
    checkCount++;
    console.log(`\n[Check #${checkCount}] ${new Date().toLocaleString()}`);
    
    const checks = await generateHealthReport();
    
    if (checks.api.status !== 'ok' || checks.database.status !== 'ok') {
      errorCount++;
      console.log(`⚠️  Erros detectados: ${errorCount}`);
      
      if (errorCount >= config.maxRetries) {
        console.log('\n❌ ALERTA: Sistema instável!');
        console.log('   Verificar logs e tomar ação corretiva\n');
      }
    } else {
      errorCount = 0;
    }
  };

  // Primeiro check imediato
  await monitor();

  // Checks subsequentes
  setInterval(monitor, config.checkInterval);
}

// ==========================================
// EXECUÇÃO
// ==========================================

async function main() {
  const mode = process.argv[2] || 'once';

  if (mode === 'monitor') {
    await startMonitor();
  } else {
    await generateHealthReport();
    await prisma.$disconnect();
    process.exit(0);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(async (error) => {
    console.error('❌ Erro fatal:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
}

module.exports = { generateHealthReport, startMonitor };
