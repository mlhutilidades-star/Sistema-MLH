// ==========================================
// MÓDULO ADS - SERVICE
// ==========================================

import { getPrismaClient } from '../../shared/database';
import { logger, loggers } from '../../shared/logger';
import { ShopeeClient } from '../../integrations/shopee/client';

export class AdsService {
  private prisma = getPrismaClient();
  private shopeeClient?: ShopeeClient;

  constructor(shopeeAccessToken?: string, shopeeRefreshToken?: string) {
    if (shopeeAccessToken) {
      this.shopeeClient = new ShopeeClient(shopeeAccessToken, shopeeRefreshToken);
    }
  }

  /**
   * Sincronizar dados de ads do Shopee
   */
  async syncAdsShopee(startDate: string, endDate: string) {
    if (!this.shopeeClient) {
      throw new Error('Shopee client não configurado');
    }

    const startTime = Date.now();
    let total = 0;

    try {
      loggers.sync.start('ADS', 'SHOPEE');

      const response = await this.shopeeClient.getAdsDailyPerformance(startDate, endDate);

      if (response.response.data) {
        for (const ad of response.response.data) {
          total++;

          // Converter de centavos para reais
          const gasto = ad.cost / 100;
          const gmv = ad.gmv / 100;
          const cpc = ad.cpc / 100;
          const roas = gasto > 0 ? gmv / gasto : 0;

          await this.prisma.consumoAds.upsert({
            where: {
              data_campanhaId: {
                data: new Date(ad.date),
                campanhaId: ad.campaign_id.toString(),
              },
            },
            create: {
              data: new Date(ad.date),
              campanhaId: ad.campaign_id.toString(),
              campanhaNome: ad.campaign_name,
              impressoes: ad.impressions,
              cliques: ad.clicks,
              gasto,
              pedidos: ad.orders,
              gmv,
              roas,
              ctr: ad.ctr,
              cpc,
            },
            update: {
              campanhaNome: ad.campaign_name,
              impressoes: ad.impressions,
              cliques: ad.clicks,
              gasto,
              pedidos: ad.orders,
              gmv,
              roas,
              ctr: ad.ctr,
              cpc,
            },
          });

          // Mantém uma visão simplificada em `anuncios` (por dia/campanha), usada por alguns relatórios.
          const rendaGerada = gmv;
          const custoProdutos = 0;
          const lucro = rendaGerada - custoProdutos - gasto;
          const roi = gasto > 0 ? (lucro / gasto) * 100 : 0;

          await this.prisma.anuncio.upsert({
            where: {
              data_campanhaId: {
                data: new Date(ad.date),
                campanhaId: ad.campaign_id.toString(),
              },
            },
            create: {
              data: new Date(ad.date),
              campanhaId: ad.campaign_id.toString(),
              campanhaNome: ad.campaign_name,
              gasto,
              rendaGerada,
              custoProdutos,
              lucro,
              roi,
            },
            update: {
              campanhaNome: ad.campaign_name,
              gasto,
              rendaGerada,
              custoProdutos,
              lucro,
              roi,
            },
          });
        }
      }

      const duracaoMs = Date.now() - startTime;
      loggers.sync.success('ADS', 'SHOPEE', total, duracaoMs);

      await this.prisma.logSync.create({
        data: {
          tipo: 'ADS',
          status: 'SUCESSO',
          origem: 'SHOPEE',
          mensagem: `${total} registros de ads sincronizados`,
          registros: total,
          duracaoMs,
        },
      });

      return { total };
    } catch (error) {
      loggers.sync.error('ADS', 'SHOPEE', error as Error);
      throw error;
    }
  }

  /**
   * Ratear custos de ads nas contas a receber
   */
  async ratearCustosAds(dataInicio: Date, dataFim: Date) {
    // Buscar total de ads no período
    const ads = await this.prisma.consumoAds.findMany({
      where: {
        data: { gte: dataInicio, lte: dataFim },
      },
    });

    const totalGasto = ads.reduce((sum, ad) => sum + ad.gasto, 0);

    // Buscar contas a receber do período
    const contas = await this.prisma.contaReceber.findMany({
      where: {
        previsao: { gte: dataInicio, lte: dataFim },
      },
    });

    const totalReceita = contas.reduce((sum, c) => sum + c.valorBruto, 0);

    if (totalReceita === 0) return { atualizados: 0 };

    // Ratear proporcionalmente
    let atualizados = 0;
    for (const conta of contas) {
      const proporcao = conta.valorBruto / totalReceita;
      const custoAds = totalGasto * proporcao;
      const liquido = conta.valorBruto - conta.taxas - custoAds;

      await this.prisma.contaReceber.update({
        where: { id: conta.id },
        data: { custoAds, liquido },
      });

      atualizados++;
    }

    logger.info(`Custos de ads rateados: ${atualizados} contas atualizadas`);
    return { atualizados, totalGasto };
  }

  /**
   * Obter relatório de performance de ads
   */
  async relatorioPerformance(dataInicio: Date, dataFim: Date) {
    const ads = await this.prisma.consumoAds.findMany({
      where: {
        data: { gte: dataInicio, lte: dataFim },
      },
      orderBy: { data: 'asc' },
    });

    const pedidos = await this.prisma.pedido.findMany({
      where: {
        data: { gte: dataInicio, lte: dataFim },
      },
      select: {
        rendaLiquida: true,
        custoProdutos: true,
        lucro: true,
      },
    });

    const totais = ads.reduce(
      (acc, ad) => ({
        impressoes: acc.impressoes + ad.impressoes,
        cliques: acc.cliques + ad.cliques,
        gasto: acc.gasto + ad.gasto,
        pedidos: acc.pedidos + ad.pedidos,
        gmv: acc.gmv + ad.gmv,
      }),
      { impressoes: 0, cliques: 0, gasto: 0, pedidos: 0, gmv: 0 }
    );

    const totaisPedidos = pedidos.reduce(
      (acc, p) => ({
        rendaLiquida: acc.rendaLiquida + (Number(p.rendaLiquida) || 0),
        custoProdutos: acc.custoProdutos + (Number(p.custoProdutos) || 0),
        lucro: acc.lucro + (Number(p.lucro) || 0),
      }),
      { rendaLiquida: 0, custoProdutos: 0, lucro: 0 }
    );

    const ctrMedio = totais.impressoes > 0 ? (totais.cliques / totais.impressoes) * 100 : 0;
    const cpcMedio = totais.cliques > 0 ? totais.gasto / totais.cliques : 0;
    const roasTotal = totais.gasto > 0 ? totais.gmv / totais.gasto : 0;

    const ganhoRealFinal = totaisPedidos.lucro - totais.gasto;
    const roiRealFinal = totais.gasto > 0 ? (ganhoRealFinal / totais.gasto) * 100 : 0;

    return {
      periodo: { inicio: dataInicio, fim: dataFim },
      totais,
      metricas: {
        ctrMedio,
        cpcMedio,
        roasTotal,
      },
      pedidosNoPeriodo: {
        rendaLiquida: totaisPedidos.rendaLiquida,
        custoProdutos: totaisPedidos.custoProdutos,
        lucro: totaisPedidos.lucro,
      },
      ganhoRealFinal,
      roiRealFinal,
      detalhes: ads,
    };
  }
}
