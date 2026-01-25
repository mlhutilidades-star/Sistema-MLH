import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const agg = await prisma.pedido.aggregate({
      _count: { _all: true },
      _sum: { rendaLiquida: true, custoProdutos: true, lucro: true },
    });

    // Últimos pedidos (amostra)
    const recent = await prisma.pedido.findMany({
      take: 10,
      orderBy: { data: 'desc' },
      select: {
        pedidoId: true,
        data: true,
        rendaLiquida: true,
        custoProdutos: true,
        lucro: true,
        margem: true,
      },
    });

    // Maiores lucros (amostra)
    const topProfit = await prisma.pedido.findMany({
      take: 10,
      orderBy: { lucro: 'desc' },
      select: {
        pedidoId: true,
        data: true,
        rendaLiquida: true,
        custoProdutos: true,
        lucro: true,
        margem: true,
      },
    });

    console.log('AGG', JSON.stringify(agg));
    console.log('RECENT', JSON.stringify(recent));
    console.log('TOP_PROFIT', JSON.stringify(topProfit));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
