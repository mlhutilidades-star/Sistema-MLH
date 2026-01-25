// ==========================================
// SCRIPT SYNC MANUAL - Sincronização Completa
// ==========================================

import { TinyClient } from '../src/integrations/tiny/client';
import { ShopeeClient } from '../src/integrations/shopee/client';
import { logger } from '../src/shared/logger';
import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';
import { LucroService } from '../src/modules/relatorios/lucroService';
import { sleep } from '../src/shared/utils';

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

async function getSoldSkusFromDbLastDays(days: number): Promise<Map<string, string | null>> {
  const prisma = getPrismaClient();
  const since = new Date(Date.now() - Math.max(1, Math.floor(days)) * 86400 * 1000);

  const items = await prisma.pedidoItem.findMany({
    where: { pedido: { data: { gte: since } } },
    select: { sku: true, descricao: true },
  });

  const skuToName = new Map<string, string | null>();
  for (const it of items) {
    const sku = String(it.sku || '').trim();
    if (!sku) continue;
    if (!skuToName.has(sku)) skuToName.set(sku, it.descricao || null);
  }
  return skuToName;
}

async function getSoldSkusFromShopeeLastDays(shopee: ShopeeClient, days: number): Promise<Map<string, string | null>> {
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - days * 86400;
  const windowSec = 14 * 86400;

  const orderSnSet = new Set<string>();
  let cursorEnd = nowSec;
  while (cursorEnd > fromSec) {
    let cursorStart = Math.max(fromSec, cursorEnd - windowSec);
    if (cursorStart >= cursorEnd) cursorStart = Math.max(fromSec, cursorEnd - 60);

    logger.info(`📦 Janela Shopee orders (SKUs vendidos): ${cursorStart} -> ${cursorEnd}`);
    const windowOrders = await shopee.getAllOrders(cursorStart, cursorEnd);
    for (const sn of windowOrders) orderSnSet.add(sn);

    cursorEnd = cursorStart - 1;
  }

  const orderSns = Array.from(orderSnSet);
  const skuToName = new Map<string, string | null>();
  if (!orderSns.length) return skuToName;

  const batchSize = 50;
  for (let i = 0; i < orderSns.length; i += batchSize) {
    const batch = orderSns.slice(i, i + batchSize);
    const detail = await shopee.getOrderDetail(batch);
    const list = detail.response?.order_list || [];
    for (const o of list) {
      for (const it of o.item_list || []) {
        const sku = String((it as any).model_sku || (it as any).item_sku || '').trim();
        if (!sku) continue;
        if (!skuToName.has(sku)) skuToName.set(sku, (it as any).item_name || null);
      }
    }
  }

  return skuToName;
}

