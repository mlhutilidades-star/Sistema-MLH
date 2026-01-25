// ==========================================
// TINY ERP v3 - CLIENT
// ==========================================

import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../shared/config';
import { logger, loggers } from '../../shared/logger';
import { retryWithBackoff, sleep } from '../../shared/utils';
import type {
  TinyProdutoResponse,
  TinyContaPagarResponse,
  TinyContaReceberResponse,
  TinyEstoqueResponse,
  TinyError,
} from './types';

class TinyRateLimitError extends Error {
  name = 'TinyRateLimitError';
}

export class TinyClient {
  private client: AxiosInstance;
  private clientApi2: AxiosInstance;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly minRequestInterval = 600; // 600ms entre requests (~100 req/min)

  constructor() {
    this.client = this.createInstrumentedClient(config.tiny.baseUrl, {
      defaultHeaders: { 'Content-Type': 'application/json' },
    });

    this.clientApi2 = this.createInstrumentedClient(this.deriveApi2BaseUrl(config.tiny.baseUrl), {
      defaultHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  private createInstrumentedClient(
    baseURL: string,
    opts?: { defaultHeaders?: Record<string, string> }
  ): AxiosInstance {
    const instance = axios.create({
      baseURL,
      timeout: config.tiny.timeout,
      headers: opts?.defaultHeaders,
    });

    // Interceptor para rate limiting
    instance.interceptors.request.use(async (req) => {
      await this.enforceRateLimit();
      const startTime = Date.now();
      (req as any).startTime = startTime;

      loggers.api.request(req.method?.toUpperCase() || 'GET', req.url || '', req.params);
      return req;
    });

    // Interceptor para logging de respostas
    instance.interceptors.response.use(
      (response) => {
        const duration = Date.now() - (response.config as any).startTime;
        loggers.api.response(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          duration
        );
        return response;
      },
      (error: AxiosError) => {
        if (error.config) {
          loggers.api.error(
            error.config.method?.toUpperCase() || 'GET',
            error.config.url || '',
            error
          );
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }

  private deriveApi2BaseUrl(baseUrl: string): string {
    // Muitos tokens em produção são do Tiny API2 (legacy).
    // Se o ambiente estiver configurado como /api/v3, tentamos automaticamente /api2.
    const normalized = baseUrl.replace(/\/+$/, '');
    if (normalized.endsWith('/api/v3')) {
      return normalized.replace(/\/api\/v3$/, '/api2');
    }
    if (normalized.endsWith('/api2')) return normalized;
    // Fallback: mantém a base, mas permite override via TINY_BASE_URL.
    return normalized;
  }

  private isLegacyApi2Endpoint(path: string): boolean {
    // Endpoints do Tiny API2 tipicamente têm formato "produto.obter", "produtos.pesquisa", etc.
    return path.includes('.');
  }

  private buildAuthHeaders(): Record<string, string> {
    if (!config.tiny.apiKey) return {};
    return { Authorization: `Bearer ${config.tiny.apiKey}` };
  }

  private toFormUrlEncoded(payload: Record<string, any>): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined || value === null) continue;
      params.append(key, String(value));
    }
    return params.toString();
  }

  private async postApi2<T>(endpoint: string, params: Record<string, any>): Promise<T> {
    if (!config.tiny.apiKey) {
      throw new Error('TINY_API_KEY não configurada');
    }

    // API2 usa POST form-urlencoded e o token no body.
    const endpointName = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
    const url = `/${endpointName}.php`;
    const body = this.toFormUrlEncoded({
      token: config.tiny.apiKey,
      ...params,
    });

    const { data } = await this.clientApi2.post<T>(url, body, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return data;
  }

  private async getWithTinyAuth<T>(path: string, params: Record<string, any>): Promise<T> {
    try {
      // Se for um endpoint legacy, usa API2 automaticamente.
      if (this.isLegacyApi2Endpoint(path)) {
        return await this.postApi2<T>(path, params);
      }

      const { data } = await this.client.get<T>(path, {
        params,
        headers: this.buildAuthHeaders(),
      });
      return data;
    } catch (error) {
      // Fallback: alguns ambientes do Tiny aceitam o token como parâmetro (token=...).
      if (axios.isAxiosError(error) && error.response?.status === 403 && config.tiny.apiKey) {
        // 1) tenta repetir como API2 (POST) se parecer endpoint legacy
        if (this.isLegacyApi2Endpoint(path)) {
          return await this.postApi2<T>(path, params);
        }

        // 2) fallback final: token como query param
        const { data } = await this.client.get<T>(path, {
          params: { ...params, token: config.tiny.apiKey },
        });
        return data;
      }
      throw error;
    }
  }

  private isTinySuccess(retorno: any): boolean {
    if (!retorno) return false;
    const statusProc = retorno.status_processamento;
    if (typeof statusProc === 'number') {
      // API v3 costuma usar 3 = OK
      return statusProc === 3;
    }

    // API2 costuma usar apenas status textual
    const status = String(retorno.status || '').trim().toUpperCase();
    return status === 'OK';
  }

  private formatTinyDate(date: Date): string {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  private resolveTinyDateRange(dataInicio?: string, dataFim?: string): { ini: string; fim: string } {
    // Tiny API2 normalmente usa dd/mm/aaaa.
    // Se não houver período explícito, usa últimos 30 dias.
    const end = dataFim ? new Date(dataFim) : new Date();
    const start = dataInicio ? new Date(dataInicio) : new Date(end.getTime());
    if (!dataInicio) start.setDate(start.getDate() - 30);

    return {
      ini: this.formatTinyDate(start),
      fim: this.formatTinyDate(end),
    };
  }

  private tinyStatusMessage(retorno: any): string {
    if (!retorno) return 'Erro desconhecido';
    const toText = (v: any): string => {
      if (v === undefined || v === null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    };

    const statusText = toText(retorno.status);

    const mensagens = Array.isArray(retorno.mensagens)
      ? retorno.mensagens.map((m: any) => toText(m?.mensagem)).filter(Boolean)
      : [];

    const erros = Array.isArray(retorno.erros)
      ? retorno.erros.map((e: any) => toText(e?.erro)).filter(Boolean)
      : [];

    return mensagens[0] || erros[0] || statusText || 'Erro desconhecido';
  }

  private isTinyRateLimitedMessage(message: string): boolean {
    const m = String(message || '').toLowerCase();
    return (
      m.includes('api bloqueada') ||
      m.includes('excedido o número de acessos') ||
      m.includes('excedido o numero de acessos') ||
      m.includes('rate limit') ||
      m.includes('too many requests')
    );
  }

  private buildSkuCandidates(sku: string): string[] {
    const raw = String(sku || '').trim();
    if (!raw) return [];

    const candidates: string[] = [];
    const add = (v: string | undefined | null) => {
      const s = String(v || '').trim();
      if (!s) return;
      if (!candidates.includes(s)) candidates.push(s);
    };

    add(raw);

    // Prefixo numérico (muito comum como código base do Tiny)
    const mNum = raw.match(/^(\d{6,})/);
    if (mNum?.[1]) add(mNum[1]);

    // Parte antes do primeiro espaço (remove descrições de variação)
    if (raw.includes(' ')) add(raw.split(' ')[0]);

    // Parte antes do primeiro '-' (remove sufixos de variação)
    if (raw.includes('-')) add(raw.split('-')[0]);

    // Se começar com número e tiver '-', pega só o número (reforça)
    const mNumDash = raw.match(/^(\d{6,})-/);
    if (mNumDash?.[1]) add(mNumDash[1]);

    // Limitar para evitar explosão de chamadas
    return candidates.slice(0, 4);
  }

  /**
   * Enforçar rate limiting (100 req/min)
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await sleep(waitTime);
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  /**
   * Tratar erros da API Tiny
   */
  private handleTinyError(error: any): never {
    if (axios.isAxiosError(error)) {
      const tinyError = error.response?.data as TinyError | undefined;
      
      if (tinyError?.retorno?.erros) {
        const errorMessages = tinyError.retorno.erros.map((e) => e.erro).join(', ');
        throw new Error(`Tiny API Error: ${errorMessages}`);
      }

      if (tinyError?.retorno?.mensagens?.length) {
        const msgs = tinyError.retorno.mensagens.map((m) => m.mensagem).join(', ');
        throw new Error(`Tiny API Error: ${msgs}`);
      }
      
      throw new Error(`Tiny API Error: ${error.message}`);
    }
    
    throw error;
  }

  /**
   * Buscar produtos com paginação
   */
  async buscarProdutos(pagina: number = 1): Promise<TinyProdutoResponse> {
    try {
      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyProdutoResponse>('/produtos.pesquisa', {
            pagina,
            formato: 'json',
          });
        },
        config.tiny.maxRetries
      );

      if (!this.isTinySuccess(response.retorno)) {
        throw new Error(this.tinyStatusMessage(response.retorno));
      }

      return response;
    } catch (error) {
      this.handleTinyError(error);
    }
  }

  /**
   * Obter detalhes de um produto por ID
   */
  async obterProduto(id: string): Promise<TinyProdutoResponse> {
    try {
      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyProdutoResponse>('/produto.obter', {
            id,
            formato: 'json',
          });
        },
        config.tiny.maxRetries
      );

      if (!this.isTinySuccess(response.retorno)) {
        throw new Error(this.tinyStatusMessage(response.retorno));
      }

      return response;
    } catch (error) {
      this.handleTinyError(error);
    }
  }

  /**
   * Buscar estoque de um produto
   */
  async buscarEstoque(idProduto: string): Promise<TinyEstoqueResponse> {
    try {
      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyEstoqueResponse>('/estoque.busca', {
            id: idProduto,
            formato: 'json',
          });
        },
        config.tiny.maxRetries
      );

      if (!this.isTinySuccess(response.retorno)) {
        throw new Error(this.tinyStatusMessage(response.retorno));
      }

      return response;
    } catch (error) {
      this.handleTinyError(error);
    }
  }

