import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  addMapeamentoSku,
  getProdutoBySku,
  listAnunciosRentabilidade,
  patchProdutoCusto,
  type AnuncioRentabilidade,
  type AnuncioRentabilidadeVariacao,
  type Produto,
} from '../services/endpoints';
import { fmtDateTimeBR } from '../utils/dates';
import { formatBRL, formatPct } from '../utils/format';
import { Badge } from '../components/Badge';
import { getApiBaseUrl } from '../services/api';

function normalizeStatusForUI(status?: string | null) {
  const s = String(status || '').toUpperCase();
  if (s === 'ATIVO' || s === 'NORMAL') return { label: 'Ativo', tone: 'green' as const };
  if (s === 'INATIVO' || s === 'UNLIST') return { label: 'Inativo', tone: 'yellow' as const };
  return { label: s || '-', tone: 'slate' as const };
}

function getMarginClasses(margem: number) {
  if (margem >= 30) return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  if (margem >= 10) return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
}

export function AnunciosPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AnuncioRentabilidade[]>([]);
  const [resumo, setResumo] = useState<{
    totalAnuncios: number;
    estoqueTotal: number;
    rendaTotal: number;
    custoTotal: number;
    lucroTotal: number;
    margemMedia: number;
    semCusto: number;
  } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>('ATIVO');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<string>('lucro_desc');
  const [margemMinima, setMargemMinima] = useState<number | ''>('');
  const [estoqueMinimo, setEstoqueMinimo] = useState<number | ''>('');
  const [semCusto, setSemCusto] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [openDetalhes, setOpenDetalhes] = useState<Record<string, boolean>>({});
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingSku, setSavingSku] = useState<string | null>(null);
  const [produtoCache, setProdutoCache] = useState<Record<string, Produto | null>>({});
  const [mappingInput, setMappingInput] = useState<Record<string, string>>({});
  const [mappingLoading, setMappingLoading] = useState<Record<string, boolean>>({});

  const debugEnabled = useMemo(() => String(import.meta.env.VITE_DEBUG || '').toLowerCase() === 'true', []);

  const limit = 30;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (debugEnabled) {
        console.log('[Anuncios] API base:', getApiBaseUrl());
        console.log('[Anuncios] Query:', {
          page,
          limit,
          q: q.trim() || undefined,
          status: status || undefined,
          sort,
          margemMinima: margemMinima === '' ? undefined : Number(margemMinima),
          estoqueMinimo: estoqueMinimo === '' ? undefined : Number(estoqueMinimo),
          semCusto: semCusto ? true : undefined,
        });
      }
      const res = await listAnunciosRentabilidade({
        page,
        limit,
        q: q.trim() || undefined,
        status: status || undefined,
        sort,
        margemMinima: margemMinima === '' ? undefined : Number(margemMinima),
        estoqueMinimo: estoqueMinimo === '' ? undefined : Number(estoqueMinimo),
        semCusto: semCusto ? true : undefined,
      });
      if (debugEnabled) {
        console.log('[Anuncios] Response:', { total: res.total, count: res.data.length, resumo: res.resumo });
      }
      setRows(res.data);
      setResumo(res.resumo);
      setTotal(res.total);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, q, status, sort, margemMinima, estoqueMinimo, semCusto]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const filteredRows = useMemo(() => {
    if (!lowStockOnly) return rows;
    return rows.filter((r) => (r.estoqueTotal || 0) <= 5);
  }, [rows, lowStockOnly]);

  const lucroBars = useMemo(() => {
    const top = [...rows].sort((a, b) => (b.lucroTotal || 0) - (a.lucroTotal || 0)).slice(0, 8);
    const max = Math.max(1, ...top.map((r) => Math.abs(r.lucroTotal || 0)));
    return { top, max };
  }, [rows]);

  async function ensureProdutoBySku(sku: string) {
    if (produtoCache[sku] !== undefined) return produtoCache[sku];
    try {
      const produto = await getProdutoBySku(sku);
      setProdutoCache((prev) => ({ ...prev, [sku]: produto }));
      return produto;
    } catch {
      setProdutoCache((prev) => ({ ...prev, [sku]: null }));
      return null;
    }
  }

  async function startEditarCusto(sku: string, custoAtual: number) {
    const produto = await ensureProdutoBySku(sku);
    if (!produto) {
      toast.error('Produto não encontrado. Faça o mapeamento SKU→Tiny para puxar o custo.');
      return;
    }
    setEditingSku(sku);
    setEditingValue(String(custoAtual || produto.custoReal || ''));
  }

  async function salvarCusto(sku: string) {
    const produto = await ensureProdutoBySku(sku);
    if (!produto) {
      toast.error('Produto não encontrado.');
      return;
    }
    const custoReal = Number(editingValue);
    if (!Number.isFinite(custoReal) || custoReal <= 0) {
      toast.error('Informe um custo válido.');
      return;
    }
    setSavingSku(sku);
    try {
      const updated = await patchProdutoCusto(produto.id, custoReal);
      setProdutoCache((prev) => ({ ...prev, [sku]: updated }));
      setEditingSku(null);
      setEditingValue('');
      await fetchData();
      toast.success('Custo atualizado');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingSku(null);
    }
  }

  async function salvarMapeamento(skuShopee: string, codigoTiny: string) {
    const codigo = codigoTiny.trim();
    if (!codigo) {
      toast.error('Informe o código Tiny.');
      return;
    }
    setMappingLoading((prev) => ({ ...prev, [skuShopee]: true }));
    try {
      await addMapeamentoSku({ skuShopee, codigoTiny: codigo, atualizarCusto: true });
      setMappingInput((prev) => ({ ...prev, [skuShopee]: '' }));
      await fetchData();
      toast.success('Mapeamento atualizado');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMappingLoading((prev) => ({ ...prev, [skuShopee]: false }));
    }
  }

  function renderVariacaoRow(v: AnuncioRentabilidadeVariacao) {
    const sku = v.sku || '';
    const isEditing = editingSku === sku;
    const marginClass = getMarginClasses(v.margem || 0);
    const mapped = v.codigoTiny || '';
    const mapValue = mappingInput[sku] ?? mapped;
    const canEdit = Boolean(sku);

    return (
      <tr key={v.id} className="border-t border-slate-100">
        <td className="px-3 py-2 font-mono text-xs text-slate-700">{v.sku || '-'}</td>
        <td className="px-3 py-2 text-xs text-slate-700">{v.nome || '-'}</td>
        <td className="px-3 py-2 text-xs">{v.preco == null ? '-' : formatBRL(v.preco)}</td>
        <td className="px-3 py-2 text-xs">{v.estoque ?? '-'}</td>
        <td className="px-3 py-2 text-xs">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
              />
              <button
                className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                onClick={() => salvarCusto(sku)}
                disabled={savingSku === sku}
              >
                Salvar
              </button>
              <button
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
                onClick={() => {
                  setEditingSku(null);
                  setEditingValue('');
                }}
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div>
                {v.custoUnitario > 0 ? (
                  <div className="text-slate-900">
                    {formatBRL(v.custoUnitario)} <span className="text-slate-400">(total {formatBRL(v.custoTotal)})</span>
                  </div>
                ) : (
                  <div className="text-rose-600">Custo pendente</div>
                )}
              </div>
              <button
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 disabled:opacity-60"
                disabled={!canEdit}
                onClick={() => startEditarCusto(sku, v.custoUnitario)}
              >
                Editar
              </button>
            </div>
          )}
        </td>
        <td className="px-3 py-2 text-xs">{formatBRL(v.lucro || 0)}</td>
        <td className="px-3 py-2 text-xs">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${marginClass}`}>
            {formatPct(v.margem || 0)}
          </span>
        </td>
        <td className="px-3 py-2 text-xs">
          {sku ? (
            <div className="flex items-center gap-2">
              <input
                className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                placeholder="Código Tiny"
                value={mapValue}
                onChange={(e) => setMappingInput((prev) => ({ ...prev, [sku]: e.target.value }))}
              />
              <button
                className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                onClick={() => salvarMapeamento(sku, mapValue)}
                disabled={mappingLoading[sku]}
              >
                Mapear
              </button>
            </div>
          ) : (
            '-'
          )}
        </td>
      </tr>
    );
  }

  const tabs = [
    { label: 'Todos', value: '' },
    { label: 'Ativos', value: 'ATIVO' },
    { label: 'Inativos', value: 'INATIVO' },
  ];

  return (
    <div className="grid gap-6">
      {error ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200">
          <div className="font-semibold">Falha ao carregar anúncios</div>
          <div className="mt-1 text-xs text-rose-800">{error}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="rounded-xl bg-rose-700 px-3 py-1.5 text-xs font-semibold text-white"
              onClick={() => fetchData()}
              disabled={loading}
            >
              Recarregar
            </button>
            <button
              className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-800"
              onClick={() => {
                setQ('');
                setStatus('');
                setMargemMinima('');
                setEstoqueMinimo('');
                setSemCusto(false);
                setLowStockOnly(false);
                setPage(1);
                void fetchData();
              }}
              disabled={loading}
            >
              Limpar filtros
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Total de anúncios ativos</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{resumo?.totalAnuncios ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Estoque total valorizado</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{formatBRL(resumo?.rendaTotal ?? 0)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Lucro total estimado</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{formatBRL(resumo?.lucroTotal ?? 0)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs text-slate-500">Margem média geral</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{formatPct(resumo?.margemMedia ?? 0)}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:col-span-2">
            <div className="text-xs text-slate-500">Anúncios sem custo (pendentes)</div>
            <div className="mt-2 text-2xl font-bold text-rose-600">{resumo?.semCusto ?? 0}</div>
          </div>
        </div>
        <div className="lg:col-span-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-900">Lucro total por anúncio</div>
          <div className="mt-3 grid gap-2">
            {lucroBars.top.length === 0 ? (
              <div className="text-xs text-slate-500">Sem dados.</div>
            ) : (
              lucroBars.top.map((r) => (
                <div key={r.id} className="grid gap-1">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="truncate" title={r.nome}>{r.nome}</span>
                    <span className="text-slate-900">{formatBRL(r.lucroTotal || 0)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (Math.abs(r.lucroTotal || 0) / lucroBars.max) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

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
          <div className="md:col-span-4">
            <label className="text-xs font-medium text-slate-600">Buscar anúncio (título/SKU)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={q}
              placeholder="Ex: kit, 123-ABC..."
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Margem mínima (%)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              type="number"
              min={0}
              step={0.1}
              value={margemMinima}
              onChange={(e) => {
                setPage(1);
                setMargemMinima(e.target.value === '' ? '' : Number(e.target.value));
              }}
              placeholder="Ex: 10"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Estoque mínimo</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              type="number"
              min={0}
              step={1}
              value={estoqueMinimo}
              onChange={(e) => {
                setPage(1);
                setEstoqueMinimo(e.target.value === '' ? '' : Number(e.target.value));
              }}
              placeholder="Ex: 5"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Ordenar</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={sort}
              onChange={(e) => {
                setPage(1);
                setSort(e.target.value);
              }}
            >
              <option value="lucro_desc">Lucro (maior)</option>
              <option value="lucro_asc">Lucro (menor)</option>
              <option value="margem_desc">Margem (maior)</option>
              <option value="margem_asc">Margem (menor)</option>
              <option value="estoque_desc">Estoque (maior)</option>
              <option value="estoque_asc">Estoque (menor)</option>
              <option value="renda_desc">Renda (maior)</option>
              <option value="renda_asc">Renda (menor)</option>
              <option value="nome_asc">Nome (A→Z)</option>
              <option value="nome_desc">Nome (Z→A)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-slate-600">Filtros rápidos</label>
            <div className="mt-1 flex flex-wrap gap-2">
              <button
                className={
                  (Number(margemMinima) || 0) >= 30
                    ? 'rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white'
                    : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700'
                }
                onClick={() => {
                  setPage(1);
                  setMargemMinima((prev) => ((Number(prev) || 0) >= 30 ? '' : 30));
                }}
              >
                Alta margem
              </button>
              <button
                className={
                  lowStockOnly
                    ? 'rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white'
                    : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700'
                }
                onClick={() => setLowStockOnly((prev) => !prev)}
              >
                Baixo estoque
              </button>
              <button
                className={
                  semCusto
                    ? 'rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white'
                    : 'rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700'
                }
                onClick={() => {
                  setPage(1);
                  setSemCusto((prev) => !prev);
                }}
              >
                Sem custo
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Anúncio</th>
                <th className="px-4 py-3">Variações</th>
                <th className="px-4 py-3">Preço médio</th>
                <th className="px-4 py-3">Estoque total</th>
                <th className="px-4 py-3">Custo total</th>
                <th className="px-4 py-3">Lucro estimado</th>
                <th className="px-4 py-3">Margem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    <div>Sem dados para o filtro atual.</div>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                      <button
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                        onClick={() => fetchData()}
                        disabled={loading}
                      >
                        Recarregar
                      </button>
                      <button
                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                        onClick={() => {
                          setQ('');
                          setStatus('');
                          setMargemMinima('');
                          setEstoqueMinimo('');
                          setSemCusto(false);
                          setLowStockOnly(false);
                          setPage(1);
                          void fetchData();
                        }}
                        disabled={loading}
                      >
                        Mostrar todos
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const st = normalizeStatusForUI(r.status);
                  const isOpen = !!openDetalhes[r.id];
                  return (
                    <Fragment key={r.id}>
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
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                <span className="font-mono">item {r.itemId || '-'}</span>
                                <Badge tone={st.tone}>{st.label}</Badge>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-700">{r.totalVariacoes}</td>
                        <td className="px-4 py-3">{formatBRL(r.precoMedio || 0)}</td>
                        <td className="px-4 py-3">{r.estoqueTotal}</td>
                        <td className="px-4 py-3">{formatBRL(r.custoTotal || 0)}</td>
                        <td className="px-4 py-3 font-semibold text-slate-900">{formatBRL(r.lucroTotal || 0)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs ${getMarginClasses(r.margemMedia || 0)}`}>
                            {formatPct(r.margemMedia || 0)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <button
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              onClick={() => setOpenDetalhes((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                            >
                              {isOpen ? 'Ocultar' : 'Detalhes'}
                            </button>
                            <div className="text-[11px] text-slate-400">Atualizado {fmtDateTimeBR(r.updatedAt)}</div>
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="text-xs text-slate-500">Variações do anúncio</div>
                            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                              <table className="min-w-full text-xs">
                                <thead className="bg-slate-50 text-left text-[11px] uppercase text-slate-400">
                                  <tr>
                                    <th className="px-3 py-2">SKU</th>
                                    <th className="px-3 py-2">Variação</th>
                                    <th className="px-3 py-2">Preço</th>
                                    <th className="px-3 py-2">Estoque</th>
                                    <th className="px-3 py-2">Custo</th>
                                    <th className="px-3 py-2">Lucro</th>
                                    <th className="px-3 py-2">Margem</th>
                                    <th className="px-3 py-2">SKU Shopee → Tiny</th>
                                  </tr>
                                </thead>
                                <tbody>{r.variacoes.map((v) => renderVariacaoRow(v))}</tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