async function syncProdutosCustoPorSkuShopee(options?: { onlySoldSkus?: boolean; refreshCosts?: boolean; lookbackDays?: number }): Promise<{ total: number; atualizados: number; custoEncontrado: number; custoAusente: number; erros: number; pulados24h: number }> {
  const prisma = getPrismaClient();
  const tiny = new TinyClient();

  const token = process.env.SHOPEE_ACCESS_TOKEN;
  if (!token) throw new Error('SHOPEE_ACCESS_TOKEN não configurado');

  const shopee = new ShopeeClient(token);

  const onlySoldSkus = options?.onlySoldSkus ?? true;
  const refreshCosts = options?.refreshCosts ?? false;
  const lookbackDays = options?.lookbackDays ?? parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30);

  const startTime = Date.now();
  let total = 0;
  let atualizados = 0;
  let custoEncontrado = 0;
  let custoAusente = 0;
  let erros = 0;
  let pulados24h = 0;

  let skuToName = new Map<string, string | null>();
  if (onlySoldSkus) {
    logger.info(`🛒 Listando SKUs vendidos na Shopee (últimos ${lookbackDays} dias)...`);
    skuToName = await getSoldSkusFromShopeeLastDays(shopee, Math.max(1, Math.floor(lookbackDays)));
  }

  // Fallback: se não houver vendas no período, usa SKUs ativos (comportamento anterior)
  if (!onlySoldSkus || skuToName.size === 0) {
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
        if (!skuToName.has(sku)) skuToName.set(sku, item.item_name || null);
      }
    }
  }

  const skus = Array.from(skuToName.keys());
  logger.info(`📦 Total de SKUs para custo Tiny: ${skus.length}`);

  for (const sku of skus) {
    total++;
    try {
      const nome = skuToName.get(sku) || null;

      const existente = await prisma.produto.findUnique({
        where: { sku },
        select: {
          id: true,
          descricao: true,
          custoReal: true,
          custoStatus: true,
          custoAtualizadoEm: true,
        },
      });

      const custoAntigo = Number(existente?.custoReal ?? 0) || 0;
      const custoAtualizadoEm = existente?.custoAtualizadoEm;
      const vinteQuatroHorasMs = 24 * 60 * 60 * 1000;
      const isFresh = !!custoAtualizadoEm && Date.now() - new Date(custoAtualizadoEm).getTime() < vinteQuatroHorasMs;

      if (!refreshCosts && custoAntigo > 0 && isFresh) {
        pulados24h++;
        await prisma.produto.upsert({
          where: { sku },
          create: {
            sku,
            descricao: nome || sku,
            custoReal: custoAntigo,
            custoStatus: 'OK',
            custoAtualizadoEm: custoAtualizadoEm ?? new Date(),
            ativo: true,
          },
          update: {
            descricao: nome || existente?.descricao || sku,
            ativo: true,
          },
        });
        continue;
      }

      // Delay explícito para respeitar o rate limit do Tiny
      await sleep(600);

      let novoCusto: number | null = null;
      let custoStatus: 'OK' | 'PENDENTE_SYNC' = 'OK';

      try {
        novoCusto = await tiny.buscarCustoPorSKU(sku);
      } catch (e: any) {
        // Blindagem: API bloqueada/rate limit => NÃO sobrescreve custo por 0
        const msg = String(e?.message || e);
        erros++;
        logger.warn(`⚠️  Falha Tiny para SKU ${sku}: ${msg}`);
        custoStatus = 'PENDENTE_SYNC';
        novoCusto = null;
      }

      let custoRealFinal = custoAntigo;
      let custoAtualizadoEmFinal = custoAtualizadoEm ?? null;

      if (typeof novoCusto === 'number' && Number.isFinite(novoCusto) && novoCusto > 0) {
        custoRealFinal = novoCusto;
        custoAtualizadoEmFinal = new Date();
        custoStatus = 'OK';
        custoEncontrado++;
      } else {
        // Não encontrado / sem custo: mantém custo antigo se houver, senão fica 0 porém marcado pendente
        if (custoAntigo > 0) {
          custoRealFinal = custoAntigo;
          custoStatus = custoStatus === 'OK' ? 'OK' : custoStatus;
        } else {
          custoRealFinal = 0;
          custoStatus = 'PENDENTE_SYNC';
          custoAusente++;
          logger.warn(`⚠️  Custo Tiny ausente para SKU ${sku}. Mantendo PENDENTE_SYNC.`);
        }
      }

      await prisma.produto.upsert({
        where: { sku },
        create: {
          sku,
          descricao: nome || sku,
          custoReal: custoRealFinal,
          custoStatus,
          custoAtualizadoEm: custoAtualizadoEmFinal,
          ativo: true,
        },
        update: {
          descricao: nome || existente?.descricao || sku,
          // Blindagem extra: nunca sobrescreve custo antigo por 0
          custoReal: custoRealFinal === 0 && custoAntigo > 0 ? custoAntigo : custoRealFinal,
          custoStatus,
          custoAtualizadoEm: custoAtualizadoEmFinal,
          ativo: true,
        },
      });

      atualizados++;
    } catch (e: any) {
      erros++;
      logger.error(`Erro ao processar SKU ${sku}`, { error: String(e?.message || e) });
    }
  }

  const duracaoMs = Date.now() - startTime;
  await prisma.logSync.create({
    data: {
      tipo: 'PRODUTOS',
      status: 'SUCESSO',
      origem: 'SHOPEE',
      mensagem: `SKUs: ${total}; atualizados: ${atualizados}; custo ok: ${custoEncontrado}; custo ausente: ${custoAusente}; pulados24h: ${pulados24h}`,
      registros: total,
      duracaoMs,
    },
  });

  return { total, atualizados, custoEncontrado, custoAusente, erros, pulados24h };
}

