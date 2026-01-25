// ==========================================
// SCRIPT SYNC MANUAL - Sincronização Completa
// ==========================================

import { TinyClient } from '../src/integrations/tiny/client';
import { ShopeeClient } from '../src/integrations/shopee/client';
import { logger } from '../src/shared/logger';
import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';
import { LucroService } from '../src/modules/relatorios/lucroService';

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

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name) || argv.some((a) => a.startsWith(`${name}=`));
}

function parseNumberEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

async function syncProdutosCustoPorSkuShopee(): Promise<{ total: number; atualizados: number; custoEncontrado: number; custoAusente: number }> {
  const prisma = getPrismaClient();
  const tiny = new TinyClient();

  const token = process.env.SHOPEE_ACCESS_TOKEN;
  if (!token) throw new Error('SHOPEE_ACCESS_TOKEN não configurado');

  const shopee = new ShopeeClient(token);

  const startTime = Date.now();
  let total = 0;
  let atualizados = 0;
  let custoEncontrado = 0;
  let custoAusente = 0;

  logger.info('🛒 Listando produtos ativos na Shopee (SKUs)...');
  const pages = await shopee.getAllItems();

  for (const page of pages) {
    const itemIds = page.response?.item?.map((i) => i.item_id) || [];
    if (!itemIds.length) continue;

    const details = await shopee.getItemBaseInfo(itemIds);
    const items = details.response?.item_list || [];

    for (const item of items) {
      const sku = String(item.item_sku || '').trim();
      if (!sku) continue;

      total++;

      const precoVenda = item.price_info?.[0]?.current_price;
      const estoqueShopee = item.stock_info?.[0]?.current_stock ?? 0;

      const custo = await tiny.buscarCustoPorSKU(sku);
      const custoReal = custo ?? 0;
      if (custo == null) {
        custoAusente++;
        logger.warn(`⚠️  Custo Tiny não encontrado para SKU ${sku}. Salvando custoReal=0.`);
      } else {
        custoEncontrado++;
      }

      await prisma.produto.upsert({
        where: { sku },
        create: {
          sku,
          descricao: item.item_name,
          custoReal,
          precoVenda: typeof precoVenda === 'number' ? precoVenda : null,
          idShopee: String(item.item_id),
          estoqueShopee,
          ativo: true,
        },
        update: {
          descricao: item.item_name,
          custoReal,
          precoVenda: typeof precoVenda === 'number' ? precoVenda : null,
          idShopee: String(item.item_id),
          estoqueShopee,
          ativo: true,
          atualizadoEm: new Date(),
        },
      });

      atualizados++;
    }
  }

  const duracaoMs = Date.now() - startTime;
  await prisma.logSync.create({
    data: {
      tipo: 'PRODUTOS',
      status: 'SUCESSO',
      origem: 'SHOPEE',
      mensagem: `SKUs Shopee: ${total}; atualizados: ${atualizados}; custo ok: ${custoEncontrado}; custo ausente: ${custoAusente}`,
      registros: total,
      duracaoMs,
    },
  });

  return { total, atualizados, custoEncontrado, custoAusente };
}

