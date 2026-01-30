import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getAdsStatus, listAnunciosCatalogo, type AnuncioCatalogo } from '../services/endpoints';
import { fmtDateTimeBR } from '../utils/dates';
import { formatBRL } from '../utils/format';
import { Badge } from '../components/Badge';

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

export function AnunciosPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AnuncioCatalogo[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [adsWarning, setAdsWarning] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<string>('updatedAt_desc');
  const [openVariacoes, setOpenVariacoes] = useState<Record<string, boolean>>({});
  const limit = 50;

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      try {
        const [ads, catalogo] = await Promise.all([
          getAdsStatus().catch(() => null),
          listAnunciosCatalogo({ page, limit, q: q.trim() || undefined, status: status || undefined, sort }),
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
  }, [page, q, status, sort]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const tabs = [
    { label: 'Todos', value: '' },
    { label: 'Ativos', value: 'ATIVO' },
    { label: 'Inativos', value: 'INATIVO' },
  ];

  return (
    <div className="grid gap-6">
      {adsWarning ? (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <b>Ads indisponível:</b> {adsWarning}. A listagem do catálogo continua funcionando.
        </div>
      ) : null}

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((t) => (
              <button
                key={t.value || 'ALL'}
                className={
                  status === t.value
                    ? 'rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white'
                    : 'rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200'
                }
                onClick={() => {
                  setPage(1);
                  setStatus(t.value);
                }}
                disabled={loading}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-600">
            Total: <b>{total}</b>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-6">
            <label className="text-xs font-medium text-slate-600">Buscar produto (título/SKU)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={q}
              placeholder="Ex: cadeira, kit, 123-ABC..."
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-medium text-slate-600">Ordenar</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={sort}
              onChange={(e) => {
                setPage(1);
                setSort(e.target.value);
              }}
            >
              <option value="updatedAt_desc">Mais recentes</option>
              <option value="updatedAt_asc">Mais antigos</option>
              <option value="price_desc">Preço (maior)</option>
              <option value="price_asc">Preço (menor)</option>
              <option value="stock_desc">Estoque (maior)</option>
              <option value="name_asc">Nome (A→Z)</option>
              <option value="name_desc">Nome (Z→A)</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs font-medium text-slate-600">Visualização</label>
            <div className="mt-1 flex gap-2">
              <button
                className={
                  view === 'grid'
                    ? 'flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white'
                    : 'flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
                }
                onClick={() => setView('grid')}
                disabled={loading}
              >
                Grade
              </button>
              <button
                className={
                  view === 'list'
                    ? 'flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white'
                    : 'flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'
                }
                onClick={() => setView('list')}
                disabled={loading}
              >
                Lista
              </button>
            </div>
          </div>
        </div>
      </div>

      {view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {loading ? (
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200">
              Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 xl:col-span-4 rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200">
              Sem anúncios para esse filtro.
            </div>
          ) : (
            rows.map((r) => {
              const st = normalizeStatusForUI(r.status);
              const url = getShopeeProductUrl(r.shopId, r.itemId);
              const variacoes = Array.isArray(r.variacoes) ? r.variacoes : [];
              const hasVariacoes = variacoes.length > 0;
              const isOpen = !!openVariacoes[r.id];
              return (
                <div key={r.id} className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  <div className="relative aspect-square bg-slate-50">
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        alt={r.nome}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <div className="absolute left-2 top-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  </div>

                  <div className="grid gap-2 p-4">
                    <div className="line-clamp-2 text-sm font-semibold text-slate-900" title={r.nome}>
                      {r.nome}
                    </div>

                    <div className="flex items-baseline justify-between gap-3">
                      <div className="text-base font-bold text-slate-900">{r.preco == null ? '-' : formatBRL(r.preco)}</div>
                      <div className="text-xs text-slate-600">Estoque: {r.estoque == null ? '-' : r.estoque}</div>
                    </div>

                    <div className="grid gap-1 text-xs text-slate-600">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">SKU</span>
                        <span className="max-w-[70%] truncate font-mono text-slate-800">{r.sku || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Item</span>
                        <span className="max-w-[70%] truncate font-mono text-slate-800">{r.itemId || '-'}</span>
                      </div>

                      {hasVariacoes ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-500">Variações</span>
                          <button
                            type="button"
                            className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                            onClick={() => setOpenVariacoes((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                          >
                            {isOpen ? 'Ocultar' : `Ver (${variacoes.length})`}
                          </button>
                        </div>
                      ) : null}

                      {hasVariacoes && isOpen ? (
                        <div className="mt-1 grid gap-1 rounded-xl bg-slate-50 p-2">
                          {variacoes.slice(0, 12).map((v) => (
                            <div key={v.id} className="flex items-center justify-between gap-2">
                              <span className="max-w-[55%] truncate font-mono text-slate-800" title={v.sku || v.nome || ''}>
                                {v.sku || v.nome || `model ${v.modelId || '-'}`}
                              </span>
                              <span className="text-slate-600">Est: {v.estoque == null ? '-' : v.estoque}</span>
                              <span className="text-slate-900">{v.preco == null ? '-' : formatBRL(v.preco)}</span>
                            </div>
                          ))}
                          {variacoes.length > 12 ? (
                            <div className="text-xs text-slate-500">+{variacoes.length - 12} variações…</div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Atualizado</span>
                        <span className="text-slate-700">{fmtDateTimeBR(r.updatedAt)}</span>
                      </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-500">{r.platform} / shop {r.shopId}</div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/anuncios/${r.id}`}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Detalhes
                        </Link>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                          >
                            Ver na Shopee
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">SKU / Item</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Preço</th>
                  <th className="px-4 py-3">Estoque</th>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Carregando…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Sem dados.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const st = normalizeStatusForUI(r.status);
                    const url = getShopeeProductUrl(r.shopId, r.itemId);
                    return (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
                              {r.imageUrl ? (
                                <img
                                  src={r.imageUrl}
                                  alt={r.nome}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : null}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{r.nome}</div>
                              <div className="text-xs text-slate-500">{r.platform} / shop {r.shopId}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-xs font-mono text-slate-700">{r.sku || '-'}</div>
                          <div className="text-xs font-mono text-slate-500">item {r.itemId || '-'}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        <td className="px-4 py-3 font-medium">{r.preco == null ? '-' : formatBRL(r.preco)}</td>
                        <td className="px-4 py-3">{r.estoque == null ? '-' : r.estoque}</td>
                        <td className="px-4 py-3 text-slate-600">{fmtDateTimeBR(r.updatedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              to={`/anuncios/${r.id}`}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Detalhes
                            </Link>
                            {url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                              >
                                Ver na Shopee
                              </a>
                            ) : null}
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
      )}

      <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200">
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
  );
}
