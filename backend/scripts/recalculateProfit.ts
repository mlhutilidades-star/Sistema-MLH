// ==========================================
// SCRIPT - Recalcular lucro/custo retroativo
// - Recalcula PedidoItem.custoUnitario/custoTotal/lucro a partir de Produto.custoReal
// - Recalcula Pedido.custoProdutos/lucro/margem
// - (Opcional) Regera tabela Anuncio a partir de ConsumoAds + rateio por GMV diário
// ==========================================

import { Prisma } from '@prisma/client';
import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';
import { logger } from '../src/shared/logger';

type Args = {
  from?: string;
  to?: string;
  dryRun: boolean;
  includeAnuncios: boolean;
  batch: number;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const direct = argv.find((a) => a.startsWith(`${name}=`));
    if (direct) return direct.split('=').slice(1).join('=');
    const idx = argv.findIndex((a) => a === name);
    if (idx >= 0) return argv[idx + 1];
    return undefined;
  };

  const has = (name: string): boolean => argv.includes(name);

  const batchRaw = get('--batch');
  const batch = Math.max(20, Math.min(2000, batchRaw ? Number(batchRaw) : 400));

  return {
    from: get('--from'),
    to: get('--to'),
    dryRun: has('--dry-run'),
    includeAnuncios: !has('--no-anuncios'),
    batch,
  };
}

function toDateOnlyKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseDateOrThrow(value: string, label: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`${label} inválido: ${value}. Use YYYY-MM-DD ou ISO.`);
  }
  return d;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await connectDatabase();
  const prisma = getPrismaClient();

  try {
    const now = new Date();
    const from = args.from ? parseDateOrThrow(args.from, '--from') : new Date(now.getTime() - 30 * 86400 * 1000);
    const to = args.to ? parseDateOrThrow(args.to, '--to') : now;

    logger.info(`🔁 Recalcular lucro: ${from.toISOString()} -> ${to.toISOString()} (dryRun=${args.dryRun})`);

    const before = await prisma.pedido.aggregate({
      where: { data: { gte: from, lte: to } },
      _sum: { rendaLiquida: true, custoProdutos: true, lucro: true },
      _count: { _all: true },
    });

    let cursorId: string | null = null;
    let pedidosProcessados = 0;
    let itensProcessados = 0;
    let custosAusentes = 0;

    while (true) {
      const where: Prisma.PedidoWhereInput = {
        data: { gte: from, lte: to },
        ...(cursorId ? ({ id: { gt: cursorId } } as Prisma.PedidoWhereInput) : {}),
      };

      const batchPedidos = await prisma.pedido.findMany({
        where,
        orderBy: { id: 'asc' },
        take: args.batch,
        include: { itens: true },
      });

      if (!batchPedidos.length) break;
      cursorId = batchPedidos[batchPedidos.length - 1].id;

      // Carregar custos dos SKUs do batch
      const skus = new Set<string>();
      for (const p of batchPedidos) {
        for (const it of p.itens) {
          const sku = String(it.sku || '').trim();
          if (sku) skus.add(sku);
        }
      }

      const produtos = await prisma.produto.findMany({
        where: { sku: { in: Array.from(skus) } },
        select: { sku: true, custoReal: true },
      });
      const custoBySku = new Map(produtos.map((p) => [p.sku.toLowerCase(), Number(p.custoReal) || 0] as const));

      const mappings = await prisma.mapeamentoSKU.findMany({
        where: { skuShopee: { in: Array.from(skus) } },
        select: { skuShopee: true, codigoTiny: true },
      });
      const mappingBySku = new Map(mappings.map((m) => [m.skuShopee.toLowerCase(), m.codigoTiny] as const));

      // custos via codigoTiny (fallback)
      const codigosTiny = Array.from(new Set(mappings.map((m) => String(m.codigoTiny || '').trim()).filter(Boolean)));
      const produtosTiny = codigosTiny.length
        ? await prisma.produto.findMany({
            where: { sku: { in: codigosTiny } },
            select: { sku: true, custoReal: true },
          })
        : [];
      const custoByCodigoTiny = new Map(produtosTiny.map((p) => [p.sku.toLowerCase(), Number(p.custoReal) || 0] as const));

      for (const pedido of batchPedidos) {
        let custoPedido = 0;

        const updates: Prisma.PrismaPromise<unknown>[] = [];

        for (const item of pedido.itens) {
          const sku = String(item.sku || '').trim();
          const qty = Number(item.quantidade || 0) || 0;
          if (!sku || qty <= 0) continue;

          let custoUnit = custoBySku.get(sku.toLowerCase()) || 0;
          if (custoUnit <= 0) {
            const codigoTiny = mappingBySku.get(sku.toLowerCase());
            if (codigoTiny) {
              custoUnit = custoByCodigoTiny.get(String(codigoTiny).toLowerCase()) || 0;
            }
          }

          if (custoUnit <= 0) custosAusentes++;

          const custoTotal = custoUnit * qty;
          const lucroItem = (Number(item.rendaLiquida) || 0) - custoTotal;
          custoPedido += custoTotal;

          itensProcessados++;

          if (!args.dryRun) {
            updates.push(
              prisma.pedidoItem.update({
                where: { id: item.id },
                data: {
                  custoUnitario: custoUnit,
                  custoTotal,
                  lucro: lucroItem,
                },
              })
            );
          }
        }

        const lucroPedido = (Number(pedido.rendaLiquida) || 0) - custoPedido;
        const margem = (Number(pedido.rendaLiquida) || 0) > 0 ? (lucroPedido / (Number(pedido.rendaLiquida) || 0)) * 100 : 0;

        if (!args.dryRun) {
          updates.push(
            prisma.pedido.update({
              where: { id: pedido.id },
              data: {
                custoProdutos: custoPedido,
                lucro: lucroPedido,
                margem,
              },
            })
          );

          await prisma.$transaction(updates);
        }

        pedidosProcessados++;
      }

      logger.info(`📦 Batch ok: pedidos=${pedidosProcessados} itens=${itensProcessados} custosAusentes=${custosAusentes}`);
    }

    if (args.includeAnuncios) {
      logger.info('📣 Regerando tabela anuncios (rateio por GMV diário)...');

      const consumo = await prisma.consumoAds.findMany({
        where: { data: { gte: from, lte: to } },
        select: { data: true, campanhaId: true, campanhaNome: true, gasto: true, gmv: true },
      });

      const pedidosPeriodo = await prisma.pedido.findMany({
        where: { data: { gte: from, lte: to } },
        select: { data: true, rendaLiquida: true, custoProdutos: true, lucro: true },
      });

      const pedidosByDay = new Map<string, { renda: number; custo: number; lucro: number }>();
      for (const p of pedidosPeriodo) {
        const k = toDateOnlyKey(p.data);
        const cur = pedidosByDay.get(k) || { renda: 0, custo: 0, lucro: 0 };
        cur.renda += Number(p.rendaLiquida) || 0;
        cur.custo += Number(p.custoProdutos) || 0;
        cur.lucro += Number(p.lucro) || 0;
        pedidosByDay.set(k, cur);
      }

      const gmvTotalByDay = new Map<string, number>();
      for (const c of consumo) {
        const k = toDateOnlyKey(c.data);
        gmvTotalByDay.set(k, (gmvTotalByDay.get(k) || 0) + (Number(c.gmv) || 0));
      }

      let anunciosAtualizados = 0;
      if (!args.dryRun) {
        for (const c of consumo) {
          const dayKey = toDateOnlyKey(c.data);
          const gmvDay = gmvTotalByDay.get(dayKey) || 0;
          const share = gmvDay > 0 ? (Number(c.gmv) || 0) / gmvDay : 0;

          const pedidosDay = pedidosByDay.get(dayKey) || { renda: 0, custo: 0, lucro: 0 };
          const rendaGerada = pedidosDay.renda * share;
          const custoProdutos = pedidosDay.custo * share;
          const gasto = Number(c.gasto) || 0;
          const lucro = rendaGerada - custoProdutos - gasto;
          const roi = gasto > 0 ? (lucro / gasto) * 100 : 0;

          await prisma.anuncioAds.upsert({
            where: { data_campanhaId: { data: c.data, campanhaId: c.campanhaId } },
            create: {
              data: c.data,
              campanhaId: c.campanhaId,
              campanhaNome: c.campanhaNome,
              gasto,
              rendaGerada,
              custoProdutos,
              lucro,
              roi,
            },
            update: {
              campanhaNome: c.campanhaNome,
              gasto,
              rendaGerada,
              custoProdutos,
              lucro,
              roi,
              atualizadoEm: new Date(),
            },
          });

          anunciosAtualizados++;
        }
      }

      logger.info(`📣 Anuncios atualizados: ${anunciosAtualizados}`);
    }

    const after = await prisma.pedido.aggregate({
      where: { data: { gte: from, lte: to } },
      _sum: { rendaLiquida: true, custoProdutos: true, lucro: true },
      _count: { _all: true },
    });

    logger.info(
      `✅ Finalizado. Pedidos=${pedidosProcessados} Itens=${itensProcessados} CustosAusentes=${custosAusentes} | LucroAntes=${before._sum.lucro || 0} LucroDepois=${after._sum.lucro || 0}`
    );
  } finally {
    await disconnectDatabase();
  }
}

main().catch((e) => {
  logger.error('Erro no recálculo de lucro', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