async function syncCustosTinyOtimizado(options?: { refreshCosts?: boolean; lookbackDays?: number }): Promise<{ total: number; custosOk: number; custosAusentes: number; pulados24h: number; erros: number }> {
  const prisma = getPrismaClient();
  const tiny = new TinyClient();
  const refreshCosts = options?.refreshCosts ?? false;
  const lookbackDays = options?.lookbackDays ?? parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30);

  const skuToName = await getSoldSkusFromDbLastDays(lookbackDays);
  const skus = Array.from(skuToName.keys());
  logger.info(`🧾 (DB) SKUs vendidos para refresh de custo: ${skus.length}`);

  const custosTiny = await tiny.buscarCustosPorSKUs(skus);

  let total = 0;
  let custosOk = 0;
  let custosAusentes = 0;
  let pulados24h = 0;
  let erros = 0;

  for (const sku of skus) {
    total++;
    const nome = skuToName.get(sku) || null;

    const existente = await prisma.produto.findUnique({
      where: { sku },
      select: { descricao: true, custoReal: true, custoAtualizadoEm: true },
    });
    const custoAntigo = Number(existente?.custoReal ?? 0) || 0;
    const custoAtualizadoEm = existente?.custoAtualizadoEm;
    const isFresh = !!custoAtualizadoEm && Date.now() - new Date(custoAtualizadoEm).getTime() < 24 * 60 * 60 * 1000;

    if (!refreshCosts && custoAntigo > 0 && isFresh) {
      pulados24h++;
      await prisma.produto.upsert({
        where: { sku },
        create: {
          sku,
          descricao: nome || sku,
          custoReal: custoAntigo,
          custoStatus: 'OK',
          custoAtualizadoEm: custoAtualizadoEm ?? new Date(),
          ativo: true,
        },
        update: {
          descricao: nome || existente?.descricao || sku,
          ativo: true,
        },
      });
      continue;
    }

    const novoCusto = custosTiny.get(sku);
    if (typeof novoCusto === 'number' && Number.isFinite(novoCusto) && novoCusto > 0) {
      custosOk++;
      await prisma.produto.upsert({
        where: { sku },
        create: {
          sku,
          descricao: nome || sku,
          custoReal: novoCusto,
          custoStatus: 'OK',
          custoAtualizadoEm: new Date(),
          ativo: true,
        },
        update: {
          descricao: nome || existente?.descricao || sku,
          custoReal: novoCusto,
          custoStatus: 'OK',
          custoAtualizadoEm: new Date(),
          ativo: true,
        },
      });
      continue;
    }

    // Sem custo no retorno: blindagem => manter custo antigo se houver; senão marcar pendente
    if (custoAntigo > 0) {
      await prisma.produto.update({
        where: { sku },
        data: {
          descricao: nome || existente?.descricao || sku,
          custoStatus: 'OK',
          ativo: true,
        },
      }).catch(() => {
        erros++;
      });
    } else {
      custosAusentes++;
      await prisma.produto.upsert({
        where: { sku },
        create: {
          sku,
          descricao: nome || sku,
          custoReal: 0,
          custoStatus: 'PENDENTE_SYNC',
          custoAtualizadoEm: null,
          ativo: true,
        },
        update: {
          descricao: nome || existente?.descricao || sku,
          custoReal: 0,
          custoStatus: 'PENDENTE_SYNC',
          custoAtualizadoEm: null,
          ativo: true,
        },
      });
    }
  }

  await prisma.logSync.create({
    data: {
      tipo: 'PRODUTOS',
      status: 'SUCESSO',
      origem: 'TINY',
      mensagem: `Custos Tiny (otimizado): total ${total}; ok ${custosOk}; ausentes ${custosAusentes}; pulados24h ${pulados24h}; erros ${erros}`,
      registros: total,
    },
  });

  return { total, custosOk, custosAusentes, pulados24h, erros };
}

