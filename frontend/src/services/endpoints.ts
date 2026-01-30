import { api } from './api';

export type LucroTotalResponse = {
  periodo: { inicio: string; fim: string };
  faturamentoBruto: number;
  taxasShopee: number;
  rendaLiquida: number;
  custoProdutos: number;
  gastoAds: number;
  lucroRealFinal: number;
  margemMedia: number;
};

export type TopLucroItem = {
  sku: string;
  descricao: string | null;
  quantidade: number;
  renda: number;
  custo: number;
  lucro: number;
  margemPorcentagem: number;
  status: 'CRITICO' | 'SAUDAVEL' | 'EXCELENTE';
};

export type TopLucroResponse = {
  limit: number;
  dataInicio: string | null;
  dataFim: string | null;
  data: TopLucroItem[];
};

export type AdsRelatorioDetalhe = {
  id: string;
  data: string;
  campanhaId: string;
  campanhaNome: string | null;
  impressoes: number;
  cliques: number;
  gasto: number;
  pedidos: number;
  gmv: number;
  roas?: number | null;
  ctr?: number | null;
  cpc?: number | null;
};

export type AdsRelatorioResponse = {
  periodo: { inicio: string; fim: string };
  totais: { impressoes: number; cliques: number; gasto: number; pedidos: number; gmv: number };
  metricas: { ctrMedio: number; cpcMedio: number; roasTotal: number };
  pedidosNoPeriodo: { rendaLiquida: number; custoProdutos: number; lucro: number };
  ganhoRealFinal: number;
  roiRealFinal: number;
  detalhes: AdsRelatorioDetalhe[];
};

export type Produto = {
  id: string;
  sku: string;
  descricao: string;
  custoReal: number;
  custoStatus: string;
  custoAtualizadoEm: string | null;
  precoVenda: number | null;
  ativo: boolean;
  atualizadoEm: string;
};

export type ProdutosListResponse = {
  success: true;
  data: Produto[];
  total: number;
};

export type PedidoItem = {
  sku: string;
  descricao: string | null;
  quantidade: number;
  rendaLiquida: number;
  custoTotal: number;
  lucro: number;
};

export type Pedido = {
  pedidoId: string;
  data: string;
  cliente: string | null;
  rendaLiquida: number;
  custoProdutos: number;
  lucro: number;
  margem: number;
  itens: PedidoItem[];
};

export type PedidosListResponse = {
  success: true;
  data: Pedido[];
  total: number;
};

type LucroPedidosLegacyResponse = {
  totalRenda: number;
  totalCusto: number;
  totalLucro: number;
  pedidos: Array<{
    id: string;
    data: string;
    cliente: string | null;
    renda: number;
    custo: number;
    lucro: number;
    margem: number;
  }>;
};

export async function getLucroTotal(params: { dataInicio: string; dataFim: string }) {
  const res = await api.get<{ success: true } & LucroTotalResponse>('/api/relatorios/lucro-total', { params });
  return res.data;
}

export async function getTopLucro(params: { dataInicio?: string; dataFim?: string; limit?: number }) {
  const res = await api.get<{ success: true } & TopLucroResponse>('/api/relatorios/top-lucro', { params });
  return res.data;
}

export async function getAdsRelatorio(params: { dataInicio: string; dataFim: string }) {
  const res = await api.get<{ success: true; data: AdsRelatorioResponse }>('/api/ads/relatorio', { params });
  return res.data.data;
}

export type AdsStatusResponse = {
  available: boolean;
  lastStatus: string | null;
  lastMessage: string | null;
  lastAt: string | null;
};

export async function getAdsStatus() {
  const res = await api.get('/api/ads/status', {
    headers: {
      Accept: 'application/json',
    },
  });

  const body: any = res.data;
  if (!body || typeof body !== 'object' || body.success !== true || !body.data || typeof body.data !== 'object') {
    throw new Error('Resposta inválida de /api/ads/status. Verifique a Base URL da API em /config.');
  }

  return body.data as AdsStatusResponse;
}

export type AnuncioCatalogo = {
  id: string;
  platform: string;
  shopId: number;
  itemId: string | null;
  modelId: string | null;
  sku: string | null;
  nome: string;
  imageUrl?: string | null;
  status: string;
  preco: number | null;
  estoque: number | null;
  variacoes?: Array<{
    id: string;
    modelId: string | null;
    sku: string | null;
    nome: string | null;
    preco: number | null;
    estoque: number | null;
  }>;
  updatedAt: string;
};

