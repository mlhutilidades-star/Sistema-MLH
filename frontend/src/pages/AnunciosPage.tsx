import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getAdsStatus, listAnunciosCatalogo, type AnuncioCatalogo } from '../services/endpoints';
import { fmtDateTimeBR } from '../utils/dates';
import { formatBRL } from '../utils/format';
import { Badge } from '../components/Badge';

export function AnunciosPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AnuncioCatalogo[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [adsWarning, setAdsWarning] = useState<string | null>(null);
  const limit = 50;

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      try {
        const [ads, catalogo] = await Promise.all([
          getAdsStatus().catch(() => null),
          listAnunciosCatalogo({ page, limit, q: q.trim() || undefined, status: status || undefined }),
        ]);
        if (!alive) return;

        setRows(catalogo.data);
        setTotal(catalogo.total);

        if (ads && ads.available === false) {
          setAdsWarning(ads.lastMessage || 'Ads indisponível para esta conta/permissão');
        } else {
          setAdsWarning(null);
        }
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
  }, [page, q, status]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  return (
    <div className="grid gap-6">
      {adsWarning ? (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <b>Ads indisponível:</b> {adsWarning}. A listagem do catálogo continua funcionando.
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-3 md:grid-cols-4 md:items-end">
          <div className="grid gap-1 md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Buscar (nome/sku)</label>
            <input
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={q}
              placeholder="Ex: kit, 123-ABC..."
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>

          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </select>
          </div>

          <div className="text-sm text-slate-600">
            Total: <b>{total}</b>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Anúncio</th>
                <th className="px-4 py-3">SKU / Item</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Atualizado</th>
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
                rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.nome}</div>
                      <div className="text-xs text-slate-500">{r.platform} / shop {r.shopId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-mono text-slate-700">{r.sku || '-'}</div>
                      <div className="text-xs font-mono text-slate-500">item {r.itemId || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={r.status === 'ATIVO' ? 'green' : r.status === 'INATIVO' ? 'yellow' : 'slate'}>{r.status}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium">{r.preco == null ? '-' : formatBRL(r.preco)}</td>
                    <td className="px-4 py-3">{r.estoque == null ? '-' : r.estoque}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDateTimeBR(r.updatedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
          <div className="text-slate-600">
            Página <b>{page}</b> de <b>{totalPages}</b>
          </div>
          <div className="flex gap-2">
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Anterior
            </button>
            <button
              className="rounded-xl border border-slate-200 px-3 py-1.5 disabled:opacity-50"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