async function syncPedidosMargemShopee(): Promise<{ pedidos: number; itens: number; custosAusentes: number }> {
  const prisma = getPrismaClient();
  const token = process.env.SHOPEE_ACCESS_TOKEN;
  if (!token) throw new Error('SHOPEE_ACCESS_TOKEN não configurado');

  const shopee = new ShopeeClient(token);
  const lucroService = new LucroService();

  const daysRaw = parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30);
  const days = Math.max(1, Math.floor(daysRaw));
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - days * 86400;

  // Shopee limita time_from/time_to em janelas de até 15 dias.
  // Para evitar erros (diff in 15days), buscamos em janelas menores e deduplicamos.
  const windowSec = 14 * 86400; // margem de segurança
  const orderSnSet = new Set<string>();

  logger.info(`🧾 Buscando pedidos Shopee (últimos ${days} dias)...`);
  let cursorEnd = nowSec;
  while (cursorEnd > fromSec) {
    let cursorStart = Math.max(fromSec, cursorEnd - windowSec);
    if (cursorStart >= cursorEnd) {
      cursorStart = Math.max(fromSec, cursorEnd - 60);
    }

    logger.info(`📦 Janela Shopee orders: ${cursorStart} -> ${cursorEnd}`);
    const windowOrders = await shopee.getAllOrders(cursorStart, cursorEnd);
    for (const sn of windowOrders) orderSnSet.add(sn);

    cursorEnd = cursorStart - 1;
  }

  const orderSns = Array.from(orderSnSet);
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
    const refreshCosts = hasFlag(argv, '--refresh-costs') || hasFlag(argv, '--refreshCosts');
    const otimizado = hasFlag(argv, '--otimizado') || hasFlag(argv, '--optimized');
    const fullMarginCalc =
      hasFlag(argv, '--full-margin-calc') ||
      hasFlag(argv, '--calcular-lucro') ||
      hasFlag(argv, '--full-margin') ||
      hasFlag(argv, '--margin');
    logger.info(`🚀 Iniciando sincronização manual (${service})...`);

    // Conectar ao banco
    await connectDatabase();

    const shouldRunShopee = service === 'all' || service === 'shopee';
    const shouldRunTiny = service === 'all' || service === 'tiny';


    // 1) Custos Tiny (otimizado): quando rodar --service=tiny (ou flag --otimizado), usa SKUs vendidos do banco.
    if (shouldRunTiny && (otimizado || service === 'tiny')) {
      const r = await syncCustosTinyOtimizado({
        refreshCosts,
        lookbackDays: parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30),
      });
      logger.info(`✅ Custos Tiny (DB SKUs): total ${r.total}; ok ${r.custosOk}; ausentes ${r.custosAusentes}; pulados24h ${r.pulados24h}; erros ${r.erros}`);
    }

    // 2) Fluxo Shopee (para lucro real): usa a Shopee para descobrir SKUs vendidos e buscar nomes.
    if (shouldRunShopee && !otimizado) {
      const resultado = await syncProdutosCustoPorSkuShopee({
        onlySoldSkus: true,
        refreshCosts,
        lookbackDays: parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30),
      });
      logger.info(
        `✅ Produtos (SKUs vendidos -> custo Tiny): ${resultado.total} SKUs; custo ok ${resultado.custoEncontrado}; custo ausente ${resultado.custoAusente}; pulados24h ${resultado.pulados24h}; erros ${resultado.erros}`
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
    const err = error as any;
    logger.error('❌ Erro na sincronização manual', {
      error: String(err?.message || err),
      stack: err?.stack,
    });
    process.exit(1);
  }
}

// Executar sincronização
syncManual();
