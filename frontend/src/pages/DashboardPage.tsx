import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import {
  getAdsRelatorio,
  getLucroTotal,
  getTopLucro,
  listPedidos,
  listProdutos,
  type TopLucroItem,
} from '../services/endpoints';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { daysAgoISODate, fmtDateBR, todayISODate } from '../utils/dates';
import { formatBRL, formatPct } from '../utils/format';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type DailyPoint = { dia: string; lucro: number };

function buildDailySeries(pedidos: { data: string; lucro: number }[], dataInicio: string, dataFim: string): DailyPoint[] {
  const start = new Date(`${dataInicio}T00:00:00.000Z`);
  const end = new Date(`${dataFim}T23:59:59.999Z`);
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const byDay = new Map<string, number>();
  for (const p of pedidos) {
    const day = new Date(p.data).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + (Number(p.lucro) || 0));
  }

  return days.map((dia) => ({ dia, lucro: byDay.get(dia) || 0 }));
}

export function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [lucroTotal, setLucroTotal] = useState<Awaited<ReturnType<typeof getLucroTotal>> | null>(null);
  const [topLucro, setTopLucro] = useState<TopLucroItem[]>([]);
  const [lucroSeries, setLucroSeries] = useState<DailyPoint[]>([]);
  const [criticos, setCriticos] = useState<{ tipo: string; detalhe: string }[]>([]);
  const [pedidosHoje, setPedidosHoje] = useState<number>(0);

  const dataFim = todayISODate();
  const dataInicio = daysAgoISODate(29);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      try {
        const [lt, tl, pedidos30, produtos, ads] = await Promise.all([
          getLucroTotal({ dataInicio, dataFim }),
          getTopLucro({ dataInicio, dataFim, limit: 5 }),
          listPedidos({ dataInicio, dataFim, limit: 500 }),
          listProdutos({ ativo: true }),
          getAdsRelatorio({ dataInicio, dataFim }),
        ]);

        if (!alive) return;

        setLucroTotal(lt);
        setTopLucro(tl.data);

        const series = buildDailySeries(pedidos30.data.map((p) => ({ data: p.data, lucro: p.lucro })), dataInicio, dataFim);
        setLucroSeries(series);

        const today = todayISODate();
        setPedidosHoje(pedidos30.data.filter((p) => new Date(p.data).toISOString().slice(0, 10) === today).length);

        const alertas: { tipo: string; detalhe: string }[] = [];
        const custoZero = produtos.data.filter((p) => (Number(p.custoReal) || 0) <= 0);
        for (const p of custoZero.slice(0, 5)) {
          alertas.push({ tipo: 'Custo zero', detalhe: `${p.sku} — ${p.descricao}` });
        }

        const criticosMargem = tl.data.filter((i) => i.status === 'CRITICO');
        for (const i of criticosMargem.slice(0, 5)) {
          alertas.push({ tipo: 'Margem crítica', detalhe: `${i.sku} — ${formatPct(i.margemPorcentagem)} (${formatBRL(i.lucro)})` });
        }

        if (ads.totais.gasto > 0 && lt.rendaLiquida > 0) {
          const pct = (ads.totais.gasto / lt.rendaLiquida) * 100;
          if (pct > 30) {
            alertas.push({ tipo: 'Ads alto', detalhe: `Gasto Ads = ${formatPct(pct)} da renda líquida` });
          }
        }

        setCriticos(alertas);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [dataInicio, dataFim]);

  const pedidosHojeLabel = useMemo(() => {
    if (!lucroTotal) return '-';
    return `${fmtDateBR(lucroTotal.periodo.inicio)} → ${fmtDateBR(lucroTotal.periodo.fim)}`;
  }, [lucroTotal]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Lucro Total (Real Final)" subtitle={lucroTotal ? formatBRL(lucroTotal.lucroRealFinal) : loading ? 'Carregando…' : '-'}>
          <div className="text-xs text-slate-500">Período: {pedidosHojeLabel}</div>
        </Card>
        <Card title="Margem Média" subtitle={lucroTotal ? formatPct(lucroTotal.margemMedia) : loading ? 'Carregando…' : '-'} />
        <Card
          title="Pedidos Hoje"
          subtitle={loading ? 'Carregando…' : String(pedidosHoje)}
          right={<Badge tone={pedidosHoje > 0 ? 'blue' : 'slate'}>{pedidosHoje > 0 ? 'HOJE' : '—'}</Badge>}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-600">Lucro por dia</div>
              <div className="text-xs text-slate-500">Últimos 30 dias</div>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lucroSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" tickFormatter={(v) => v.slice(8)} />
                <YAxis tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip
                  formatter={(value) => formatBRL(Number(value))}
                  labelFormatter={(label) => fmtDateBR(String(label))}
                />
                <Line type="monotone" dataKey="lucro" stroke="#0f172a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-medium text-slate-600">Alertas críticos</div>
          <div className="mt-3 grid gap-2">
            {criticos.length === 0 ? (
              <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-100">Nenhum alerta crítico detectado.</div>
            ) : (
              criticos.map((a, idx) => (
                <div key={idx} className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-100">
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">{a.tipo}</div>
                  <div className="mt-1 text-sm">{a.detalhe}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-600">Top 5 produtos (lucro)</div>
            <div className="text-xs text-slate-500">Baseado em PedidoItem no período</div>
          </div>
          <Link className="text-sm font-medium" to="/produtos">Ver produtos</Link>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-4">SKU</th>
                <th className="py-2 pr-4">Descrição</th>
                <th className="py-2 pr-4">Lucro</th>
                <th className="py-2 pr-4">Margem</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {topLucro.map((p) => (
                <tr key={p.sku} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-mono text-xs">{p.sku}</td>
                  <td className="py-2 pr-4 text-slate-700">{p.descricao || '-'}</td>
                  <td className="py-2 pr-4 font-medium">{formatBRL(p.lucro)}</td>
                  <td className="py-2 pr-4">{formatPct(p.margemPorcentagem)}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={p.status === 'EXCELENTE' ? 'green' : p.status === 'SAUDAVEL' ? 'yellow' : 'red'}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
              {topLucro.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500">
                    {loading ? 'Carregando…' : 'Sem dados no período.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
