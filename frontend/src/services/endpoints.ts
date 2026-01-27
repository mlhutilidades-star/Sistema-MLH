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

export async function listPedidos(params: { dataInicio: string; dataFim: string; limit?: number }) {
  const res = await api.get<PedidosListResponse>('/api/pedidos', { params });
  return res.data;
}
