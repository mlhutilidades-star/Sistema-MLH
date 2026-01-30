// ==========================================
// SCRIPT SYNC MANUAL - Sincronização Completa
// ==========================================

import { TinyClient } from '../src/integrations/tiny/client';
import { ShopeeClient } from '../src/integrations/shopee/client';
import { logger } from '../src/shared/logger';
import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';
import { LucroService } from '../src/modules/relatorios/lucroService';
import { sleep } from '../src/shared/utils';
import { resolveShopeeTokens } from '../src/modules/shopee/tokenStore';
import { AdsService } from '../src/modules/ads/service';

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

function parseNumberArg(argv: string[], name: string): number | undefined {
  const idx = argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx === -1) return undefined;
  const arg = argv[idx];
  const raw = arg.includes('=') ? arg.split('=')[1] : argv[idx + 1];
  if (!raw) return undefined;
  const v = Number(raw);
  return Number.isFinite(v) ? v : undefined;
}

function formatDateYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

  const resolved = await resolveShopeeTokens(prisma);
  if (!resolved.accessToken) throw new Error('Token Shopee ausente (DB/env)');

  const shopee = new ShopeeClient(resolved.accessToken, resolved.refreshToken);

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
        novoCusto = await tiny.buscarCustoPorSkuComFallbacks(sku);
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

async function syncCustosTinyOtimizado(options?: { refreshCosts?: boolean; lookbackDays?: number; useMapping?: boolean }): Promise<{ total: number; custosOk: number; custosAusentes: number; pulados24h: number; erros: number }> {
  const prisma = getPrismaClient();
  const tiny = new TinyClient();
  const refreshCosts = options?.refreshCosts ?? false;
  const lookbackDays = options?.lookbackDays ?? parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30);
  const useMapping = options?.useMapping ?? false;

  const skuToName = await getSoldSkusFromDbLastDays(lookbackDays);
  const skus = Array.from(skuToName.keys());
  logger.info(`🧾 (DB) SKUs vendidos para refresh de custo: ${skus.length}`);

  // 1) Pré-carrega custos via mapeamento (Shopee SKU -> Tiny código)
  const custosTiny = new Map<string, number>();
  if (useMapping && skus.length) {
    const mappings = await prisma.mapeamentoSKU.findMany({
      where: { skuShopee: { in: skus } },
      select: { skuShopee: true, codigoTiny: true },
    }).catch(() => [] as Array<{ skuShopee: string; codigoTiny: string }>);

    const mapBySku = new Map(mappings.map((m) => [m.skuShopee, m.codigoTiny] as const));

    let mappedCount = 0;
    for (const sku of skus) {
      const codigoTiny = mapBySku.get(sku);
      if (!codigoTiny) continue;
      mappedCount++;

      try {
        const custo = await tiny.buscarCustoPorSkuComFallbacks(codigoTiny);
        if (typeof custo === 'number' && Number.isFinite(custo) && custo > 0) {
          custosTiny.set(sku, custo);
        }
      } catch (e: any) {
        logger.warn(`Tiny (mapeamento): falha ao buscar custo para ${sku} -> ${codigoTiny}: ${String(e?.message || e)}`);
      }
    }

    logger.info(`🔁 Mapeamentos aplicados (encontrados no DB): ${mappedCount} | custos obtidos via mapeamento: ${custosTiny.size}`);
  }

  // 2) Completa o restante com fallbacks padrão de SKU
  const remainingSkus = skus.filter((s) => !custosTiny.has(s));
  const custosFallback = await tiny.buscarCustosPorSKUs(remainingSkus);
  for (const [k, v] of custosFallback.entries()) custosTiny.set(k, v);

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

