// ==========================================
// MÓDULO ADS - CONTROLLER & ROUTES
// ==========================================

import { Router, Request, Response, NextFunction } from 'express';
import { AdsService } from './service';
import { logger } from '../../shared/logger';

function requireAdmin(req: Request): void {
  const secret = process.env.OAUTH_ADMIN_SECRET;
  if (!secret) {
    throw new Error('OAUTH_ADMIN_SECRET não configurado');
  }

  const provided = req.header('x-admin-secret');
  if (!provided || provided !== secret) {
    throw new Error('Acesso negado');
  }
}

class AdsController {
  syncAds = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { accessToken, startDate, endDate } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate e endDate são obrigatórios',
        });
      }

      let token = accessToken as string | undefined;
      // Se não vier token no body, permitir apenas via admin-secret usando o token do servidor.
      if (!token) {
        requireAdmin(req);
        token = process.env.SHOPEE_ACCESS_TOKEN;
      }

      if (!token) {
        return res.status(400).json({
          success: false,
          error: 'accessToken ausente (ou configure SHOPEE_ACCESS_TOKEN no servidor)',
        });
      }

      const service = new AdsService(token);
      const resultado = await service.syncAdsShopee(startDate, endDate);

      return res.json({ success: true, data: resultado });
    } catch (error) {
      logger.error('Erro ao sincronizar ads', { error });
      next(error);
    }
  };

  ratearCustos = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dataInicio, dataFim } = req.body;
      const service = new AdsService();
      const resultado = await service.ratearCustosAds(
        new Date(dataInicio),
        new Date(dataFim)
      );

      res.json({ success: true, data: resultado });
    } catch (error) {
      logger.error('Erro ao ratear custos', { error });
      next(error);
    }
  };

  relatorio = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { dataInicio, dataFim } = req.query;
      const service = new AdsService();
      const relatorio = await service.relatorioPerformance(
        new Date(dataInicio as string),
        new Date(dataFim as string)
      );

      res.json({ success: true, data: relatorio });
    } catch (error) {
      next(error);
    }
  };
}

const router = Router();
const controller = new AdsController();

router.post('/sync', controller.syncAds);
router.post('/ratear-custos', controller.ratearCustos);
router.get('/relatorio', controller.relatorio);

export default router;
