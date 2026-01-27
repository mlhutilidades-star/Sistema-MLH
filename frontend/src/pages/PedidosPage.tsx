import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  useReactTable,
} from '@tanstack/react-table';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { daysAgoISODate, fmtDateBR, todayISODate } from '../utils/dates';
import { formatBRL, formatPct } from '../utils/format';
import { getProdutoBySku, listPedidos, patchProdutoCusto, type Pedido } from '../services/endpoints';

type EditSkuCost = { sku: string; descricao: string | null; quantidade: number; custoAtual: number; custoNovo: number };

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const headers = Object.keys(rows[0] || {});
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    const needs = /[\n\r,\"]/g.test(s);
    const escaped = s.replace(/"/g, '""');
    return needs ? `"${escaped}"` : escaped;
  };

  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape((r as any)[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PedidosPage() {
  const [dataInicio, setDataInicio] = useState(daysAgoISODate(29));
  const [dataFim, setDataFim] = useState(todayISODate());
  const [minRenda, setMinRenda] = useState('');
  const [onlyCritico, setOnlyCritico] = useState(false);

  const [loading, setLoading] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editPedidoId, setEditPedidoId] = useState<string | null>(null);
  const [editRows, setEditRows] = useState<EditSkuCost[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    async function run() {
      setLoading(true);
      try {
        const res = await listPedidos({ dataInicio, dataFim, limit: 500 });
        if (!alive) return;
        setPedidos(res.data);
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

  const filtered = useMemo(() => {
    const min = minRenda.trim() ? Number(minRenda.replace(',', '.')) : null;
    return pedidos.filter((p) => {
      if (min !== null && Number.isFinite(min) && p.rendaLiquida < min) return false;
      if (onlyCritico && p.margem >= 15) return false;
      return true;
    });
  }, [minRenda, onlyCritico, pedidos]);

  const columns = useMemo<ColumnDef<Pedido>[]>(
    () => [
      {
        header: 'Data',
        accessorFn: (row) => row.data,
        cell: (ctx) => <span className="whitespace-nowrap">{fmtDateBR(ctx.getValue() as string)}</span>,
      },
      {
        header: 'Cliente',
        accessorFn: (row) => row.cliente || '-',
        cell: (ctx) => <span className="text-slate-700">{ctx.getValue() as string}</span>,
      },
      {
        header: 'SKUs',
        accessorFn: (row) => row.itens,
        cell: (ctx) => {
          const itens = ctx.getValue() as Pedido['itens'];
          const skus = itens.map((i) => i.sku);
          return (
            <div className="flex flex-wrap gap-1">
              {skus.slice(0, 4).map((sku) => (
                <span key={sku} className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                  {sku}
                </span>
              ))}
              {skus.length > 4 ? <span className="text-xs text-slate-500">+{skus.length - 4}</span> : null}
            </div>
          );
        },
      },
      {
        header: 'Renda',
        accessorFn: (row) => row.rendaLiquida,
        cell: (ctx) => <span className="font-medium">{formatBRL(Number(ctx.getValue()))}</span>,
      },
      {
        header: 'Custo',
        accessorFn: (row) => row.custoProdutos,
        cell: (ctx) => {
          const value = Number(ctx.getValue());
          const pedido = ctx.row.original;
          return (
            <button
              className="rounded-lg px-2 py-1 text-left font-medium hover:bg-slate-100"
              onClick={() => void openEdit(pedido)}
              title="Editar custos dos SKUs deste pedido"
            >
              {formatBRL(value)}
            </button>
          );
        },
      },
      {
        header: 'Lucro',
        accessorFn: (row) => row.lucro,
        cell: (ctx) => <span className={`font-semibold ${Number(ctx.getValue()) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatBRL(Number(ctx.getValue()))}</span>,
      },
      {
        header: 'Margem',
        accessorFn: (row) => row.margem,
        cell: (ctx) => {
          const m = Number(ctx.getValue());
          const tone = m > 25 ? 'green' : m >= 15 ? 'yellow' : 'red';
          return <Badge tone={tone}>{formatPct(m)}</Badge>;
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {},
  });

  async function openEdit(pedido: Pedido) {
    try {
      setEditPedidoId(pedido.pedidoId);
      setEditOpen(true);
      setEditRows([]);

      const unique = Array.from(
        pedido.itens.reduce((acc, i) => {
          acc.set(i.sku, i);
          return acc;
        }, new Map<string, Pedido['itens'][number]>()),
      ).map(([, i]) => i);

      const produtos = await Promise.all(
        unique.map(async (i) => {
          const p = await getProdutoBySku(i.sku);
          const custoAtual = Number(p.custoReal) || 0;
          return {
            sku: i.sku,
            descricao: i.descricao,
            quantidade: i.quantidade,
            custoAtual,
            custoNovo: custoAtual,
          } satisfies EditSkuCost;
        }),
      );

      setEditRows(produtos);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function recomputePedidoWithCosts(pedido: Pedido, skuToCost: Map<string, number>): Pedido {
    const custoProdutos = pedido.itens.reduce((sum, i) => sum + (skuToCost.get(i.sku) ?? 0) * i.quantidade, 0);
    const lucro = pedido.rendaLiquida - custoProdutos;
    const margem = pedido.rendaLiquida > 0 ? (lucro / pedido.rendaLiquida) * 100 : 0;
    return { ...pedido, custoProdutos, lucro, margem };
  }

  async function saveEdits() {
    if (!editPedidoId) return;

    setSaving(true);
    try {
      // Atualiza Produto.custoReal por SKU
      for (const row of editRows) {
        if (!Number.isFinite(row.custoNovo) || row.custoNovo <= 0) {
          throw new Error(`Custo inválido para ${row.sku}`);
        }
        if (row.custoNovo === row.custoAtual) continue;

        const produto = await getProdutoBySku(row.sku);
        await patchProdutoCusto(produto.id, row.custoNovo);
      }

      // Atualiza a tabela local (recalcula custo/lucro/margem no frontend)
      const skuToCost = new Map(editRows.map((r) => [r.sku, r.custoNovo] as const));
      setPedidos((prev) => prev.map((p) => (p.pedidoId === editPedidoId ? recomputePedidoWithCosts(p, skuToCost) : p)));

      toast.success('Custos atualizados. (Lucro/margem recalculados na tela)');
      setEditOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function exportExcel() {
    if (filtered.length === 0) {
      toast('Sem dados para exportar');
      return;
    }

    const rows = filtered.map((p) => ({
      pedidoId: p.pedidoId,
      data: p.data,
      cliente: p.cliente || '',
      skus: p.itens.map((i) => i.sku).join(' | '),
      rendaLiquida: p.rendaLiquida,
      custoProdutos: p.custoProdutos,
      lucro: p.lucro,
      margemPct: p.margem,
    }));

    downloadCsv(`pedidos_${dataInicio}_a_${dataFim}.csv`, rows);
  }

  return (
    <div className="grid gap-4">
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
            <label className="text-xs font-medium text-slate-600">Valor mínimo (renda)</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ex: 50" value={minRenda} onChange={(e) => setMinRenda(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyCritico} onChange={(e) => setOnlyCritico(e.target.checked)} />
            Margem crítica (&lt; 15%)
          </label>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" onClick={exportExcel}>
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((h) => (
                    <th key={h.id} className="px-4 py-3">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                    Carregando…
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                    Sem pedidos no filtro.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={editOpen}
        title="Editar custos (por SKU)"
        description={editPedidoId ? `Pedido: ${editPedidoId} — salve para atualizar custos dos produtos (Tiny).` : undefined}
        onClose={() => !saving && setEditOpen(false)}
      >
        <div className="grid gap-3">
          <div className="text-sm text-slate-600">
            Dica: isso atualiza <span className="font-mono">Produto.custoReal</span>. O lucro/margem aqui é recalculado na tela.
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3">Qtd</th>
                  <th className="py-2 pr-3">Custo atual</th>
                  <th className="py-2 pr-3">Novo custo</th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((r) => (
                  <tr key={r.sku} className="border-t border-slate-100">
                    <td className="py-2 pr-3 font-mono text-xs">{r.sku}</td>
                    <td className="py-2 pr-3">{r.quantidade}</td>
                    <td className="py-2 pr-3">{formatBRL(r.custoAtual)}</td>
                    <td className="py-2 pr-3">
                      <input
                        className="w-32 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                        value={String(r.custoNovo)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(',', '.');
                          const num = Number(raw);
                          setEditRows((prev) => prev.map((x) => (x.sku === r.sku ? { ...x, custoNovo: num } : x)));
                        }}
                      />
                    </td>
                  </tr>
                ))}
                {editRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500">
                      Carregando SKUs…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </button>
            <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60" onClick={() => void saveEdits()} disabled={saving || editRows.length === 0}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
