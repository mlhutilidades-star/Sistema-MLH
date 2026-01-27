import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getOtimizacaoPrecos,
  getProdutoBySku,
  patchProdutoPreco,
  type OtimizacaoRow,
} from '../services/endpoints';
import { daysAgoISODate, todayISODate } from '../utils/dates';
import { formatBRL, formatPct } from '../utils/format';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { trackEvent } from '../services/analytics';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type Details = { sku: string; row: OtimizacaoRow };

function calcProfitImpact(row: OtimizacaoRow): number {
  const qty = Number(row.vendas.quantidade) || 0;
  const custoUnit = Number(row.precos.custoUnitario || 0) || 0;
  const ratio = Number(row.precos.ratioLiquidoPorBruto || 0) || 0;
  const grossAtual = Number(row.precos.precoMedioVenda || 0) || 0;
  const grossSug = Number(row.sugestao.precoSugerido || 0) || 0;

  if (qty <= 0 || custoUnit <= 0 || ratio <= 0 || grossAtual <= 0 || grossSug <= 0) return 0;

  const netAtual = grossAtual * ratio;
  const netSug = grossSug * ratio;

  const lucroUnitAtual = netAtual - custoUnit;
  const lucroUnitSug = netSug - custoUnit;

  return (lucroUnitSug - lucroUnitAtual) * qty;
}

export function OtimizacaoPage() {
  const [dataInicio, setDataInicio] = useState(daysAgoISODate(29));
  const [dataFim, setDataFim] = useState(todayISODate());
  const [metaMargemPct, setMetaMargemPct] = useState('25');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OtimizacaoRow[]>([]);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Details | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const meta = Number(metaMargemPct.replace(',', '.'));
      const res = await getOtimizacaoPrecos({ dataInicio, dataFim, metaMargemPct: Number.isFinite(meta) ? meta : 25, limit: 50 });
      setRows(res.data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => rows.filter((r) => !ignored.has(r.sku)), [rows, ignored]);

  const chartData = useMemo(() => {
    return visible
      .map((r) => ({
        sku: r.sku,
        impacto: Math.round(calcProfitImpact(r)),
      }))
      .filter((x) => x.impacto !== 0)
      .slice(0, 12);
  }, [visible]);

  async function applyAjuste(row: OtimizacaoRow) {
    const preco = Number(row.sugestao.precoSugerido);
    if (!Number.isFinite(preco) || preco <= 0) {
      toast.error('Sem preço sugerido para aplicar');
      return;
    }

    try {
      const produto = await getProdutoBySku(row.sku);
      await patchProdutoPreco(produto.id, preco);
      trackEvent('preco_ajustado', { sku: row.sku, preco_sugerido: preco });
      toast.success('Preço aplicado (precoVenda atualizado)');
      setIgnored((prev) => new Set(prev).add(row.sku));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function ignore(row: OtimizacaoRow) {
    setIgnored((prev) => new Set(prev).add(row.sku));
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-3 md:grid-cols-5 md:items-end">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">Data início</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">Data fim</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">Meta de margem (%)</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={metaMargemPct} onChange={(e) => setMetaMargemPct(e.target.value)} />
          </div>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" onClick={() => void refresh()}>
            Recalcular
          </button>
          <div className="text-xs text-slate-500">
            Dica: “Aplicar Ajuste” requer <b>x-admin-secret</b> (Config).
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-600">Impacto estimado no lucro</div>
            <div className="text-xs text-slate-500">Estimativa baseada em (ratio líquido/bruto) e volume no período</div>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="sku" hide />
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(v) => formatBRL(Number(v))} />
              <Bar dataKey="impacto" fill="#0f172a" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Preço atual</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3">Margem atual</th>
                <th className="px-4 py-3">Meta</th>
                <th className="px-4 py-3">Preço sugerido</th>
                <th className="px-4 py-3">Δ%</th>
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Carregando…</td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">Sem sugestões no período.</td>
                </tr>
              ) : (
                visible.map((r) => {
                  const m = Number(r.vendas.margemAtualPct) || 0;
                  const tone = m > 25 ? 'green' : m >= 15 ? 'yellow' : 'red';
                  const delta = r.sugestao.deltaPct;
                  return (
                    <tr key={r.sku} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-3">{r.precos.precoMedioVenda ? formatBRL(r.precos.precoMedioVenda) : '-'}</td>
                      <td className="px-4 py-3">{r.precos.custoUnitario ? formatBRL(r.precos.custoUnitario) : '-'}</td>
                      <td className="px-4 py-3"><Badge tone={tone}>{formatPct(m)}</Badge></td>
                      <td className="px-4 py-3">{formatPct(r.meta.margemPct)}</td>
                      <td className="px-4 py-3 font-semibold">{r.sugestao.precoSugerido ? formatBRL(r.sugestao.precoSugerido) : '-'}</td>
                      <td className="px-4 py-3">{delta === null ? '-' : formatPct(delta)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                            disabled={!r.sugestao.precoSugerido}
                            onClick={() => void applyAjuste(r)}
                          >
                            Aplicar Ajuste
                          </button>
                          <button
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() => ignore(r)}
                          >
                            Ignorar
                          </button>
                          <button
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                            onClick={() => setDetails({ sku: r.sku, row: r })}
                          >
                            Ver Detalhes
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={!!details}
        title={details ? `Detalhes — ${details.sku}` : 'Detalhes'}
        onClose={() => setDetails(null)}
      >
        {details ? (
          <div className="grid gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Elasticidade</div>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-800">{JSON.stringify(details.row.elasticidade, null, 2)}</pre>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-600">Concorrência</div>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-800">{JSON.stringify(details.row.competencia, null, 2)}</pre>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