async function syncPedidosMargemShopee(): Promise<{ pedidos: number; itens: number; custosAusentes: number }> {
  const prisma = getPrismaClient();
  const token = process.env.SHOPEE_ACCESS_TOKEN;
  if (!token) throw new Error('SHOPEE_ACCESS_TOKEN não configurado');

  const shopee = new ShopeeClient(token);
  const lucroService = new LucroService();

  const days = parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30);
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - days * 86400;

  logger.info(`🧾 Buscando pedidos Shopee (últimos ${days} dias)...`);
  const orderSns = await shopee.getAllOrders(fromSec, nowSec);
  if (!orderSns.length) return { pedidos: 0, itens: 0, custosAusentes: 0 };

  const batchSize = 50;
  let pedidos = 0;
  let itens = 0;
  let custosAusentes = 0;

  for (let i = 0; i < orderSns.length; i += batchSize) {
    const batch = orderSns.slice(i, i + batchSize);
    const detail = await shopee.getOrderDetail(batch);
    const list = detail.response?.order_list || [];

    // Carregar custos dos SKUs do batch
    const skus = new Set<string>();
    for (const o of list) {
      for (const it of o.item_list || []) {
        const sku = String(it.model_sku || it.item_sku || '').trim();
        if (sku) skus.add(sku);
      }
    }

    const produtos = await prisma.produto.findMany({ where: { sku: { in: Array.from(skus) } } });
    const produtoBySku = new Map(produtos.map((p) => [p.sku.toLowerCase(), p] as const));

    for (const o of list) {
      const rendaLiquida = Number(o.escrow_amount ?? o.total_amount ?? 0) || 0;
      const totalBruto = Number(o.total_amount ?? 0) || 0;
      const taxasShopee = totalBruto - rendaLiquida;

      // construir lista de produtos usados para cálculo
      const produtosDoPedido = Array.from(new Set((o.item_list || []).map((it) => String(it.model_sku || it.item_sku || '').trim()).filter(Boolean)))
        .map((sku) => produtoBySku.get(sku.toLowerCase()))
        .filter(Boolean) as any;

      const calc = lucroService.calcularLucroPedido(o as any, produtosDoPedido);

      const createdAt = new Date((o.create_time || Math.floor(Date.now() / 1000)) * 1000);

      await prisma.pedido.upsert({
        where: { pedidoId: o.order_sn },
        create: {
          pedidoId: o.order_sn,
          data: createdAt,
          cliente: o.buyer_username || null,
          totalBruto,
          taxasShopee,
          rendaLiquida: calc.rendaLiquida,
          custoProdutos: calc.custoProdutos,
          lucro: calc.lucro,
          margem: calc.margem,
        },
        update: {
          data: createdAt,
          cliente: o.buyer_username || null,
          totalBruto,
          taxasShopee,
          rendaLiquida: calc.rendaLiquida,
          custoProdutos: calc.custoProdutos,
          lucro: calc.lucro,
          margem: calc.margem,
          atualizadoEm: new Date(),
        },
      });

      // Itens do pedido
      const orderItems = o.item_list || [];
      const totalItemRevenue = orderItems.reduce((sum, it) => {
        const qty = Number(it.model_quantity_purchased ?? 0) || 0;
        const price = Number(it.model_discounted_price ?? 0) || 0;
        return sum + price * qty;
      }, 0);

      const seenSkus: string[] = [];
      for (const it of orderItems) {
        const sku = String(it.model_sku || it.item_sku || '').trim();
        if (!sku) continue;
        const qty = Number(it.model_quantity_purchased ?? 0) || 0;
        if (qty <= 0) continue;

        const produto = produtoBySku.get(sku.toLowerCase());
        const custoUnitario = Number(produto?.custoReal ?? 0) || 0;
        if (!produto || custoUnitario <= 0) custosAusentes++;

        const itemRevenue = (Number(it.model_discounted_price ?? 0) || 0) * qty;
        const rendaItem = totalItemRevenue > 0 ? rendaLiquida * (itemRevenue / totalItemRevenue) : 0;
        const custoTotal = custoUnitario * qty;
        const lucro = rendaItem - custoTotal;

        await prisma.pedidoItem.upsert({
          where: { pedidoId_sku: { pedidoId: o.order_sn, sku } },
          create: {
            pedidoId: o.order_sn,
            sku,
            descricao: it.item_name || null,
            quantidade: qty,
            precoVenda: Number.isFinite(Number(it.model_discounted_price)) ? Number(it.model_discounted_price) : null,
            rendaLiquida: rendaItem,
            custoUnitario,
            custoTotal,
            lucro,
          },
          update: {
            descricao: it.item_name || null,
            quantidade: qty,
            precoVenda: Number.isFinite(Number(it.model_discounted_price)) ? Number(it.model_discounted_price) : null,
            rendaLiquida: rendaItem,
            custoUnitario,
            custoTotal,
            lucro,
          },
        });

        seenSkus.push(sku);
        itens++;
      }

      // Remove itens antigos que não existem mais no pedido
      await prisma.pedidoItem.deleteMany({
        where: {
          pedidoId: o.order_sn,
          sku: { notIn: seenSkus },
        },
      });

      pedidos++;
    }
  }

  await prisma.logSync.create({
    data: {
      tipo: 'PEDIDOS',
      status: 'SUCESSO',
      origem: 'SHOPEE',
      mensagem: `Pedidos: ${pedidos}; itens: ${itens}; custos ausentes: ${custosAusentes}`,
      registros: pedidos,
    },
  });

  return { pedidos, itens, custosAusentes };
}

