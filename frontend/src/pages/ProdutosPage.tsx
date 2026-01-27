import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge } from '../components/Badge';
import { FileDropzone } from '../components/FileDropzone';
import { fmtDateBR } from '../utils/dates';
import { formatBRL, formatPct } from '../utils/format';
import { listProdutos, patchProdutoCusto, previewPlanilha, uploadPlanilha, type Produto } from '../services/endpoints';

function marginFromPreco(precoVenda: number | null, custo: number): number | null {
  const pv = Number(precoVenda || 0);
  if (!pv || pv <= 0) return null;
  return ((pv - custo) / pv) * 100;
}

function statusFromMargin(m: number | null): { label: string; tone: 'green' | 'yellow' | 'red' | 'slate' } {
  if (m === null) return { label: 'SEM PREÇO', tone: 'slate' };
  if (m > 25) return { label: 'SAUDÁVEL', tone: 'green' };
  if (m >= 15) return { label: 'MÉDIO', tone: 'yellow' };
  return { label: 'CRÍTICO', tone: 'red' };
}

export function ProdutosPage() {
  const [loading, setLoading] = useState(false);
  const [sku, setSku] = useState('');
  const [descricao, setDescricao] = useState('');
  const [produtos, setProdutos] = useState<Produto[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');

  const [planilha, setPlanilha] = useState<File | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listProdutos({ ativo: true, sku: sku.trim() || undefined, descricao: descricao.trim() || undefined });
      setProdutos(res.data);
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

  const rows = useMemo(() => {
    return produtos.map((p) => {
      const custo = Number(p.custoReal) || 0;
      const margem = marginFromPreco(p.precoVenda, custo);
      const status = statusFromMargin(margem);
      return { p, custo, margem, status };
    });
  }, [produtos]);

  async function startEdit(p: Produto) {
    setEditingId(p.id);
    setEditingValue(String(p.custoReal ?? ''));
  }

  async function saveEdit(p: Produto) {
    const raw = editingValue.trim().replace(',', '.');
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error('Informe um custo válido (> 0)');
      return;
    }

    try {
      const updated = await patchProdutoCusto(p.id, num);
      setProdutos((prev) => prev.map((x) => (x.id === p.id ? updated : x)));
      toast.success('Custo atualizado');
      setEditingId(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onDropFile(file: File) {
    setPlanilha(file);
    setPreview(null);
    try {
      const pv = await previewPlanilha(file);
      setPreview(pv);
      toast.success('Preview gerado');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doUpload() {
    if (!planilha) return;
    setUploading(true);
    try {
      const res = await uploadPlanilha(planilha);
      toast.success(res?.mensagem || 'Planilha processada');
      setPlanilha(null);
      setPreview(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-3 md:grid-cols-3 md:items-end">
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">SKU</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Buscar SKU" />
          </div>
          <div className="grid gap-1">
            <label className="text-xs font-medium text-slate-600">Descrição</label>
            <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Buscar descrição" />
          </div>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" onClick={() => void refresh()}>
            Filtrar
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Custo atual</th>
                <th className="px-4 py-3">Preço venda</th>
                <th className="px-4 py-3">Margem</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Atualizado</th>
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
                    Sem produtos.
                  </td>
                </tr>
              ) : (
                rows.map(({ p, custo, margem, status }) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
                    <td className="px-4 py-3 text-slate-700">{p.descricao}</td>
                    <td className="px-4 py-3">
                      {editingId === p.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveEdit(p);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            autoFocus
                          />
                          <button className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white" onClick={() => void saveEdit(p)}>
                            Salvar
                          </button>
                          <button className="rounded-lg px-2 py-1 text-xs text-slate-700 hover:bg-slate-100" onClick={() => setEditingId(null)}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button className="rounded-lg px-2 py-1 font-medium hover:bg-slate-100" onClick={() => void startEdit(p)} title="Clique para editar">
                          {formatBRL(custo)}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">{p.precoVenda ? formatBRL(p.precoVenda) : '-'}</td>
                    <td className="px-4 py-3">{margem === null ? '-' : formatPct(margem)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmtDateBR(p.atualizadoEm)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-sm font-semibold">Upload planilha Tiny (custos)</div>
          <div className="mt-1 text-xs text-slate-600">Formatos: .csv, .xlsx, .xls</div>
          <div className="mt-4">
            <FileDropzone
              accept={".csv,.xlsx,.xls"}
              helper="O upload exige x-admin-secret (configure em Config)."
              onFile={(f) => void onDropFile(f)}
            />
          </div>

          {planilha ? (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <div className="font-medium">Arquivo:</div>
              <div className="mt-1 text-xs text-slate-700">{planilha.name}</div>
            </div>
          ) : null}

          {preview ? (
            <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Preview</div>
              <div className="mt-1 text-sm">
                Válidos: <b>{preview.validos}</b> · Rejeitados: <b>{preview.rejeitados}</b> · Total: <b>{preview.totalLinhas}</b>
              </div>
              <button
                className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                disabled={uploading}
                onClick={() => void doUpload()}
              >
                {uploading ? 'Enviando…' : 'Processar e atualizar custos'}
              </button>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl bg-slate-900 p-4 text-white shadow-sm">
          <div className="text-sm font-semibold">Status visual (margem)</div>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-white/10 p-3">
              <span>🟢 Saudável</span>
              <span className="text-slate-200">&gt; 25%</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 p-3">
              <span>🟡 Médio</span>
              <span className="text-slate-200">15–25%</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 p-3">
              <span>🔴 Crítico</span>
              <span className="text-slate-200">&lt; 15%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
