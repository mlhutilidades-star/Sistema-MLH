import { PrismaClient } from '@prisma/client';

function parseArg(name: string, fallback?: string): string | undefined {
  const argv = process.argv.slice(2);
  const idx = argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx === -1) return fallback;
  const arg = argv[idx];
  if (arg.includes('=')) return arg.split('=')[1];
  return argv[idx + 1] ?? fallback;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const days = Number(parseArg('--days', '30'));
    const lookbackDays = Number.isFinite(days) && days > 0 ? Math.floor(days) : 30;
    const since = new Date(Date.now() - lookbackDays * 86400 * 1000);

    // SKUs que realmente venderam no período (via PedidoItem -> Pedido)
    const sold = await prisma.pedidoItem.findMany({
      where: {
        pedido: {
          data: { gte: since },
        },
      },
      select: { sku: true },
    });

    const soldSkus = Array.from(new Set(sold.map((s) => String(s.sku || '').trim()).filter(Boolean)));

    const missing = await prisma.produto.findMany({
      where: {
        sku: { in: soldSkus },
        OR: [{ custoReal: { lte: 0 } }, { custoStatus: 'PENDENTE_SYNC' }],
      },
      select: {
        sku: true,
        descricao: true,
        custoReal: true,
        custoStatus: true,
        custoAtualizadoEm: true,
        atualizadoEm: true,
      },
      orderBy: [{ custoStatus: 'desc' }, { atualizadoEm: 'desc' }],
    });

    console.log(`LOOKBACK_DAYS=${lookbackDays}`);
    console.log(`SOLD_SKUS=${soldSkus.length}`);
    console.log(`MISSING_COSTS=${missing.length}`);

    for (const p of missing) {
      console.log(
        `${p.sku}\t${p.custoReal}\t${p.custoStatus}\t${p.descricao ?? ''}`
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
