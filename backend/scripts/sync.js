"use strict";
// ==========================================
// SCRIPT SYNC MANUAL - Sincronização Completa
// ==========================================
Object.defineProperty(exports, "__esModule", { value: true });
const service_1 = require("../src/modules/produtos/service");
const service_2 = require("../src/modules/financeiro/service");
const service_3 = require("../src/modules/ads/service");
const logger_1 = require("../src/shared/logger");
const database_1 = require("../src/shared/database");
async function syncManual() {
    try {
        logger_1.logger.info('🚀 Iniciando sincronização manual completa...');
        // Conectar ao banco
        await (0, database_1.connectDatabase)();
        // 1. Sincronizar produtos do Tiny
        logger_1.logger.info('📦 Sincronizando produtos do Tiny...');
        const produtoService = new service_1.ProdutoService();
        const resultadoProdutos = await produtoService.syncProdutosTiny();
        logger_1.logger.info(`✅ Produtos: ${resultadoProdutos.total} processados`);
        // 2. Sincronizar contas a pagar
        logger_1.logger.info('💰 Sincronizando contas a pagar...');
        const financeiroService = new service_2.FinanceiroService();
        const resultadoPagar = await financeiroService.syncContasPagar();
        logger_1.logger.info(`✅ Contas a pagar: ${resultadoPagar.total} processadas`);
        // 3. Sincronizar contas a receber
        logger_1.logger.info('💵 Sincronizando contas a receber...');
        const resultadoReceber = await financeiroService.syncContasReceber();
        logger_1.logger.info(`✅ Contas a receber: ${resultadoReceber.total} processadas`);
        // 4. Sincronizar ads (se tiver access token)
        const shopeeAccessToken = process.env.SHOPEE_ACCESS_TOKEN;
        if (shopeeAccessToken) {
            logger_1.logger.info('📊 Sincronizando dados de ads do Shopee...');
            const adsService = new service_3.AdsService(shopeeAccessToken);
            const hoje = new Date();
            const trintaDiasAtras = new Date();
            trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
            const startDate = trintaDiasAtras.toISOString().split('T')[0];
            const endDate = hoje.toISOString().split('T')[0];
            const resultadoAds = await adsService.syncAdsShopee(startDate, endDate);
            logger_1.logger.info(`✅ Ads: ${resultadoAds.total} registros sincronizados`);
            // Ratear custos
            logger_1.logger.info('🔄 Rateando custos de ads...');
            const resultadoRateio = await adsService.ratearCustosAds(trintaDiasAtras, hoje);
            logger_1.logger.info(`✅ Rateio: ${resultadoRateio.atualizados} contas atualizadas`);
        }
        else {
            logger_1.logger.warn('⚠️  SHOPEE_ACCESS_TOKEN não configurado, pulando sync de ads');
        }
        logger_1.logger.info('🎉 Sincronização manual concluída com sucesso!');
        // Desconectar do banco
        await (0, database_1.disconnectDatabase)();
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('❌ Erro na sincronização manual', { error });
        process.exit(1);
    }
}
// Executar sincronização
syncManual();
//# sourceMappingURL=sync.js.map