async function syncAnunciosFromConsumoAds(): Promise<{ total: number }> {
  const prisma = getPrismaClient();
  const start = new Date();
  start.setDate(start.getDate() - parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30));

  const ads = await prisma.consumoAds.findMany({
    where: { data: { gte: start } },
  });

  let total = 0;
  for (const ad of ads) {
    total++;
    const gasto = Number(ad.gasto || 0) || 0;
    const rendaGerada = Number(ad.gmv || 0) || 0; // GMV (não escrow); mantemos como aproximação quando não há atribuição
    const custoProdutos = 0;
    const lucro = rendaGerada - custoProdutos - gasto;
    const roi = gasto > 0 ? (lucro / gasto) * 100 : 0;

    await prisma.anuncio.upsert({
      where: { data_campanhaId: { data: ad.data, campanhaId: ad.campanhaId } },
      create: {
        data: ad.data,
        campanhaId: ad.campanhaId,
        campanhaNome: ad.campanhaNome,
        gasto,
        rendaGerada,
        custoProdutos,
        lucro,
        roi,
      },
      update: {
        campanhaNome: ad.campanhaNome,
        gasto,
        rendaGerada,
        custoProdutos,
        lucro,
        roi,
        atualizadoEm: new Date(),
      },
    });
  }

  await prisma.logSync.create({
    data: {
      tipo: 'ADS',
      status: 'SUCESSO',
      origem: 'SHOPEE',
      mensagem: `Anuncios derivados de ConsumoAds: ${total}`,
      registros: total,
    },
  });

  return { total };
}

async function syncManual() {
  try {
    const argv = process.argv.slice(2);
    const service = parseServiceArg(argv);
    const fullMarginCalc =
      hasFlag(argv, '--full-margin-calc') ||
      hasFlag(argv, '--calcular-lucro') ||
      hasFlag(argv, '--full-margin') ||
      hasFlag(argv, '--margin');
    logger.info(`🚀 Iniciando sincronização manual (${service})...`);

    // Conectar ao banco
    await connectDatabase();

    const shouldRunShopee = service === 'all' || service === 'shopee' || service === 'tiny';

    // Foco: lucro real = escrow_amount (Shopee) - custoReal (Tiny).
    // Tiny é usado APENAS para custo (por SKU), e só sincronizamos SKUs que existam na Shopee.
    if (shouldRunShopee) {
      const resultado = await syncProdutosCustoPorSkuShopee();
      logger.info(
        `✅ Produtos (SKU Shopee -> custo Tiny): ${resultado.total} SKUs; custo ok ${resultado.custoEncontrado}; custo ausente ${resultado.custoAusente}`
      );

      if (fullMarginCalc) {
        const r = await syncPedidosMargemShopee();
        logger.info(`✅ Pedidos (lucro): ${r.pedidos} pedidos; ${r.itens} itens; custos ausentes: ${r.custosAusentes}`);

        try {
          const a = await syncAnunciosFromConsumoAds();
          logger.info(`✅ Anúncios (derivado): ${a.total} registros`);
        } catch (e) {
          logger.warn('⚠️  Falha ao gerar relatório de anúncios (derivado).');
        }
      } else {
        logger.info('ℹ️  Margem por pedido não calculada (use --full-margin-calc)');
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
