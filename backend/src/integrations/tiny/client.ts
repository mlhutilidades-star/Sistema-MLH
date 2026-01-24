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

export class TinyClient {
  private client: AxiosInstance;
  private lastRequestTime: number = 0;
  private requestCount: number = 0;
  private readonly minRequestInterval = 600; // 600ms entre requests (~100 req/min)

  constructor() {
    this.client = axios.create({
      baseURL: config.tiny.baseUrl,
      timeout: config.tiny.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Interceptor para rate limiting
    this.client.interceptors.request.use(async (config) => {
      await this.enforceRateLimit();
      const startTime = Date.now();
      (config as any).startTime = startTime;
      
      loggers.api.request(config.method?.toUpperCase() || 'GET', config.url || '', config.params);
      return config;
    });

    // Interceptor para logging de respostas
    this.client.interceptors.response.use(
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
  }

  private buildAuthHeaders(): Record<string, string> {
    if (!config.tiny.apiKey) return {};
    return { Authorization: `Bearer ${config.tiny.apiKey}` };
  }

  private async getWithTinyAuth<T>(path: string, params: Record<string, any>): Promise<T> {
    try {
      const { data } = await this.client.get<T>(path, {
        params,
        headers: this.buildAuthHeaders(),
      });
      return data;
    } catch (error) {
      // Fallback: alguns ambientes do Tiny aceitam o token como parâmetro (token=...).
      if (axios.isAxiosError(error) && error.response?.status === 403 && config.tiny.apiKey) {
        const { data } = await this.client.get<T>(path, {
          params: { ...params, token: config.tiny.apiKey },
        });
        return data;
      }
      throw error;
    }
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

      if (response.retorno.status_processamento !== 3) {
        throw new Error(response.retorno.status || 'Erro desconhecido ao buscar produtos');
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

      if (response.retorno.status_processamento !== 3) {
        throw new Error(response.retorno.status || 'Erro desconhecido ao obter produto');
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

      if (response.retorno.status_processamento !== 3) {
        throw new Error(response.retorno.status || 'Erro desconhecido ao buscar estoque');
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
      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyContaPagarResponse>('/contas.pagar.busca', {
            dataInicio,
            dataFim,
            pagina,
            formato: 'json',
          });
        },
        config.tiny.maxRetries
      );

      if (response.retorno.status_processamento !== 3) {
        throw new Error(response.retorno.status || 'Erro desconhecido ao buscar contas a pagar');
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
      const response = await retryWithBackoff(
        async () => {
          return await this.getWithTinyAuth<TinyContaReceberResponse>('/contas.receber.busca', {
            dataInicio,
            dataFim,
            pagina,
            formato: 'json',
          });
        },
        config.tiny.maxRetries
      );

      if (response.retorno.status_processamento !== 3) {
        throw new Error(response.retorno.status || 'Erro desconhecido ao buscar contas a receber');
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
}
