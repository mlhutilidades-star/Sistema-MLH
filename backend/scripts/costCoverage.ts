import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const total = await prisma.produto.count();
    const comCusto = await prisma.produto.count({
      where: { custoReal: { gt: 0 } },
    });
    const pendentes = await prisma.produto.count({
      where: { OR: [{ custoReal: { lte: 0 } }, { custoStatus: 'PENDENTE_SYNC' }] },
    });

    const pct = total > 0 ? (comCusto / total) * 100 : 0;

    console.log(`TOTAL_PRODUTOS=${total}`);
    console.log(`COM_CUSTO=${comCusto}`);
    console.log(`PENDENTES_OU_ZERO=${pendentes}`);
    console.log(`PERCENTUAL_COM_CUSTO=${pct.toFixed(1)}%`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
