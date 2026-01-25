// ==========================================
// SCRIPT SYNC MANUAL - Sincronização Completa
// ==========================================

import { ProdutoService } from '../src/modules/produtos/service';
import { FinanceiroService } from '../src/modules/financeiro/service';
import { AdsService } from '../src/modules/ads/service';
import { logger } from '../src/shared/logger';
import { connectDatabase, disconnectDatabase } from '../src/shared/database';

type SyncService = 'all' | 'tiny' | 'shopee';

function parseServiceArg(argv: string[]): SyncService {
  const idx = argv.findIndex((a) => a === '--service' || a.startsWith('--service='));
  if (idx === -1) return 'all';

  const arg = argv[idx];
  const value = arg.includes('=') ? arg.split('=')[1] : argv[idx + 1];
  if (!value) return 'all';

  const v = value.toLowerCase();
  if (v === 'tiny') return 'tiny';
  if (v === 'shopee') return 'shopee';
  if (v === 'all') return 'all';
  return 'all';
}

async function syncManual() {
  try {
    const service = parseServiceArg(process.argv.slice(2));
    logger.info(`🚀 Iniciando sincronização manual (${service})...`);

    // Conectar ao banco
    await connectDatabase();

    const shouldRunTiny = service === 'all' || service === 'tiny';
    const shouldRunShopee = service === 'all' || service === 'shopee';

    // Tiny: produtos + financeiro
    if (shouldRunTiny) {
      logger.info('📦 Sincronizando produtos do Tiny...');
      const produtoService = new ProdutoService();
      const resultadoProdutos = await produtoService.syncProdutosTiny();
      logger.info(`✅ Tiny Produtos: ${resultadoProdutos.total} processados`);

      logger.info('💰 Sincronizando contas a pagar...');
      const financeiroService = new FinanceiroService();
      const resultadoPagar = await financeiroService.syncContasPagar();
      logger.info(`✅ Contas a pagar: ${resultadoPagar.total} processadas`);

      logger.info('💵 Sincronizando contas a receber...');
      const resultadoReceber = await financeiroService.syncContasReceber();
      logger.info(`✅ Contas a receber: ${resultadoReceber.total} processadas`);
    }

    // Shopee: produtos + ads + rateio (se tiver tokens)
    if (shouldRunShopee) {
      const shopeeAccessToken = process.env.SHOPEE_ACCESS_TOKEN;
      if (!shopeeAccessToken) {
        logger.warn('⚠️  SHOPEE_ACCESS_TOKEN não configurado, pulando sync Shopee');
      } else {
        logger.info('🛒 Sincronizando produtos do Shopee...');
        const produtoServiceShopee = new ProdutoService(shopeeAccessToken);
        const resultadoShopeeProdutos = await produtoServiceShopee.syncProdutosShopee();
        logger.info(`✅ Shopee Produtos: ${resultadoShopeeProdutos.total} processados`);

        const adsService = new AdsService(shopeeAccessToken);
        const hoje = new Date();
        const trintaDiasAtras = new Date();
        trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

        const startDate = trintaDiasAtras.toISOString().split('T')[0];
        const endDate = hoje.toISOString().split('T')[0];

        try {
          logger.info('📊 Sincronizando dados de ads do Shopee...');
          const resultadoAds = await adsService.syncAdsShopee(startDate, endDate);
          logger.info(`✅ Ads: ${resultadoAds.total} registros sincronizados`);

          logger.info('🔄 Rateando custos de ads...');
          const resultadoRateio = await adsService.ratearCustosAds(trintaDiasAtras, hoje);
          logger.info(`✅ Rateio: ${resultadoRateio.atualizados} contas atualizadas`);
        } catch (error: any) {
          const msg = String(error?.message || error);
          if (msg.includes('status code 404')) {
            logger.warn('⚠️  Shopee Ads indisponível (404). Pulando Ads/Rateio e concluindo sync Shopee.');
          } else {
            throw error;
          }
        }
      }
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
