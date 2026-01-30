import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Badge } from '../components/Badge';
import { fmtDateTimeBR } from '../utils/dates';
import { formatBRL, formatPct } from '../utils/format';
import { getAnuncioDetalhes, type AnuncioDetalhesResponse } from '../services/endpoints';

function getShopeeProductUrl(shopId?: number | null, itemId?: string | null) {
  if (!shopId || !itemId) return null;
  return `https://shopee.com.br/product/${shopId}/${itemId}`;
}

function normalizeStatusForUI(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s === 'ATIVO' || s === 'NORMAL') return { label: 'Ativo', tone: 'green' as const };
  if (s === 'INATIVO' || s === 'UNLIST') return { label: 'Inativo', tone: 'yellow' as const };
  return { label: s || '-', tone: 'slate' as const };
}

export function AnuncioDetalhePage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<AnuncioDetalhesResponse['data'] | null>(null);

  useEffect(() => {
    let alive = true;
    async function run() {
      if (!id) return;
      setLoading(true);
      try {
        const res = await getAnuncioDetalhes(id, { days });
        if (!alive) return;
        setData(res.data);
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
  }, [id, days]);

  const anuncio = data?.anuncio;
  const resumo = data?.resumo;

  const skuMeta = useMemo(() => {
    const bySku = new Map<string, { nome?: string | null; modelId?: string | null }>();
    const vars = Array.isArray(anuncio?.variacoes) ? anuncio?.variacoes : [];
    for (const v of vars || []) {
      const sku = String(v.sku || '').trim();
      if (!sku) continue;
      bySku.set(sku, { nome: v.nome, modelId: v.modelId });
    }
    return bySku;
  }, [anuncio]);

  const rows = useMemo(() => {
    const list = data?.porSku || [];
    return list.map((r) => {
      const meta = skuMeta.get(r.sku);
      return {
        ...r,
        label: meta?.nome || (r.sku === anuncio?.sku ? anuncio?.nome : null),
        modelId: meta?.modelId || null,
      };
    });
  }, [data?.porSku, skuMeta, anuncio?.sku, anuncio?.nome]);

  if (!id) {
    return (
      <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        ID inválido.
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-slate-600">
            <Link to="/anuncios" className="text-slate-700 hover:underline">
              ← Voltar
            </Link>
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-900">Detalhes do anúncio</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Período</label>
          <select
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            disabled={loading}
          >
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={365}>365 dias</option>
          </select>
        </div>
      </div>

      {!data ? (
        <div className="rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200">
          {loading ? 'Carregando…' : 'Sem dados.'}
        </div>
      ) : (
        <>
          <div className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-12">
            <div className="md:col-span-3">
              <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
                {anuncio?.imageUrl ? (
                  <img
                    src={anuncio.imageUrl}
                    alt={anuncio.nome}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:col-span-9">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[220px]">
                  <div className="text-sm font-semibold text-slate-900">{anuncio?.nome}</div>
                  <div className="mt-1 text-xs text-slate-600">
                    SKU: <span className="font-mono">{anuncio?.sku || '-'}</span> · Item:{' '}
                    <span className="font-mono">{anuncio?.itemId || '-'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={normalizeStatusForUI(anuncio?.status).tone}>{normalizeStatusForUI(anuncio?.status).label}</Badge>
                  {getShopeeProductUrl(anuncio?.shopId, anuncio?.itemId) ? (
                    <a
                      href={getShopeeProductUrl(anuncio?.shopId, anuncio?.itemId) as string}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Ver na Shopee
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-600">Renda líquida</div>
                  <div className="mt-1 text-base font-bold text-slate-900">{formatBRL(resumo?.rendaLiquida || 0)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-600">Lucro</div>
                  <div className="mt-1 text-base font-bold text-slate-900">{formatBRL(resumo?.lucro || 0)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-600">Margem</div>
                  <div className="mt-1 text-base font-bold text-slate-900">{formatPct(resumo?.margem || 0)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-600">Pedidos</div>
                  <div className="mt-1 text-base font-bold text-slate-900">{resumo?.pedidos || 0}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-600">Unidades</div>
                  <div className="mt-1 text-base font-bold text-slate-900">{resumo?.quantidade || 0}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-slate-600">Período</div>
                  <div className="mt-1 text-xs font-semibold text-slate-900">
                    {fmtDateTimeBR(data.periodo.start)} → {fmtDateTimeBR(data.periodo.end)}
                  </div>
                </div>
              </div>

              {data.observacoes?.precisaSyncPedidos ? (
                <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                  Sem vendas/margem para o período. Isso normalmente significa que o sync de pedidos/lucro ainda não rodou ou não há vendas recentes.
                </div>
              ) : null}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <div className="border-b border-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-900">Vendas e margem por variação/SKU</div>
              <div className="mt-1 text-xs text-slate-600">Ordenado por renda líquida.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Variação</th>
                    <th className="px-4 py-3">Pedidos</th>
                    <th className="px-4 py-3">Unidades</th>
                    <th className="px-4 py-3">Renda</th>
                    <th className="px-4 py-3">Custo</th>
                    <th className="px-4 py-3">Lucro</th>
                    <th className="px-4 py-3">Margem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                        Sem dados de vendas para este período.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => (
                      <tr key={r.sku}>
                        <td className="px-4 py-3 font-mono text-xs text-slate-800">{r.sku}</td>
                        <td className="px-4 py-3 text-slate-700" title={r.label || ''}>
                          {r.label || '-'}
                          {r.modelId ? <span className="ml-2 font-mono text-[11px] text-slate-400">model {r.modelId}</span> : null}
                        </td>
                        <td className="px-4 py-3">{r.pedidos}</td>
                        <td className="px-4 py-3">{r.quantidade}</td>
                        <td className="px-4 py-3 font-medium">{formatBRL(r.rendaLiquida)}</td>
                        <td className="px-4 py-3">{formatBRL(r.custoTotal)}</td>
                        <td className="px-4 py-3">{formatBRL(r.lucro)}</td>
                        <td className="px-4 py-3">{formatPct(r.margem)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