export type AnunciosCatalogoListResponse = {
  success: true;
  total: number;
  page: number;
  limit: number;
  data: AnuncioCatalogo[];
};

export async function listAnunciosCatalogo(params?: {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  sku?: string;
  shopId?: number;
  sort?: string;
  includeVariacoes?: boolean;
}) {
  const res = await api.get('/api/anuncios', {
    params: {
      includeVariacoes: true,
      ...(params || {}),
    },
    headers: {
      Accept: 'application/json',
    },
  });

  const body: any = res.data;
  if (!body || typeof body !== 'object' || body.success !== true || !Array.isArray(body.data)) {
    throw new Error('Resposta inválida de /api/anuncios. Verifique a Base URL da API em /config.');
  }

  return body as AnunciosCatalogoListResponse;
}

export async function listProdutos(params?: { ativo?: boolean; sku?: string; descricao?: string }) {
  const res = await api.get<ProdutosListResponse>('/api/produtos', { params });
  return res.data;
}

export async function getProdutoBySku(sku: string) {
  const res = await api.get<{ success: true; data: Produto }>(`/api/produtos/sku/${encodeURIComponent(sku)}`);
  return res.data.data;
}

export async function patchProdutoCusto(id: string, custoReal: number) {
  const res = await api.patch<{ success: true; data: Produto }>(`/api/produtos/${encodeURIComponent(id)}/custo`, {
    custoReal,
  });
  return res.data.data;
}

export async function previewPlanilha(file: File) {
  const form = new FormData();
  form.append('planilha', file);
  const res = await api.post('/api/produtos/preview-planilha', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function uploadPlanilha(file: File) {
  const form = new FormData();
  form.append('planilha', file);
  const res = await api.post('/api/produtos/upload-planilha', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export type OtimizacaoRow = {
  sku: string;
  vendas: {
    quantidade: number;
    rendaLiquida: number;
    custoProdutos: number;
    lucro: number;
    margemAtualPct: number;
  };
  precos: {
    precoMedioVenda: number | null;
    receitaLiquidaUnit: number | null;
    custoUnitario: number | null;
    ratioLiquidoPorBruto: number | null;
  };
  meta: { margemPct: number };
  sugestao: {
    precoSugerido: number | null;
    deltaPct: number | null;
    impactoEsperado: string | null;
  };
  competencia: { status: string; motivo?: string };
  elasticidade:
    | {
        estimativa: number;
        r2: number;
        n: number;
        interpretacao: string;
      }
    | { status: string; motivo?: string };
};

export type OtimizacaoPrecosResponse = {
  success: true;
  periodo: { inicio: string; fim: string };
  metaMargemPct: number;
  totalSkus: number;
  data: OtimizacaoRow[];
  observacoes?: string[];
};

export async function getOtimizacaoPrecos(params: {
  dataInicio: string;
  dataFim: string;
  metaMargemPct?: number;
  limit?: number;
}) {
  const res = await api.get<OtimizacaoPrecosResponse>('/api/otimizacao/precos', { params });
  return res.data;
}

export async function patchProdutoPreco(id: string, precoVenda: number) {
  const res = await api.patch<{ success: true; data: Produto }>(
    `/api/produtos/${encodeURIComponent(id)}/preco-venda`,
    { precoVenda },
  );
  return res.data.data;
}

export async function listPedidos(params: { dataInicio: string; dataFim: string; limit?: number }) {
  try {
    const res = await api.get<PedidosListResponse>('/api/pedidos', { params });
    return res.data;
  } catch (e) {
    // Fallback para backends antigos (antes de /api/pedidos existir)
    const status = (e as any)?.cause?.response?.status;
    if (status !== 404) throw e;

    const legacy = await api.get<LucroPedidosLegacyResponse>('/api/relatorios/lucro-pedidos');
    const inicio = new Date(`${params.dataInicio}T00:00:00.000Z`).getTime();
    const fim = new Date(`${params.dataFim}T23:59:59.999Z`).getTime();

    const pedidos = legacy.data.pedidos
      .filter((p) => {
        const t = new Date(p.data).getTime();
        return Number.isFinite(t) && t >= inicio && t <= fim;
      })
      .slice(0, params.limit ?? 200)
      .map((p) => ({
        pedidoId: p.id,
        data: p.data,
        cliente: p.cliente,
        rendaLiquida: Number(p.renda || 0),
        custoProdutos: Number(p.custo || 0),
        lucro: Number(p.lucro || 0),
        margem: Number(p.margem || 0),
        itens: [],
      } satisfies Pedido));

    return { success: true, total: pedidos.length, data: pedidos };
  }
}
