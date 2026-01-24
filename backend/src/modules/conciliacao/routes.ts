// ==========================================
// MÓDULO CONCILIAÇÃO - SERVICE & ROUTES
// ==========================================

import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../../shared/database';
import { fuzzyMatch } from '../../shared/utils';

class ConciliacaoService {
  private prisma = getPrismaClient();

  /**
   * Processar extrato bancário com regras de categorização
   */
  async processarExtrato() {
    const extratos = await this.prisma.extratoBanco.findMany({
      where: { conciliado: false },
    });

    const regras = await this.prisma.regraConciliacao.findMany({
      where: { ativo: true },
      orderBy: { prioridade: 'desc' },
    });

    let processados = 0;

    for (const extrato of extratos) {
      for (const regra of regras) {
        const regex = new RegExp(regra.padrao, 'i');
        
        if (regex.test(extrato.descricao)) {
          await this.prisma.extratoBanco.update({
            where: { id: extrato.id },
            data: {
              categoria: regra.categoria,
              conciliado: true,
            },
          });
          processados++;
          break;
        }
      }
    }

    return { processados };
  }

  /**
   * Conciliar extrato com contas
   */
  async conciliarContas() {
    const extratos = await this.prisma.extratoBanco.findMany({
      where: { conciliado: false },
    });

    let conciliados = 0;

    for (const extrato of extratos) {
      // Buscar conta a pagar similar
      if (extrato.valor < 0) {
        const contas = await this.prisma.contaPagar.findMany({
          where: {
            valor: Math.abs(extrato.valor),
            status: 'PENDENTE',
          },
        });

        for (const conta of contas) {
          const similarity = fuzzyMatch(extrato.descricao, conta.descricao);
          
          if (similarity > 70) {
            await this.prisma.extratoBanco.update({
              where: { id: extrato.id },
              data: {
                contaPagarId: conta.id,
                conciliado: true,
              },
            });

            await this.prisma.contaPagar.update({
              where: { id: conta.id },
              data: { status: 'PAGO' },
            });

            conciliados++;
            break;
          }
        }
      }
      // Buscar conta a receber similar
      else if (extrato.valor > 0) {
        const contas = await this.prisma.contaReceber.findMany({
          where: {
            valorBruto: extrato.valor,
            status: 'PENDENTE',
          },
        });

        for (const conta of contas) {
          const similarity = fuzzyMatch(extrato.descricao, conta.cliente);
          
          if (similarity > 70) {
            await this.prisma.extratoBanco.update({
              where: { id: extrato.id },
              data: {
                contaReceberId: conta.id,
                conciliado: true,
              },
            });

            await this.prisma.contaReceber.update({
              where: { id: conta.id },
              data: { status: 'RECEBIDO' },
            });

            conciliados++;
            break;
          }
        }
      }
    }

    return { conciliados };
  }
}

class ConciliacaoController {
  private service = new ConciliacaoService();

  processar = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await this.service.processarExtrato();
      res.json({ success: true, data: resultado });
    } catch (error) {
      next(error);
    }
  };

  conciliar = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const resultado = await this.service.conciliarContas();
      res.json({ success: true, data: resultado });
    } catch (error) {
      next(error);
    }
  };
}

const router = Router();
const controller = new ConciliacaoController();

router.post('/processar', controller.processar);
router.post('/conciliar', controller.conciliar);

export default router;
