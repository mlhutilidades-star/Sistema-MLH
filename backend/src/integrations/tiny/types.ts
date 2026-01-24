// ==========================================
// TINY ERP v3 - TIPOS TYPESCRIPT
// ==========================================

export interface TinyProduto {
  id: string;
  nome: string;
  codigo: string;
  unidade: string;
  preco: number;
  preco_custo?: number;
  ncm?: string;
  origem?: string;
  gtin?: string;
  tipoVariacao?: string;
  localizacao?: string;
  pesoBruto?: number;
  pesoLiquido?: number;
  estoque?: number;
  estoqueMinimo?: number;
  estoqueMaximo?: number;
  idProdutoPai?: string;
  classe_ipi?: string;
  valor_ipi?: number;
  descricao_complementar?: string;
  garantia?: string;
  cest?: string;
  obs?: string;
  situacao?: string;
}

export interface TinyProdutoResponse {
  retorno: {
    status_processamento: number;
    status: string;
    pagina?: number;
    numero_paginas?: number;
    produtos?: Array<{ produto: TinyProduto }>;
    produto?: TinyProduto;
  };
}

export interface TinyContaPagar {
  id: string;
  data_vencimento: string;
  data_emissao: string;
  historico: string;
  categoria: string;
  portador: string;
  fornecedor: {
    nome: string;
    codigo?: string;
  };
  valor: number;
  saldo: number;
  situacao: string; // aberto, pago, vencido
  numero_documento?: string;
  nf_empenho?: string;
}

export interface TinyContaPagarResponse {
  retorno: {
    status_processamento: number;
    status: string;
    pagina?: number;
    numero_paginas?: number;
    contas?: Array<{ conta: TinyContaPagar }>;
  };
}

export interface TinyContaReceber {
  id: string;
  data_vencimento: string;
  data_emissao: string;
  historico: string;
  categoria: string;
  portador: string;
  cliente: {
    nome: string;
    codigo?: string;
  };
  valor: number;
  saldo: number;
  situacao: string; // aberto, recebido, vencido
  numero_documento?: string;
  id_vendas?: string;
}

export interface TinyContaReceberResponse {
  retorno: {
    status_processamento: number;
    status: string;
    pagina?: number;
    numero_paginas?: number;
    contas?: Array<{ conta: TinyContaReceber }>;
  };
}

export interface TinyEstoque {
  produto: {
    id: string;
    codigo: string;
  };
  estoque: number;
  saldo_fisico?: number;
  saldo_reservado?: number;
  saldo_pedido?: number;
}

export interface TinyEstoqueResponse {
  retorno: {
    status_processamento: number;
    status: string;
    produto?: TinyEstoque;
  };
}

export interface TinyError {
  retorno: {
    status_processamento: number;
    status: string;
    codigo_erro?: number;
    erros?: Array<{
      erro: string;
    }>;
  };
}
