// ==========================================
// MÓDULO PRODUTOS - SERVICE
// ==========================================

import { getPrismaClient } from '../../shared/database';
import { logger, loggers } from '../../shared/logger';
import { TinyClient } from '../../integrations/tiny/client';
import { ShopeeClient } from '../../integrations/shopee/client';

export class ProdutoService {
  private prisma = getPrismaClient();
  private tinyClient: TinyClient;
  private shopeeClient?: ShopeeClient;

  constructor(shopeeAccessToken?: string) {
    this.tinyClient = new TinyClient();
    if (shopeeAccessToken) {
      this.shopeeClient = new ShopeeClient(shopeeAccessToken);
    }
  }

  /**
   * Sincronizar produtos do Tiny ERP
   */
  async syncProdutosTiny(): Promise<{ total: number; criados: number; atualizados: number }> {
    const startTime = Date.now();
    let totalProdutos = 0;
    let criados = 0;
    let atualizados = 0;

    try {
      loggers.sync.start('PRODUTOS', 'TINY');

      // Buscar todas as páginas de produtos
      const responses = await this.tinyClient.buscarTodosProdutos();

      // Processar cada produto
      for (const response of responses) {
        if (!response.retorno.produtos) continue;

        for (const { produto } of response.retorno.produtos) {
          try {
            totalProdutos++;

            // Calcular custo real (pode ser customizado)
            const custoReal = produto.preco_custo || produto.preco * 0.6;

            // Upsert no banco de dados
            const result = await this.prisma.produto.upsert({
              where: { idTiny: produto.id },
              create: {
                sku: produto.codigo,
                descricao: produto.nome,
                ncm: produto.ncm || null,
                custoReal,
                precoVenda: produto.preco,
                idTiny: produto.id,
                estoqueTiny: produto.estoque || 0,
                ativo: produto.situacao === 'A',
              },
              update: {
                descricao: produto.nome,
                ncm: produto.ncm || null,
                custoReal,
                precoVenda: produto.preco,
                estoqueTiny: produto.estoque || 0,
                ativo: produto.situacao === 'A',
                atualizadoEm: new Date(),
              },
            });

            if (result.criadoEm.getTime() === result.atualizadoEm.getTime()) {
              criados++;
            } else {
              atualizados++;
            }
          } catch (error) {
            logger.error(`Erro ao processar produto ${produto.codigo}`, { error });
          }
        }
      }

      const duracaoMs = Date.now() - startTime;
      loggers.sync.success('PRODUTOS', 'TINY', totalProdutos, duracaoMs);

      // Salvar log de sincronização
      await this.prisma.logSync.create({
        data: {
          tipo: 'PRODUTOS',
          status: 'SUCESSO',
          origem: 'TINY',
          mensagem: `${criados} criados, ${atualizados} atualizados`,
          registros: totalProdutos,
          duracaoMs,
        },
      });

      return { total: totalProdutos, criados, atualizados };
    } catch (error) {
      const duracaoMs = Date.now() - startTime;
      loggers.sync.error('PRODUTOS', 'TINY', error as Error);

      await this.prisma.logSync.create({
        data: {
          tipo: 'PRODUTOS',
          status: 'ERRO',
          origem: 'TINY',
          mensagem: (error as Error).message,
          detalhes: (error as Error).stack,
          registros: totalProdutos,
          duracaoMs,
        },
      });

      throw error;
    }
  }

  /**
   * Sincronizar produtos do Shopee
   */
  async syncProdutosShopee(): Promise<{ total: number; atualizados: number }> {
    if (!this.shopeeClient) {
      throw new Error('Shopee client não configurado. Forneça access_token.');
    }

    const startTime = Date.now();
    let totalProdutos = 0;
    let atualizados = 0;

    try {
      loggers.sync.start('PRODUTOS', 'SHOPEE');

      // Buscar todos os produtos
      const responses = await this.shopeeClient.getAllItems();

      // Processar em batches de 50 (limite da API)
      for (const response of responses) {
        if (!response.response.item) continue;

        const itemIds = response.response.item.map((i) => i.item_id);
        
        // Buscar detalhes dos produtos
        const detailResponse = await this.shopeeClient.getItemBaseInfo(itemIds);

        for (const item of detailResponse.response.item_list) {
          try {
            totalProdutos++;

            // Buscar produto por SKU
            const produto = await this.prisma.produto.findFirst({
              where: { sku: item.item_sku },
            });

            if (produto) {
              // Atualizar estoque Shopee
              await this.prisma.produto.update({
                where: { id: produto.id },
                data: {
                  idShopee: item.item_id.toString(),
                  estoqueShopee: item.stock_info?.[0]?.current_stock || 0,
                  atualizadoEm: new Date(),
                },
              });
              atualizados++;
            } else {
              logger.warn(`Produto ${item.item_sku} não encontrado no banco`);
            }
          } catch (error) {
            logger.error(`Erro ao processar produto Shopee ${item.item_id}`, { error });
          }
        }
      }

      const duracaoMs = Date.now() - startTime;
      loggers.sync.success('PRODUTOS', 'SHOPEE', totalProdutos, duracaoMs);

      await this.prisma.logSync.create({
        data: {
          tipo: 'PRODUTOS',
          status: 'SUCESSO',
          origem: 'SHOPEE',
          mensagem: `${atualizados} produtos atualizados`,
          registros: totalProdutos,
          duracaoMs,
        },
      });

      return { total: totalProdutos, atualizados };
    } catch (error) {
      const duracaoMs = Date.now() - startTime;
      loggers.sync.error('PRODUTOS', 'SHOPEE', error as Error);

      await this.prisma.logSync.create({
        data: {
          tipo: 'PRODUTOS',
          status: 'ERRO',
          origem: 'SHOPEE',
          mensagem: (error as Error).message,
          detalhes: (error as Error).stack,
          registros: totalProdutos,
          duracaoMs,
        },
      });

      throw error;
    }
  }

  /**
   * Listar produtos
   */
  async listarProdutos(filtros?: {
    ativo?: boolean;
    sku?: string;
    descricao?: string;
  }) {
    const where: any = {};

    if (filtros?.ativo !== undefined) {
      where.ativo = filtros.ativo;
    }

    if (filtros?.sku) {
      where.sku = { contains: filtros.sku, mode: 'insensitive' };
    }

    if (filtros?.descricao) {
      where.descricao = { contains: filtros.descricao, mode: 'insensitive' };
    }

    return this.prisma.produto.findMany({
      where,
      orderBy: { descricao: 'asc' },
    });
  }

  /**
   * Obter produto por ID
   */
  async obterProduto(id: string) {
    return this.prisma.produto.findUnique({
      where: { id },
    });
  }

  /**
   * Obter produto por SKU
   */
  async obterProdutoPorSku(sku: string) {
    return this.prisma.produto.findUnique({
      where: { sku },
    });
  }

  /**
   * Atualizar custo real de um produto
   */
  async atualizarCustoReal(id: string, custoReal: number) {
    return this.prisma.produto.update({
      where: { id },
      data: { custoReal, atualizadoEm: new Date() },
    });
  }
}
