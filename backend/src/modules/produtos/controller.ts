// ==========================================
// MÓDULO PRODUTOS - CONTROLLER
// ==========================================

import { Request, Response, NextFunction } from 'express';
import { ProdutoService } from './service';
import { logger } from '../../shared/logger';

export class ProdutoController {
  private service: ProdutoService;

  constructor() {
    this.service = new ProdutoService();
  }

  /**
   * Listar produtos
   */
  listar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ativo, sku, descricao } = req.query;

      const filtros: any = {};
      
      if (ativo !== undefined) {
        filtros.ativo = ativo === 'true';
      }

      if (sku) {
        filtros.sku = sku as string;
      }

      if (descricao) {
        filtros.descricao = descricao as string;
      }

      const produtos = await this.service.listarProdutos(filtros);

      res.json({
        success: true,
        data: produtos,
        total: produtos.length,
      });
    } catch (error) {
      logger.error('Erro ao listar produtos', { error });
      next(error);
    }
  };

  /**
   * Obter produto por ID
   */
  obter = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const produto = await this.service.obterProduto(id);

      if (!produto) {
        return res.status(404).json({
          success: false,
          error: 'Produto não encontrado',
        });
      }

      return res.json({
        success: true,
        data: produto,
      });
    } catch (error) {
      logger.error('Erro ao obter produto', { error });
      next(error);
    }
  };

  /**
   * Obter produto por SKU
   */
  obterPorSku = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sku } = req.params;

      const produto = await this.service.obterProdutoPorSku(sku);

      if (!produto) {
        return res.status(404).json({
          success: false,
          error: 'Produto não encontrado',
        });
      }

      return res.json({
        success: true,
        data: produto,
      });
    } catch (error) {
      logger.error('Erro ao obter produto por SKU', { error });
      next(error);
    }
  };

  /**
   * Sincronizar produtos do Tiny
   */
  syncTiny = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      logger.info('Iniciando sincronização de produtos do Tiny');
      
      const resultado = await this.service.syncProdutosTiny();

      return res.json({
        success: true,
        message: 'Sincronização concluída',
        data: resultado,
      });
    } catch (error) {
      logger.error('Erro ao sincronizar produtos do Tiny', { error });
      next(error);
    }
  };

  /**
   * Sincronizar produtos do Shopee
   */
  syncShopee = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { accessToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({
          success: false,
          error: 'accessToken é obrigatório',
        });
      }

      logger.info('Iniciando sincronização de produtos do Shopee');
      
      const service = new ProdutoService(accessToken);
      const resultado = await service.syncProdutosShopee();

      return res.json({
        success: true,
        message: 'Sincronização concluída',
        data: resultado,
      });
    } catch (error) {
      logger.error('Erro ao sincronizar produtos do Shopee', { error });
      next(error);
    }
  };

  /**
   * Atualizar custo real
   */
  atualizarCusto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { custoReal } = req.body;

      if (!custoReal || custoReal <= 0) {
        return res.status(400).json({
          success: false,
          error: 'custoReal deve ser um número positivo',
        });
      }

      const produto = await this.service.atualizarCustoReal(id, custoReal);

      return res.json({
        success: true,
        message: 'Custo atualizado',
        data: produto,
      });
    } catch (error) {
      logger.error('Erro ao atualizar custo', { error });
      next(error);
    }
  };
}
