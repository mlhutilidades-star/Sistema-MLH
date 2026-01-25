/**
 * 🧪 Script de Teste de Integrações (runtime)
 *
 * - Roda com `node`
 * - Usa o código compilado em `dist/src/*`
 * - Não imprime tokens/keys
 */

const { TinyClient } = require('../dist/src/integrations/tiny/client');
const { buildShopeeUrl } = require('../dist/src/integrations/shopee/auth');

function isConfigured(name) {
  const value = process.env[name];
  return !!value && value !== 'SEU_TOKEN_TINY_AQUI';
}

// ==========================================
// TESTES TINY ERP v3
// ==========================================

async function testTiny() {
  console.log('\n📦 ==========================================');
  console.log('📦 TESTANDO TINY ERP v3 API');
  console.log('📦 ==========================================\n');

  if (!isConfigured('TINY_API_KEY')) {
    console.error('❌ TINY_API_KEY não configurada');
    return false;
  }

  try {
    const tiny = new TinyClient();

    console.log('🔍 Teste 1: Tiny /produtos.pesquisa (página 1)...');
    const resp = await tiny.buscarProdutos(1);
    const statusProcRaw = resp?.retorno?.status_processamento;
    const statusProc = statusProcRaw == null ? null : Number(statusProcRaw);
    const status = String(resp?.retorno?.status || '').toUpperCase();

    // Tiny API v3 usa status_processamento=3; endpoints legados via API2 retornam status=OK.
    const ok = statusProc === 3 || status === 'OK';
    if (!ok) {
      console.error(
        `❌ Tiny respondeu status_processamento=${String(statusProcRaw)} status=${String(resp?.retorno?.status)}`
      );
      return false;
    }

    console.log('✅ Tiny ERP: OK');
    return true;
  } catch (error) {
    console.error('❌ Tiny ERP: FAIL');
    console.error('Mensagem:', error?.message || error);
    return false;
  }
}

// ==========================================
// TESTES SHOPEE OPEN API v2
// ==========================================

async function testShopee() {
  console.log('\n🛒 ==========================================');
  console.log('🛒 TESTANDO SHOPEE OPEN API v2');
  console.log('🛒 ==========================================\n');

  const partnerIdOk = isConfigured('SHOPEE_PARTNER_ID');
  const partnerKeyOk = isConfigured('SHOPEE_PARTNER_KEY');
  const shopIdOk = isConfigured('SHOPEE_SHOP_ID');

  if (!partnerIdOk || !partnerKeyOk || !shopIdOk) {
    console.error('❌ Credenciais Shopee incompletas');
    console.log('💡 Necessário configurar: SHOPEE_PARTNER_ID, SHOPEE_PARTNER_KEY, SHOPEE_SHOP_ID');
    return false;
  }

  try {
    console.log('🔍 Teste 1: Gerar URL assinada (sem OAuth)...');
    const url = buildShopeeUrl('/product/get_item_list', { offset: 0, page_size: 1 });
    console.log('✅ Shopee: OK (assinatura gerada)');
    console.log(`   (prévia) ${String(url).substring(0, 100)}...`);
    console.log('⚠️  Nota: chamadas reais exigem OAuth2/access_token');
    return true;
  } catch (error) {
    console.error('❌ Shopee: FAIL');
    console.error('Mensagem:', error?.message || error);
    return false;
  }
}

// ==========================================
// TESTE DE RATE LIMITING (Tiny)
// ==========================================

async function testRateLimiting() {
  console.log('\n⏱️  ==========================================');
  console.log('⏱️  TESTANDO RATE LIMITING (Tiny)');
  console.log('⏱️  ==========================================\n');

  if (!isConfigured('TINY_API_KEY')) {
    console.log('⚠️  Pulando (TINY_API_KEY não configurada)');
    return true;
  }

  try {
    const tiny = new TinyClient();
    const start = Date.now();

    for (let i = 1; i <= 3; i++) {
      await tiny.buscarProdutos(1);
      console.log(`   ✅ Requisição ${i} OK`);
    }

    const total = Date.now() - start;
    console.log(`✅ Concluído em ${total}ms`);
    return true;
  } catch (error) {
    console.error('❌ Rate limiting: FAIL');
    console.error('Mensagem:', error?.message || error);
    return false;
  }
}

// ==========================================
// RELATÓRIO FINAL
// ==========================================

async function generateReport(results) {
  console.log('\n📊 ==========================================');
  console.log('📊 RELATÓRIO DE TESTES');
  console.log('📊 ==========================================\n');

  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(Boolean).length;
  const failed = total - passed;

  console.log(`Total de testes: ${total}`);
  console.log(`✅ Passaram: ${passed}`);
  console.log(`❌ Falharam: ${failed}`);
  console.log('');

  Object.entries(results).forEach(([name, ok]) => {
    console.log(`${ok ? '✅' : '❌'} ${name}`);
  });

  console.log('\n==========================================\n');
  return failed === 0 ? 0 : 1;
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  🧪 TESTE DE INTEGRAÇÕES - SISTEMA MLH ║');
  console.log('╚════════════════════════════════════════╝');

  const results = {
    'Tiny ERP': await testTiny(),
    'Shopee (assinatura)': await testShopee(),
    'Rate Limiting (Tiny)': await testRateLimiting(),
  };

  const exitCode = await generateReport(results);
  process.exit(exitCode);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Erro fatal:', error?.message || error);
    process.exit(1);
  });
}

module.exports = { testTiny, testShopee, testRateLimiting };
