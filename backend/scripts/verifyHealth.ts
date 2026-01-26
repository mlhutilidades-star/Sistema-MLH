// ==========================================
// SCRIPT - Smoke test financeiro
// Objetivo: detectar inconsistências após recálculo (duplicidade/erro de soma)
// - Compara lucro agregado de Pedido vs cálculo manual (renda - custo)
// - Compara lucro agregado de Pedido vs soma de PedidoItem
// ==========================================

import { Prisma } from '@prisma/client';
import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';
import { logger } from '../src/shared/logger';

type Args = {
  from?: string;
  to?: string;
  maxDiff: number;
};

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const direct = argv.find((a) => a.startsWith(`${name}=`));
    if (direct) return direct.split('=').slice(1).join('=');
    const idx = argv.findIndex((a) => a === name);
    if (idx >= 0) return argv[idx + 1];
    return undefined;
  };

  const maxDiffRaw = get('--max-diff');
  const maxDiff = Math.max(0, maxDiffRaw ? Number(maxDiffRaw) : 0.5);

  return {
    from: get('--from'),
    to: get('--to'),
    maxDiff,
  };
}

function parseDateOrThrow(value: string, label: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`${label} inválido: ${value}. Use YYYY-MM-DD ou ISO.`);
  }
  return d;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  await connectDatabase();
  const prisma = getPrismaClient();

  try {
    const now = new Date();
    const from = args.from ? parseDateOrThrow(args.from, '--from') : new Date(now.getTime() - 30 * 86400 * 1000);
    const to = args.to ? parseDateOrThrow(args.to, '--to') : now;

    logger.info(`🧪 VerifyHealth: ${from.toISOString()} -> ${to.toISOString()}`);

    const wherePedido: Prisma.PedidoWhereInput = { data: { gte: from, lte: to } };

    const pedidoAgg = await prisma.pedido.aggregate({
      where: wherePedido,
      _count: { _all: true },
      _sum: { rendaLiquida: true, custoProdutos: true, lucro: true },
    });

    const renda = Number(pedidoAgg._sum.rendaLiquida || 0) || 0;
    const custo = Number(pedidoAgg._sum.custoProdutos || 0) || 0;
    const lucroDb = Number(pedidoAgg._sum.lucro || 0) || 0;
    const lucroManual = renda - custo;

    const itensAgg = await prisma.pedidoItem.aggregate({
      where: { pedido: { data: { gte: from, lte: to } } },
      _sum: { rendaLiquida: true, custoTotal: true, lucro: true },
      _count: { _all: true },
    });

    const itensLucro = Number(itensAgg._sum.lucro || 0) || 0;
    const diffManual = round2(lucroDb - lucroManual);
    const diffItens = round2(lucroDb - itensLucro);

    logger.info(`Pedidos: ${pedidoAgg._count._all} | Itens: ${itensAgg._count._all}`);
    logger.info(`Lucro DB (Pedido.lucro): ${round2(lucroDb)}`);
    logger.info(`Lucro manual (renda - custo): ${round2(lucroManual)} | diff=${diffManual}`);
    logger.info(`Lucro itens (sum PedidoItem.lucro): ${round2(itensLucro)} | diff=${diffItens}`);

    const okManual = Math.abs(diffManual) <= args.maxDiff;
    const okItens = Math.abs(diffItens) <= args.maxDiff;

    if (!okManual || !okItens) {
      logger.error('❌ VerifyHealth falhou: divergência acima do limite', {
        maxDiff: args.maxDiff,
        diffManual,
        diffItens,
      });
      process.exit(2);
    }

    logger.info('✅ VerifyHealth OK');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((e) => {
  logger.error('Erro no verifyHealth', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