async function syncPedidosMargemShopee(options?: { days?: number }): Promise<{ pedidos: number; itens: number; custosAusentes: number }> {
  const prisma = getPrismaClient();

  const resolved = await resolveShopeeTokens(prisma);
  if (!resolved.accessToken) throw new Error('Token Shopee ausente (DB/env)');

  const shopee = new ShopeeClient(resolved.accessToken, resolved.refreshToken);
  const lucroService = new LucroService();

  const daysRaw = options?.days ?? parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30);
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
      const totalBruto = Number(o.total_amount ?? 0) || 0;

      // Alguns ambientes retornam `escrow_amount` como 0 no get_order_detail.
      // Quando isso acontecer, tentamos obter o valor correto via /payment/get_escrow_detail.
      let escrowFromDetail: number | undefined;
      if (!(Number(o.escrow_amount ?? 0) > 0)) {
        try {
          const escrowResp: any = await (shopee as any).getEscrowDetail(o.order_sn);
          const income = escrowResp?.response?.order_income;
          const escrow = Number(income?.escrow_amount ?? income?.escrow_amount_after_adjustment ?? 0) || 0;
          if (escrow > 0) {
            escrowFromDetail = escrow;
          }
        } catch (e: any) {
          logger.warn(`⚠️  Falha ao buscar escrow_detail para pedido ${o.order_sn}: ${String(e?.message || e)}`);
        }
      }

      // construir lista de produtos usados para cálculo
      const produtosDoPedido = Array.from(new Set((o.item_list || []).map((it) => String(it.model_sku || it.item_sku || '').trim()).filter(Boolean)))
        .map((sku) => produtoBySku.get(sku.toLowerCase()))
        .filter(Boolean) as any;

      const calc = lucroService.calcularLucroPedido(
        ({
          ...(o as any),
          escrow_amount: escrowFromDetail ?? (o as any).escrow_amount,
        } as any),
        produtosDoPedido
      );
      const taxasShopee = totalBruto - calc.rendaLiquida;

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
        const rendaItem = totalItemRevenue > 0 ? calc.rendaLiquida * (itemRevenue / totalItemRevenue) : 0;
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

    await prisma.anuncioAds.upsert({
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

async function syncAnunciosCatalogoShopee(): Promise<{ total: number; normal: number; unlist: number }> {
  const prisma = getPrismaClient();
  const resolved = await resolveShopeeTokens(prisma);
  if (!resolved.accessToken) throw new Error('Token Shopee ausente (DB/env)');
  if (!resolved.shopId || !Number.isFinite(resolved.shopId) || resolved.shopId <= 0) {
    throw new Error('SHOPEE_SHOP_ID não configurado (ou shopId ausente no tokenStore)');
  }

  const shopee = new ShopeeClient(resolved.accessToken, resolved.refreshToken);

  const startTime = Date.now();
  let total = 0;
  let normal = 0;
  let unlist = 0;

  const pageSize = 50;
  const statuses: Array<'NORMAL' | 'UNLIST'> = ['NORMAL', 'UNLIST'];

  const fetchImagesDetail = String(process.env.SHOPEE_CATALOGO_FETCH_IMAGES_DETAIL ?? 'true').toLowerCase() !== 'false';
  const fetchImagesDetailMax = parseNumberEnv('SHOPEE_CATALOGO_IMAGE_DETAIL_MAX', 250);
  let fetchedDetailCount = 0;

  const fetchModels = String(process.env.SHOPEE_CATALOGO_FETCH_MODELS ?? 'true').toLowerCase() !== 'false';
  const fetchModelsMax = parseNumberEnv('SHOPEE_CATALOGO_MODEL_LIST_MAX', 400);
  let fetchedModelsCount = 0;

  for (const st of statuses) {
    logger.info(`🧾 Sync catálogo Shopee (status=${st})...`);
    let offset = 0;
    let hasNextPage = true;
    let pages = 0;

    while (hasNextPage) {
      const page = await shopee.getItemList(offset, pageSize, st);
      pages++;

      const itemFromList = page.response?.item || [];
      const itemIds = itemFromList.map((i) => i.item_id) || [];
      hasNextPage = !!page.response?.has_next_page;
      offset = page.response?.next_offset ?? 0;

      if (!itemIds.length) continue;

      const listExtraById = new Map<number, any>();
      for (const it of itemFromList as any[]) {
        const id = Number((it as any).item_id);
        if (Number.isFinite(id)) listExtraById.set(id, it);
      }

      const details = await shopee.getItemBaseInfo(itemIds);
      const items = details.response?.item_list || [];

      for (const item of items) {
        const itemId = BigInt(String(item.item_id));
        const sku = String(item.item_sku || '').trim() || null;
        const nome = String(item.item_name || '').trim() || sku || String(item.item_id);

        const anyItem: any = item as any;
        const listExtra: any = listExtraById.get(Number(item.item_id));

        const imageIdFromArray = Array.isArray(anyItem.image) && anyItem.image.length > 0 ? String(anyItem.image[0]) : null;
        const imageIdFromString = typeof anyItem.image === 'string' && anyItem.image.trim() ? String(anyItem.image).trim() : null;
        const imageUrlFromApi =
          (Array.isArray(anyItem.image_url_list) && typeof anyItem.image_url_list[0] === 'string' && anyItem.image_url_list[0]) ||
          (Array.isArray(anyItem.image_info?.image_url_list) && typeof anyItem.image_info.image_url_list[0] === 'string' && anyItem.image_info.image_url_list[0]) ||
          null;

        const listImageIdFromArray = Array.isArray(listExtra?.image) && listExtra.image.length > 0 ? String(listExtra.image[0]) : null;
        const listImageIdFromString = typeof listExtra?.image === 'string' && listExtra.image.trim() ? String(listExtra.image).trim() : null;
        const listImageUrlFromApi =
          (Array.isArray(listExtra?.image_url_list) && typeof listExtra.image_url_list[0] === 'string' && listExtra.image_url_list[0]) ||
          (Array.isArray(listExtra?.image_info?.image_url_list) && typeof listExtra.image_info.image_url_list[0] === 'string' && listExtra.image_info.image_url_list[0]) ||
          null;

        const imageId = imageIdFromArray || imageIdFromString || listImageIdFromArray || listImageIdFromString;
        let imageUrl =
          (typeof imageUrlFromApi === 'string' && imageUrlFromApi.startsWith('http') ? imageUrlFromApi : null) ||
          (typeof listImageUrlFromApi === 'string' && listImageUrlFromApi.startsWith('http') ? listImageUrlFromApi : null) ||
          (imageId ? `https://down-br.img.susercontent.com/file/${imageId}` : null);

        // Fallback best-effort: busca detalhe completo para obter URLs de imagem
        if (!imageUrl && fetchImagesDetail && fetchedDetailCount < fetchImagesDetailMax) {
          try {
            // Pequeno delay para reduzir chance de rate limit
            await sleep(120);
            const detail: any = await shopee.getItemDetail(Number(item.item_id));
            const d0 = detail?.response?.item_list?.[0];

            const detailUrl =
              (Array.isArray(d0?.image?.image_url_list) && typeof d0.image.image_url_list[0] === 'string' && d0.image.image_url_list[0]) ||
              (Array.isArray(d0?.image_info?.image_url_list) && typeof d0.image_info.image_url_list[0] === 'string' && d0.image_info.image_url_list[0]) ||
              (Array.isArray(d0?.image_url_list) && typeof d0.image_url_list[0] === 'string' && d0.image_url_list[0]) ||
              null;

            const detailId =
              (Array.isArray(d0?.image?.image_id_list) && d0.image.image_id_list.length > 0 ? String(d0.image.image_id_list[0]) : null) ||
              (Array.isArray(d0?.image) && d0.image.length > 0 ? String(d0.image[0]) : null) ||
              (typeof d0?.image === 'string' && d0.image.trim() ? String(d0.image).trim() : null) ||
              null;

            imageUrl =
              (typeof detailUrl === 'string' && detailUrl.startsWith('http') ? detailUrl : null) ||
              (detailId ? `https://down-br.img.susercontent.com/file/${detailId}` : null) ||
              imageUrl;

            fetchedDetailCount++;
          } catch (e: any) {
            // Mantém null se o endpoint não existir / falhar
          }
        }

        const rawStatus = String(item.item_status || '').trim();
        const statusFinal = rawStatus === 'NORMAL' ? 'ATIVO' : rawStatus === 'UNLIST' ? 'INATIVO' : rawStatus || st;

        const currentPriceRaw = Number(item.price_info?.[0]?.current_price ?? NaN);
        const preco = Number.isFinite(currentPriceRaw)
          ? Number.isInteger(currentPriceRaw)
            ? currentPriceRaw >= 1_000_000
              ? currentPriceRaw / 100_000
              : currentPriceRaw / 100
            : currentPriceRaw
          : null;

        const currentStockRaw = Number(item.stock_info?.[0]?.current_stock ?? NaN);
        const estoque = Number.isFinite(currentStockRaw) ? Math.floor(currentStockRaw) : null;

        const parent = await prisma.anuncioCatalogo.upsert({
          where: {
            platform_shopId_itemId: {
              platform: 'SHOPEE',
              shopId: resolved.shopId,
              itemId,
            },
          },
          create: {
            platform: 'SHOPEE',
            shopId: resolved.shopId,
            itemId,
            modelId: null,
            sku,
            nome,
            imageUrl,
            status: statusFinal,
            preco,
            estoque,
          },
          update: {
            sku,
            nome,
            imageUrl,
            status: statusFinal,
            preco,
            estoque,
          },
        });

        // Variações (modelos) -> ficam dentro do anúncio
        if (fetchModels && fetchedModelsCount < fetchModelsMax) {
          try {
            await sleep(120);
            const modelRes: any = await shopee.getModelList(Number(item.item_id));
            let models: any[] =
              (Array.isArray(modelRes?.response?.model) && modelRes.response.model) ||
              (Array.isArray(modelRes?.response?.model_list) && modelRes.response.model_list) ||
              (Array.isArray(modelRes?.response?.model_list?.[0]?.model) && modelRes.response.model_list[0].model) ||
              [];

            if (!models.length) {
              try {
                const detail: any = await shopee.getItemDetail(Number(item.item_id));
                const d0 = detail?.response?.item_list?.[0];
                models =
                  (Array.isArray(d0?.model_list) && d0.model_list) ||
                  (Array.isArray(d0?.model) && d0.model) ||
                  (Array.isArray(d0?.model_info?.model_list) && d0.model_info.model_list) ||
                  [];
              } catch {
                // ignore
              }
            }

            if (models.length) {
              const seenModelIds: bigint[] = [];
              for (const m of models) {
                const rawModelId = (m as any).model_id ?? (m as any).modelid ?? (m as any).id;
                if (rawModelId == null) continue;

                let modelId: bigint;
                try {
                  modelId = BigInt(String(rawModelId));
                } catch {
                  continue;
                }

                const modelSku = String((m as any).model_sku ?? (m as any).sku ?? '').trim() || null;
                const modelName = String((m as any).model_name ?? (m as any).name ?? '').trim() || null;

                const priceRaw = Number(
                  (m as any).price_info?.[0]?.current_price ??
                    (m as any).price ??
                    (m as any).current_price ??
                    NaN
                );
                const modelPrice = Number.isFinite(priceRaw)
                  ? Number.isInteger(priceRaw)
                    ? priceRaw >= 1_000_000
                      ? priceRaw / 100_000
                      : priceRaw / 100
                    : priceRaw
                  : null;

                const stockRaw = Number(
                  (m as any).stock_info?.[0]?.current_stock ??
                    (m as any).stock ??
                    (m as any).current_stock ??
                    NaN
                );
                const modelStock = Number.isFinite(stockRaw) ? Math.floor(stockRaw) : null;

                await prisma.anuncioVariacao.upsert({
                  where: {
                    anuncioId_modelId: {
                      anuncioId: parent.id,
                      modelId,
                    },
                  },
                  create: {
                    anuncioId: parent.id,
                    modelId,
                    sku: modelSku,
                    nome: modelName,
                    preco: modelPrice,
                    estoque: modelStock,
                  },
                  update: {
                    sku: modelSku,
                    nome: modelName,
                    preco: modelPrice,
                    estoque: modelStock,
                  },
                });

                seenModelIds.push(modelId);
              }

              // Remove variações que não existem mais
              if (seenModelIds.length) {
                await prisma.anuncioVariacao.deleteMany({
                  where: {
                    anuncioId: parent.id,
                    modelId: { notIn: seenModelIds },
                  },
                });
              }

              fetchedModelsCount++;
            }
          } catch (e: any) {
            // best-effort: se o endpoint não existir/sem permissão, ignora
          }
        }

        total++;
        if (st === 'NORMAL') normal++;
        if (st === 'UNLIST') unlist++;
      }

      if (pages % 10 === 0) {
        logger.info(`📄 Páginas processadas (status=${st}): ${pages} | total=${total}`);
      }
    }
  }

  const duracaoMs = Date.now() - startTime;
  await prisma.logSync.create({
    data: {
      tipo: 'ANUNCIOS_CATALOGO',
      status: 'SUCESSO',
      origem: 'SHOPEE',
      mensagem: `Catálogo Shopee: ${total} anúncios (ATIVO=${normal}, INATIVO=${unlist})`,
      registros: total,
      duracaoMs,
    },
  });

  return { total, normal, unlist };
}

async function syncManual() {
  try {
    const argv = process.argv.slice(2);
    const service = parseServiceArg(argv);
    const syncCatalogo = hasFlag(argv, '--anuncios');
    const syncAds = hasFlag(argv, '--ads');
    const refreshCosts = hasFlag(argv, '--refresh-costs') || hasFlag(argv, '--refreshCosts');
    const otimizado = hasFlag(argv, '--otimizado') || hasFlag(argv, '--optimized');
    const useMapping = hasFlag(argv, '--com-mapeamento') || hasFlag(argv, '--com-mapeamento-sku') || hasFlag(argv, '--with-mapping');
    const daysOverride = parseNumberArg(argv, '--days');
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

    // Quando rodar apenas o catálogo (--anuncios), não deve seguir para fluxos pesados (pedidos/custos).
    // Isso é usado no boot do backend em produção.
    const isCatalogOnly =
      shouldRunShopee &&
      syncCatalogo &&
      !syncAds &&
      !fullMarginCalc &&
      !refreshCosts &&
      !otimizado &&
      !useMapping &&
      typeof daysOverride === 'undefined' &&
      !shouldRunTiny;

    // 0) Catálogo Shopee (anuncios/listings) via Product API
    if (shouldRunShopee && syncCatalogo) {
      const r = await syncAnunciosCatalogoShopee();
      logger.info(`✅ Catálogo Shopee sincronizado: ${r.total} anúncios (ATIVO=${r.normal}, INATIVO=${r.unlist})`);

      if (isCatalogOnly) {
        logger.info('🏁 Encerrando: execução apenas de catálogo (--anuncios).');
        await disconnectDatabase();
        process.exit(0);
      }
    }

    // 1) Ads Shopee (consumo_ads + anuncios_ads)
    if (shouldRunShopee && syncAds) {
      const prisma = getPrismaClient();
      const resolved = await resolveShopeeTokens(prisma);
      if (!resolved.accessToken) throw new Error('Token Shopee ausente (DB/env)');

      const days = Math.max(1, Math.floor(daysOverride ?? 30));
      const end = new Date();
      const start = new Date(Date.now() - days * 86400 * 1000);

      const startDate = formatDateYmd(start);
      const endDate = formatDateYmd(end);

      logger.info(`📣 Sync Shopee Ads: ${startDate} -> ${endDate}`);
      const adsService = new AdsService(resolved.accessToken, resolved.refreshToken);
      const r = await adsService.syncAdsShopee(startDate, endDate);
      if ((r as any).adsAvailable === false) {
        logger.warn('⚠️  Ads indisponível neste ambiente/conta (endpoint não encontrado).');
      } else {
        logger.info(`✅ Ads Shopee sincronizados: ${r.total} registros`);
      }
    }


    // 1) Custos Tiny (otimizado): quando rodar --service=tiny (ou flag --otimizado), usa SKUs vendidos do banco.
    if (shouldRunTiny && (otimizado || service === 'tiny')) {
      const r = await syncCustosTinyOtimizado({
        refreshCosts,
        lookbackDays: parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30),
        useMapping,
      });
      logger.info(`✅ Custos Tiny (DB SKUs): total ${r.total}; ok ${r.custosOk}; ausentes ${r.custosAusentes}; pulados24h ${r.pulados24h}; erros ${r.erros}`);
    }

    // 2) Fluxo Shopee (para lucro real): usa a Shopee para descobrir SKUs vendidos e buscar nomes.
    if (shouldRunShopee && !otimizado) {
      const resultado = await syncProdutosCustoPorSkuShopee({
        onlySoldSkus: true,
        refreshCosts,
        lookbackDays: daysOverride ?? parseNumberEnv('MARGIN_LOOKBACK_DAYS', 30),
      });
      logger.info(
        `✅ Produtos (SKUs vendidos -> custo Tiny): ${resultado.total} SKUs; custo ok ${resultado.custoEncontrado}; custo ausente ${resultado.custoAusente}; pulados24h ${resultado.pulados24h}; erros ${resultado.erros}`
      );

      if (fullMarginCalc) {
        const r = await syncPedidosMargemShopee({ days: daysOverride });
        logger.info(`✅ Pedidos (lucro): ${r.pedidos} pedidos; ${r.itens} itens; custos ausentes: ${r.custosAusentes}`);

        try {
          const a = await syncAnunciosFromConsumoAds();
          logger.info(`✅ Anúncios Ads (derivado): ${a.total} registros`);
        } catch (e) {
          logger.warn('⚠️  Falha ao gerar relatório de anúncios Ads (derivado).');
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