  /**
   * Buscar contas a pagar
   */
  async buscarContasPagar(dataInicio?: string, dataFim?: string, pagina: number = 1): Promise<TinyContaPagarResponse> {
    try {
      const { ini, fim } = this.resolveTinyDateRange(dataInicio, dataFim);

      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyContaPagarResponse>('/contas.pagar.pesquisa', {
            data_ini_vencimento: ini,
            data_fim_vencimento: fim,
            pagina,
            formato: 'json',
          });
        },
        config.tiny.maxRetries
      );

      if (!this.isTinySuccess(response.retorno)) {
        throw new Error(this.tinyStatusMessage(response.retorno));
      }

      return response;
    } catch (error) {
      this.handleTinyError(error);
    }
  }

  /**
   * Buscar contas a receber
   */
  async buscarContasReceber(dataInicio?: string, dataFim?: string, pagina: number = 1): Promise<TinyContaReceberResponse> {
    try {
      const { ini, fim } = this.resolveTinyDateRange(dataInicio, dataFim);

      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyContaReceberResponse>('/contas.receber.pesquisa', {
            data_ini_vencimento: ini,
            data_fim_vencimento: fim,
            pagina,
            formato: 'json',
          });
        },
        config.tiny.maxRetries
      );

      if (!this.isTinySuccess(response.retorno)) {
        throw new Error(this.tinyStatusMessage(response.retorno));
      }

      return response;
    } catch (error) {
      this.handleTinyError(error);
    }
  }

  /**
   * Buscar todos os produtos (todas as páginas)
   */
  async buscarTodosProdutos(): Promise<TinyProdutoResponse[]> {
    const results: TinyProdutoResponse[] = [];
    let pagina = 1;
    let hasMorePages = true;

    logger.info('Iniciando busca de todos os produtos do Tiny');

    while (hasMorePages) {
      const response = await this.buscarProdutos(pagina);
      results.push(response);

      const numeroPaginas = response.retorno.numero_paginas || 1;
      hasMorePages = pagina < numeroPaginas;
      pagina++;

      logger.debug(`Página ${pagina - 1}/${numeroPaginas} buscada`);
    }

    logger.info(`Total de ${results.length} páginas de produtos buscadas`);
    return results;
  }

  /**
   * Buscar custo (preço de custo) por SKU/código no Tiny.
   *
   * Observação: como a integração usa endpoints legacy (API2) para `*.pesquisa`,
   * este método funciona mesmo quando `TINY_BASE_URL` está em /api/v3.
   */
  async buscarCustoPorSKU(sku: string): Promise<number | null> {
    const codigo = String(sku || '').trim();
    if (!codigo) return null;

    try {
      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyProdutoResponse>('/produtos.pesquisa', {
            pagina: 1,
            formato: 'json',
            pesquisa: codigo,
          });
        },
        config.tiny.maxRetries
      );

      if (!this.isTinySuccess(response.retorno)) {
        const msg = this.tinyStatusMessage(response.retorno);
        // "A consulta não retornou registros" é um caso esperado (SKU não cadastrado / sem retorno)
        if (String(msg).toLowerCase().includes('não retornou registros') || String(msg).toLowerCase().includes('nao retornou registros')) {
          return null;
        }
        // "API Bloqueada" / rate limit deve ser tratado como falha transitória
        if (this.isTinyRateLimitedMessage(msg)) {
          throw new TinyRateLimitError(msg);
        }
        throw new Error(msg);
      }

      const produtos = response.retorno.produtos || [];
      const encontrado = produtos
        .map((p) => p.produto)
        .find((p) => String(p.codigo || '').trim().toLowerCase() === codigo.toLowerCase());

      const produto = encontrado || produtos[0]?.produto;
      if (!produto) return null;

      const custoMedio = typeof (produto as any).custo_medio === 'number' ? Number((produto as any).custo_medio) : NaN;
      const precoCusto = typeof produto.preco_custo === 'number' ? Number(produto.preco_custo) : NaN;
      const custo = Number.isFinite(custoMedio) && custoMedio > 0 ? custoMedio : Number.isFinite(precoCusto) && precoCusto > 0 ? precoCusto : null;
      return custo;
    } catch (error) {
      // Blindagem: tratar 403/429 e mensagens de bloqueio como erro específico.
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 403 || status === 429) {
          throw new TinyRateLimitError(`Tiny API bloqueada/rate limited (HTTP ${status})`);
        }
      }
      const msg = String((error as any)?.message || error);
      if (this.isTinyRateLimitedMessage(msg)) {
        throw new TinyRateLimitError(msg);
      }
      this.handleTinyError(error);
    }
  }

  /**
   * Busca custo com fallbacks de SKU (útil quando o SKU do marketplace tem variações/sufixos).
   */
  async buscarCustoPorSkuComFallbacks(sku: string): Promise<number | null> {
    const candidates = this.buildSkuCandidates(sku);
    for (const c of candidates) {
      const custo = await this.buscarCustoPorSKU(c);
      if (typeof custo === 'number' && Number.isFinite(custo) && custo > 0) return custo;
    }
    return null;
  }

  /**
   * Buscar custos em lote (sequencial) para evitar bloqueio da API.
   * Prioriza custo_medio e usa preco_custo como fallback (via buscarCustoPorSKU).
   */
  async buscarCustosPorSKUs(skus: string[]): Promise<Map<string, number>> {
    const custos = new Map<string, number>();
    const uniqueSkus = Array.from(new Set((skus || []).map((s) => String(s || '').trim()).filter(Boolean)));

    // Cache por candidato para evitar reconsultar o mesmo código base (ex: prefixo numérico)
    const cacheByCandidate = new Map<string, number | null>();

    for (const sku of uniqueSkus) {
      // Delay padrão para respeitar rate limit (~100 req/min)
      await sleep(600);

      let attempts = 0;
      while (attempts < 3) {
        attempts++;
        try {
          const candidates = this.buildSkuCandidates(sku);
          let custo: number | null = null;

          for (const c of candidates) {
            if (cacheByCandidate.has(c)) {
              custo = cacheByCandidate.get(c) ?? null;
            } else {
              custo = await this.buscarCustoPorSKU(c);
              cacheByCandidate.set(c, custo);
            }
            if (typeof custo === 'number' && Number.isFinite(custo) && custo > 0) break;
          }

          if (typeof custo === 'number' && Number.isFinite(custo) && custo > 0) {
            custos.set(sku, custo);
          }
          break;
        } catch (e: any) {
          const msg = String(e?.message || e);
          const isRate = e?.name === 'TinyRateLimitError' || this.isTinyRateLimitedMessage(msg);
          logger.warn(`Tiny: SKU ${sku} - ${msg}`);
          if (!isRate) {
            // Erro não-transitório: não insiste.
            break;
          }
          // Erro transitório (bloqueio/rate limit): espera mais e tenta novamente.
          await sleep(3000 * attempts);
        }
      }
    }

    return custos;
  }
}
