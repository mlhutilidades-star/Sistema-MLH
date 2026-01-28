// ==========================================
// REPROCESSAMENTO - Corrigir renda via itens
// ==========================================

import { logger } from '../src/shared/logger';
import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';

function parseDaysArg(argv: string[]): number {
  const idx = argv.findIndex((a) => a === '--days' || a.startsWith('--days='));
  if (idx === -1) return 30;
  const arg = argv[idx];
  const raw = arg.includes('=') ? arg.split('=')[1] : argv[idx + 1];
  const v = Number(raw);
  return Number.isFinite(v) ? Math.max(1, Math.min(365, Math.floor(v))) : 30;
}

async function main() {
  const days = parseDaysArg(process.argv.slice(2));
  const prisma = getPrismaClient();

  logger.info(`🧮 Reprocessando renda via itens (últimos ${days} dias)...`);

  await connectDatabase();

  const since = new Date(Date.now() - days * 86400 * 1000);

  const pedidos = await prisma.pedido.findMany({
    where: { data: { gte: since } },
    select: {
      pedidoId: true,
      data: true,
      totalBruto: true,
      rendaLiquida: true,
      custoProdutos: true,
      itens: {
        select: {
          sku: true,
          quantidade: true,
          precoVenda: true,
          custoTotal: true,
        },
      },
    },
    orderBy: { data: 'desc' },
  });

  let analisados = 0;
  let atualizados = 0;
  let puladosSemPreco = 0;
  let puladosNaoInflados = 0;

  for (const p of pedidos) {
    analisados++;

    const totalItemRevenue = p.itens.reduce((sum, it) => {
      const qty = Number(it.quantidade ?? 0) || 0;
      const price = Number(it.precoVenda ?? 0) || 0;
      return sum + price * qty;
    }, 0);

    if (!(totalItemRevenue > 0)) {
      puladosSemPreco++;
      continue;
    }

    const rendaAtual = Number(p.rendaLiquida ?? 0) || 0;
    // Só reduzimos (caso típico: renda atual inclui frete via total_amount).
    if (!(rendaAtual > totalItemRevenue + 0.01)) {
      puladosNaoInflados++;
      continue;
    }

    const totalBruto = Number(p.totalBruto ?? 0) || 0;
    const custoProdutos = Number(p.custoProdutos ?? 0) || 0;

    const novaRenda = totalItemRevenue;
    const novasTaxas = totalBruto - novaRenda;
    const novoLucro = novaRenda - custoProdutos;
    const novaMargem = novaRenda > 0 ? (novoLucro / novaRenda) * 100 : 0;

    await prisma.$transaction(async (tx) => {
      await tx.pedido.update({
        where: { pedidoId: p.pedidoId },
        data: {
          rendaLiquida: novaRenda,
          taxasShopee: novasTaxas,
          lucro: novoLucro,
          margem: novaMargem,
        },
      });

      for (const it of p.itens) {
        const qty = Number(it.quantidade ?? 0) || 0;
        const price = Number(it.precoVenda ?? 0) || 0;
        const itemRevenue = price * qty;
        const rendaItem = totalItemRevenue > 0 ? novaRenda * (itemRevenue / totalItemRevenue) : 0;
        const custoTotal = Number(it.custoTotal ?? 0) || 0;
        const lucroItem = rendaItem - custoTotal;

        await tx.pedidoItem.update({
          where: { pedidoId_sku: { pedidoId: p.pedidoId, sku: it.sku } },
          data: {
            rendaLiquida: rendaItem,
            lucro: lucroItem,
          },
        });
      }
    });

    atualizados++;
  }

  logger.info('✅ Reprocessamento concluído', {
    days,
    analisados,
    atualizados,
    puladosSemPreco,
    puladosNaoInflados,
  });

  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  logger.error('❌ Falha no reprocessamento via itens', {
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});
