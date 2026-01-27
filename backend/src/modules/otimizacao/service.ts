import { getPrismaClient } from '../../shared/database';

function safeNumber(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

type Regressao = {
  slope: number;
  intercept: number;
  r2: number;
  n: number;
};

function regressaoLinear(xs: number[], ys: number[]): Regressao | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  const r2 = syy === 0 ? 1 : clamp((sxy * sxy) / (sxx * syy), 0, 1);

  return { slope, intercept, r2, n };
}

export class OtimizacaoService {
  private prisma = getPrismaClient();

  async sugerirPrecos(input: {
    dataInicio: Date;
    dataFim: Date;
    metaMargemPct?: number; // 25 => 25%
    limit?: number;
  }) {
    const metaMargemPct = safeNumber(input.metaMargemPct ?? 25);
    const meta = metaMargemPct / 100;
    const limit = Math.max(1, Math.min(200, Math.floor(safeNumber(input.limit ?? 50) || 50)));

    const itens = await this.prisma.pedidoItem.findMany({
      where: {
        pedido: { data: { gte: input.dataInicio, lte: input.dataFim } },
      },
      select: {
        sku: true,
        quantidade: true,
        precoVenda: true,
        rendaLiquida: true,
        custoTotal: true,
      },
    });

    // aggregates por SKU
    const agg = new Map<
      string,
      {
        qty: number;
        renda: number;
        custo: number;
        gross: number;
        obsPrices: number[];
        obsQty: number[];
      }
    >();

    for (const it of itens) {
      const sku = String(it.sku || '').trim();
      if (!sku) continue;
      const qty = safeNumber(it.quantidade);
      if (qty <= 0) continue;

      const renda = safeNumber(it.rendaLiquida);
      const custo = safeNumber(it.custoTotal);
      const preco = safeNumber(it.precoVenda);
      const gross = preco > 0 ? preco * qty : 0;

      const cur = agg.get(sku) || { qty: 0, renda: 0, custo: 0, gross: 0, obsPrices: [], obsQty: [] };
      cur.qty += qty;
      cur.renda += renda;
      cur.custo += custo;
      cur.gross += gross;
      if (preco > 0) {
        cur.obsPrices.push(preco);
        cur.obsQty.push(qty);
      }
      agg.set(sku, cur);
    }

    const rows = Array.from(agg.entries())
      .map(([sku, a]) => {
        const lucro = a.renda - a.custo;
        const margemAtual = a.renda > 0 ? lucro / a.renda : 0;
        const custoUnit = a.qty > 0 ? a.custo / a.qty : 0;
        const netUnit = a.qty > 0 ? a.renda / a.qty : 0;
        const grossUnit = a.qty > 0 && a.gross > 0 ? a.gross / a.qty : 0;
        const ratioNetToGross = a.gross > 0 ? a.renda / a.gross : 0;

        // elasticidade (aprox.): regressão em log(q) vs log(p)
        const xs: number[] = [];
        const ys: number[] = [];
        for (let i = 0; i < a.obsPrices.length; i++) {
          const p = a.obsPrices[i];
          const q = a.obsQty[i];
          if (p <= 0 || q <= 0) continue;
          xs.push(Math.log(p));
          ys.push(Math.log(q));
        }
        const reg = xs.length >= 8 ? regressaoLinear(xs, ys) : null;
        const elasticidade = reg ? reg.slope : null;

        let sugestaoPreco: number | null = null;
        let impactoEsperado: string | null = null;

        if (custoUnit > 0 && ratioNetToGross > 0 && meta > 0 && meta < 0.9) {
          const netDesejado = custoUnit / (1 - meta);
          sugestaoPreco = netDesejado / ratioNetToGross;

          if (elasticidade !== null) {
            // se elasticidade negativa forte, aumento reduz demanda
            if (elasticidade < -1.5) impactoEsperado = 'Demanda sensível ao preço (risco alto)';
            else if (elasticidade < -0.7) impactoEsperado = 'Demanda moderadamente sensível';
            else impactoEsperado = 'Demanda pouco sensível';
          }
        }

        return {
          sku,
          vendas: { quantidade: a.qty, rendaLiquida: a.renda, custoProdutos: a.custo, lucro, margemAtualPct: margemAtual * 100 },
          precos: {
            precoMedioVenda: grossUnit || null,
            receitaLiquidaUnit: netUnit || null,
            custoUnitario: custoUnit || null,
            ratioLiquidoPorBruto: ratioNetToGross || null,
          },
          meta: { margemPct: metaMargemPct },
          sugestao: {
            precoSugerido: sugestaoPreco,
            deltaPct: sugestaoPreco && grossUnit > 0 ? ((sugestaoPreco - grossUnit) / grossUnit) * 100 : null,
            impactoEsperado,
          },
          competencia: {
            status: 'INDISPONIVEL',
            motivo: 'Sem integração de pesquisa de concorrência na Shopee (market search) neste backend.',
          },
          elasticidade:
            reg && elasticidade !== null
              ? {
                  estimativa: elasticidade,
                  r2: reg.r2,
                  n: reg.n,
                  interpretacao:
                    elasticidade < -1.5
                      ? 'Alta elasticidade (muito sensível)'
                      : elasticidade < -0.7
                        ? 'Média elasticidade'
                        : 'Baixa elasticidade',
                }
              : { status: 'INSUFICIENTE', motivo: 'Pouca variação de preço ou poucas observações no período.' },
        };
      })
      .sort((a, b) => (b.vendas.lucro || 0) - (a.vendas.lucro || 0))
      .slice(0, limit);

    return {
      success: true,
      periodo: { inicio: input.dataInicio.toISOString(), fim: input.dataFim.toISOString() },
      metaMargemPct,
      totalSkus: rows.length,
      data: rows,
      observacoes: [
        'Sugestão usa margem líquida (rendaLiquida) vs custoProdutos, não inclui taxa/ads por SKU.',
        'Elasticidade é aproximada via histórico de preço por pedido (PedidoItem.precoVenda).',
      ],
    };
  }
}
