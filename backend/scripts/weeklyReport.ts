// ==========================================
// SCRIPT - Relatório de saúde semanal (PDF)
// - Lucro total da semana
// - Top 3 produtos mais lucrativos
// - Top 3 produtos com menor margem
// - ROI dos anúncios (aprox)
// ==========================================

import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { connectDatabase, disconnectDatabase, getPrismaClient } from '../src/shared/database';
import { logger } from '../src/shared/logger';

function startOfWeekUTC(d: Date): Date {
  // Monday 00:00 UTC
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun
  const diffToMonday = (day + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  return date;
}

function addDaysUTC(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function endOfDayUTC(dateOnly: Date): Date {
  const x = new Date(dateOnly);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function money(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(n: number): string {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}

async function main() {
  await connectDatabase();
  const prisma = getPrismaClient();

  try {
    const today = new Date();
    const thisWeekStart = startOfWeekUTC(today);
    const weekStart = addDaysUTC(thisWeekStart, -7);
    const weekEnd = endOfDayUTC(addDaysUTC(thisWeekStart, -1));

    logger.info(`📄 Relatório semanal: ${weekStart.toISOString()} -> ${weekEnd.toISOString()}`);

    const pedidosAgg = await prisma.pedido.aggregate({
      where: { data: { gte: weekStart, lte: weekEnd } },
      _sum: { totalBruto: true, taxasShopee: true, rendaLiquida: true, custoProdutos: true, lucro: true },
    });

    const adsAgg = await prisma.consumoAds.aggregate({
      where: { data: { gte: weekStart, lte: weekEnd } },
      _sum: { gasto: true, gmv: true },
    });

    const faturamentoBruto = Number(pedidosAgg._sum.totalBruto || 0) || 0;
    const taxasShopee = Number(pedidosAgg._sum.taxasShopee || 0) || 0;
    const rendaLiquida = Number(pedidosAgg._sum.rendaLiquida || 0) || 0;
    const custoProdutos = Number(pedidosAgg._sum.custoProdutos || 0) || 0;
    const lucroPedidos = Number(pedidosAgg._sum.lucro || 0) || 0;

    const gastoAds = Number(adsAgg._sum.gasto || 0) || 0;
    const gmvAds = Number(adsAgg._sum.gmv || 0) || 0;

    const lucroRealFinal = rendaLiquida - custoProdutos - gastoAds;
    const margemMedia = faturamentoBruto > 0 ? (lucroRealFinal / faturamentoBruto) * 100 : 0;
    const roiAds = gastoAds > 0 ? (lucroRealFinal / gastoAds) * 100 : 0;
    const roasAds = gastoAds > 0 ? gmvAds / gastoAds : 0;

    const itens = await prisma.pedidoItem.findMany({
      where: { pedido: { data: { gte: weekStart, lte: weekEnd } } },
      select: { sku: true, descricao: true, quantidade: true, rendaLiquida: true, custoTotal: true, lucro: true },
    });

    const bySku = new Map<string, { sku: string; descricao: string | null; qty: number; renda: number; custo: number; lucro: number }>();
    for (const it of itens) {
      const sku = String(it.sku || '').trim();
      if (!sku) continue;
      const cur = bySku.get(sku) || { sku, descricao: it.descricao || null, qty: 0, renda: 0, custo: 0, lucro: 0 };
      cur.qty += Number(it.quantidade || 0) || 0;
      cur.renda += Number(it.rendaLiquida || 0) || 0;
      cur.custo += Number(it.custoTotal || 0) || 0;
      cur.lucro += Number(it.lucro || 0) || 0;
      if (!cur.descricao && it.descricao) cur.descricao = it.descricao;
      bySku.set(sku, cur);
    }

    const skuRows = Array.from(bySku.values()).map((r) => {
      const margem = r.renda > 0 ? (r.lucro / r.renda) * 100 : 0;
      return { ...r, margem };
    });

    const topLucro = skuRows.sort((a, b) => b.lucro - a.lucro).slice(0, 3);
    const piorMargem = skuRows
      .filter((r) => r.renda > 0)
      .sort((a, b) => a.margem - b.margem)
      .slice(0, 3);

    const outDir = path.resolve(process.cwd(), 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const filename = `relatorio-semanal-${weekStart.toISOString().slice(0, 10)}.pdf`;
    const outPath = path.join(outDir, filename);

    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(18).text('Sistema MLH — Relatório de Saúde Semanal', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#444').text(`Período: ${weekStart.toISOString().slice(0, 10)} a ${weekEnd.toISOString().slice(0, 10)}`);
    doc.fillColor('#000');
    doc.moveDown(1);

    doc.fontSize(14).text('Resumo financeiro');
    doc.moveDown(0.5);
    doc.fontSize(11);
    doc.text(`Faturamento bruto: ${money(faturamentoBruto)}`);
    doc.text(`Taxas Shopee: ${money(taxasShopee)}`);
    doc.text(`Renda líquida: ${money(rendaLiquida)}`);
    doc.text(`Custo produtos: ${money(custoProdutos)}`);
    doc.text(`Gasto Ads: ${money(gastoAds)}`);
    doc.text(`Lucro pedidos (sem Ads): ${money(lucroPedidos)}`);
    doc.text(`Lucro real final (com Ads): ${money(lucroRealFinal)}`);
    doc.text(`Margem média: ${pct(margemMedia)}`);
    doc.moveDown(0.2);
    doc.text(`ROI Ads (aprox): ${pct(roiAds)} | ROAS (GMV/Gasto): ${roasAds.toFixed(2)}`);

    doc.moveDown(1);
    doc.fontSize(14).text('Top 3 produtos mais lucrativos');
    doc.moveDown(0.5);
    doc.fontSize(11);
    for (const r of topLucro) {
      doc.text(`${r.sku} — ${r.descricao || ''}`);
      doc.text(`  Lucro: ${money(r.lucro)} | Margem: ${pct(r.margem)} | Qtd: ${r.qty}`);
    }

    doc.moveDown(1);
    doc.fontSize(14).text('Top 3 produtos com menor margem');
    doc.moveDown(0.5);
    doc.fontSize(11);
    for (const r of piorMargem) {
      doc.text(`${r.sku} — ${r.descricao || ''}`);
      doc.text(`  Margem: ${pct(r.margem)} | Lucro: ${money(r.lucro)} | Renda: ${money(r.renda)} | Qtd: ${r.qty}`);
    }

    doc.moveDown(1);
    doc.fontSize(10).fillColor('#666').text(
      'Notas: ROI e ROAS usam ConsumoAds e renda/custo de pedidos no período. Atribuição por campanha pode ser aproximada, dependendo da origem dos dados.'
    );

    doc.end();

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    logger.info(`✅ PDF gerado: ${outPath}`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch((e) => {
  logger.error('Erro ao gerar relatório semanal', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});
