import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main() {
  const days = Number(getArg('--days') || process.env.MARGIN_LOOKBACK_DAYS || 30);
  const lookbackDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;

  await connectDatabase();
  const prisma = getPrismaClient();

  const start = new Date();
  start.setDate(start.getDate() - lookbackDays);

  const sold = await prisma.pedidoItem.findMany({
    where: { pedido: { data: { gte: start } } },
    distinct: ['sku'],
    select: { sku: true, descricao: true },
  });

  const skus = sold.map((s) => s.sku);
  const produtos = skus.length
    ? await prisma.produto.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, descricao: true, custoReal: true, custoStatus: true },
      })
    : [];

  const bySku = new Map(produtos.map((p) => [p.sku, p] as const));

  const pendentes = skus
    .map((sku) => {
      const p = bySku.get(sku);
      const custo = Number(p?.custoReal ?? 0) || 0;
      const status = String(p?.custoStatus ?? 'PENDENTE_SYNC');
      const desc = p?.descricao || sold.find((x) => x.sku === sku)?.descricao || sku;
      const isPending = !p || custo <= 0 || status === 'PENDENTE_SYNC';
      return isPending ? { sku, descricao: desc, custo, status } : null;
    })
    .filter(Boolean) as Array<{ sku: string; descricao: string; custo: number; status: string }>;

  console.log(`LOOKBACK_DAYS=${lookbackDays}`);
  console.log(`SOLD_SKUS=${skus.length}`);
  console.log(`PENDENTES=${pendentes.length}`);

  pendentes.forEach((p, i) => {
    console.log(`${i + 1}. ${p.sku} | ${p.status} | ${p.custo} | ${p.descricao}`);
  });

  await disconnectDatabase();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
