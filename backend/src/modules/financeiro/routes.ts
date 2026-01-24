// ==========================================
// MÓDULO FINANCEIRO - CONTROLLER & ROUTES
// ==========================================

import { Router, Request, Response, NextFunction } from 'express';
import { FinanceiroService } from './service';
import { logger } from '../../shared/logger';

class FinanceiroController {
  private service = new FinanceiroService();

  syncContasPagar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dataInicio, dataFim } = req.body;
      const resultado = await this.service.syncContasPagar(dataInicio, dataFim);
      res.json({ success: true, data: resultado });
    } catch (error) {
      logger.error('Erro ao sincronizar contas a pagar', { error });
      next(error);
    }
  };

  syncContasReceber = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dataInicio, dataFim } = req.body;
      const resultado = await this.service.syncContasReceber(dataInicio, dataFim);
      res.json({ success: true, data: resultado });
    } catch (error) {
      logger.error('Erro ao sincronizar contas a receber', { error });
      next(error);
    }
  };

  listarContasPagar = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const contas = await this.service.listarContasPagar();
      res.json({ success: true, data: contas });
    } catch (error) {
      next(error);
    }
  };

  listarContasReceber = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const contas = await this.service.listarContasReceber();
      res.json({ success: true, data: contas });
    } catch (error) {
      next(error);
    }
  };

  fluxoCaixa = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dataInicio, dataFim } = req.query;
      const inicio = dataInicio ? new Date(dataInicio as string) : new Date();
      const fim = dataFim ? new Date(dataFim as string) : new Date();
      
      const fluxo = await this.service.calcularFluxoCaixa(inicio, fim);
      res.json({ success: true, data: fluxo });
    } catch (error) {
      next(error);
    }
  };
}

const router = Router();
const controller = new FinanceiroController();

router.post('/contas-pagar/sync', controller.syncContasPagar);
router.post('/contas-receber/sync', controller.syncContasReceber);
router.get('/contas-pagar', controller.listarContasPagar);
router.get('/contas-receber', controller.listarContasReceber);
router.get('/fluxo-caixa', controller.fluxoCaixa);

export default router;
