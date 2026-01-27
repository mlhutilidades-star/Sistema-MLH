import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getAdsRelatorio } from '../services/endpoints';
import { daysAgoISODate, todayISODate } from '../utils/dates';
import { formatBRL, formatPct } from '../utils/format';
import { Badge } from '../components/Badge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type CampanhaAgg = {
  campanhaId: string;
  campanhaNome: string;
  gasto: number;
  gmv: number;
  pedidos: number;
  roiPct: number; // aproximado: (gmv - gasto)/gasto
  lucroAprox: number; // gmv - gasto
};

function suggestion(roiPct: number): { label: string; tone: 'green' | 'yellow' | 'red' | 'slate' } {
  if (!Number.isFinite(roiPct)) return { label: 'Sem dados', tone: 'slate' };
  if (roiPct < 0) return { label: 'Pausar campanha', tone: 'red' };
  if (roiPct < 50) return { label: 'Otimizar criativos/segmentação', tone: 'yellow' };
  return { label: 'Aumentar orçamento', tone: 'green' };
}

export function AnunciosPage() {
  const [dataInicio, setDataInicio] = useState(daysAgoISODate(29));
  const [dataFim, setDataFim] = useState(todayISODate());
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CampanhaAgg[]>([]);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      try {
        const r = await getAdsRelatorio({ dataInicio, dataFim });
        if (!alive) return;

        const map = new Map<string, CampanhaAgg>();
        for (const d of r.detalhes) {
          const key = d.campanhaId;
          const cur = map.get(key) || {
            campanhaId: d.campanhaId,
            campanhaNome: d.campanhaNome || d.campanhaId,
            gasto: 0,
            gmv: 0,
            pedidos: 0,
            roiPct: 0,
            lucroAprox: 0,
          };
          cur.gasto += Number(d.gasto) || 0;
          cur.gmv += Number(d.gmv) || 0;
          cur.pedidos += Number(d.pedidos) || 0;
          map.set(key, cur);
        }

        const out = Array.from(map.values())
          .map((c) => {
            const lucroAprox = c.gmv - c.gasto;
            const roiPct = c.gasto > 0 ? (lucroAprox / c.gasto) * 100 : 0;
            return { ...c, lucroAprox, roiPct };
          })
          .sort((a, b) => b.gasto - a.gasto);

        setRows(out);
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

  const chartData = useMemo(() => {
    return rows
      .slice(0, 10)
      .map((r) => ({ name: r.campanhaNome.slice(0, 18), roi: Math.round(r.roiPct * 10) / 10 }));
  }, [rows]);

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-3 md:grid-cols-4 md:items-end">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">Data início</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">Data fim</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <div className="text-sm text-slate-600 md:col-span-2">
            ROI aqui é <b>aproximado</b>: $(GMV - gasto) / gasto$. Para ROI Real Final use o Dashboard.
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3 text-sm font-medium text-slate-600">ROI por campanha (top 10 por gasto)</div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v) => formatPct(Number(v))} />
              <Bar dataKey="roi" fill="#0f172a" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Campanha</th>
                <th className="px-4 py-3">Gasto</th>
                <th className="px-4 py-3">Renda gerada (GMV)</th>
                <th className="px-4 py-3">Lucro (aprox)</th>
                <th className="px-4 py-3">ROI (aprox)</th>
                <th className="px-4 py-3">Sugestão</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Sem dados.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const sug = suggestion(r.roiPct);
                  return (
                    <tr key={r.campanhaId} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.campanhaNome}</div>
                        <div className="text-xs font-mono text-slate-500">{r.campanhaId}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">{formatBRL(r.gasto)}</td>
                      <td className="px-4 py-3">{formatBRL(r.gmv)}</td>
                      <td className={`px-4 py-3 font-semibold ${r.lucroAprox >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatBRL(r.lucroAprox)}</td>
                      <td className="px-4 py-3"><Badge tone={r.roiPct >= 50 ? 'green' : r.roiPct >= 0 ? 'yellow' : 'red'}>{formatPct(r.roiPct)}</Badge></td>
                      <td className="px-4 py-3"><Badge tone={sug.tone}>{sug.label}</Badge></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
