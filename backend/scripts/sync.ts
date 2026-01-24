// ==========================================
// SCRIPT SYNC MANUAL - Sincronização Completa
// ==========================================

import { ProdutoService } from '../src/modules/produtos/service';
import { FinanceiroService } from '../src/modules/financeiro/service';
import { AdsService } from '../src/modules/ads/service';
import { logger } from '../src/shared/logger';
import { connectDatabase, disconnectDatabase } from '../src/shared/database';

async function syncManual() {
  try {
    logger.info('🚀 Iniciando sincronização manual completa...');

    // Conectar ao banco
    await connectDatabase();

    // 1. Sincronizar produtos do Tiny
    logger.info('📦 Sincronizando produtos do Tiny...');
    const produtoService = new ProdutoService();
    const resultadoProdutos = await produtoService.syncProdutosTiny();
    logger.info(`✅ Produtos: ${resultadoProdutos.total} processados`);

    // 2. Sincronizar contas a pagar
    logger.info('💰 Sincronizando contas a pagar...');
    const financeiroService = new FinanceiroService();
    const resultadoPagar = await financeiroService.syncContasPagar();
    logger.info(`✅ Contas a pagar: ${resultadoPagar.total} processadas`);

    // 3. Sincronizar contas a receber
    logger.info('💵 Sincronizando contas a receber...');
    const resultadoReceber = await financeiroService.syncContasReceber();
    logger.info(`✅ Contas a receber: ${resultadoReceber.total} processadas`);

    // 4. Sincronizar ads (se tiver access token)
    const shopeeAccessToken = process.env.SHOPEE_ACCESS_TOKEN;
    if (shopeeAccessToken) {
      logger.info('📊 Sincronizando dados de ads do Shopee...');
      
      const adsService = new AdsService(shopeeAccessToken);
      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      const startDate = trintaDiasAtras.toISOString().split('T')[0];
      const endDate = hoje.toISOString().split('T')[0];

      const resultadoAds = await adsService.syncAdsShopee(startDate, endDate);
      logger.info(`✅ Ads: ${resultadoAds.total} registros sincronizados`);

      // Ratear custos
      logger.info('🔄 Rateando custos de ads...');
      const resultadoRateio = await adsService.ratearCustosAds(trintaDiasAtras, hoje);
      logger.info(`✅ Rateio: ${resultadoRateio.atualizados} contas atualizadas`);
    } else {
      logger.warn('⚠️  SHOPEE_ACCESS_TOKEN não configurado, pulando sync de ads');
    }

    logger.info('🎉 Sincronização manual concluída com sucesso!');

    // Desconectar do banco
    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Erro na sincronização manual', { error });
    process.exit(1);
  }
}

// Executar sincronização
syncManual();
