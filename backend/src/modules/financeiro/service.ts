// ==========================================
// MÓDULO FINANCEIRO - SERVICE
// ==========================================

import { getPrismaClient } from '../../shared/database';
import { loggers } from '../../shared/logger';
import { TinyClient } from '../../integrations/tiny/client';

export class FinanceiroService {
  private prisma = getPrismaClient();
  private tinyClient = new TinyClient();

  /**
   * Sincronizar contas a pagar do Tiny
   */
  async syncContasPagar(dataInicio?: string, dataFim?: string) {
    const startTime = Date.now();
    let total = 0;
    let criados = 0;
    let atualizados = 0;

    try {
      loggers.sync.start('CONTAS_PAGAR', 'TINY');

      const response = await this.tinyClient.buscarContasPagar(dataInicio, dataFim);

      if (response.retorno.contas) {
        for (const { conta } of response.retorno.contas) {
          total++;

          const status = conta.situacao === 'pago' ? 'PAGO' : 
                        new Date(conta.data_vencimento) < new Date() ? 'VENCIDO' : 'PENDENTE';

          const result = await this.prisma.contaPagar.upsert({
            where: { idTiny: conta.id },
            create: {
              vencimento: new Date(conta.data_vencimento),
              descricao: conta.historico,
              fornecedor: conta.fornecedor.nome,
              categoria: conta.categoria,
              valor: conta.valor,
              status,
              idTiny: conta.id,
            },
            update: {
              vencimento: new Date(conta.data_vencimento),
              descricao: conta.historico,
              fornecedor: conta.fornecedor.nome,
              categoria: conta.categoria,
              valor: conta.valor,
              status,
              atualizadoEm: new Date(),
            },
          });

          if (result.criadoEm.getTime() === result.atualizadoEm.getTime()) {
            criados++;
          } else {
            atualizados++;
          }
        }
      }

      const duracaoMs = Date.now() - startTime;
      loggers.sync.success('CONTAS_PAGAR', 'TINY', total, duracaoMs);

      await this.prisma.logSync.create({
        data: {
          tipo: 'FINANCEIRO',
          status: 'SUCESSO',
          origem: 'TINY',
          mensagem: `Contas a pagar: ${criados} criadas, ${atualizados} atualizadas`,
          registros: total,
          duracaoMs,
        },
      });

      return { total, criados, atualizados };
    } catch (error) {
      loggers.sync.error('CONTAS_PAGAR', 'TINY', error as Error);
      throw error;
    }
  }

  /**
   * Sincronizar contas a receber do Tiny
   */
  async syncContasReceber(dataInicio?: string, dataFim?: string) {
    const startTime = Date.now();
    let total = 0;
    let criados = 0;
    let atualizados = 0;

    try {
      loggers.sync.start('CONTAS_RECEBER', 'TINY');

      const response = await this.tinyClient.buscarContasReceber(dataInicio, dataFim);

      if (response.retorno.contas) {
        for (const { conta } of response.retorno.contas) {
          total++;

          const status = conta.situacao === 'recebido' ? 'RECEBIDO' : 'PENDENTE';
          const liquido = conta.valor; // Será ajustado com custos de ads depois

          const result = await this.prisma.contaReceber.upsert({
            where: { idTiny: conta.id },
            create: {
              previsao: new Date(conta.data_vencimento),
              cliente: conta.cliente.nome,
              categoria: conta.categoria,
              valorBruto: conta.valor,
              liquido,
              status,
              idTiny: conta.id,
            },
            update: {
              previsao: new Date(conta.data_vencimento),
              cliente: conta.cliente.nome,
              categoria: conta.categoria,
              valorBruto: conta.valor,
              liquido,
              status,
              atualizadoEm: new Date(),
            },
          });

          if (result.criadoEm.getTime() === result.atualizadoEm.getTime()) {
            criados++;
          } else {
            atualizados++;
          }
        }
      }

      const duracaoMs = Date.now() - startTime;
      loggers.sync.success('CONTAS_RECEBER', 'TINY', total, duracaoMs);

      await this.prisma.logSync.create({
        data: {
          tipo: 'FINANCEIRO',
          status: 'SUCESSO',
          origem: 'TINY',
          mensagem: `Contas a receber: ${criados} criadas, ${atualizados} atualizadas`,
          registros: total,
          duracaoMs,
        },
      });

      return { total, criados, atualizados };
    } catch (error) {
      loggers.sync.error('CONTAS_RECEBER', 'TINY', error as Error);
      throw error;
    }
  }

  /**
   * Listar contas a pagar
   */
  async listarContasPagar(filtros?: { status?: string; dataInicio?: Date; dataFim?: Date }) {
    const where: any = {};

    if (filtros?.status) {
      where.status = filtros.status;
    }

    if (filtros?.dataInicio || filtros?.dataFim) {
      where.vencimento = {};
      if (filtros.dataInicio) where.vencimento.gte = filtros.dataInicio;
      if (filtros.dataFim) where.vencimento.lte = filtros.dataFim;
    }

    return this.prisma.contaPagar.findMany({
      where,
      orderBy: { vencimento: 'asc' },
    });
  }

  /**
   * Listar contas a receber
   */
  async listarContasReceber(filtros?: { status?: string; dataInicio?: Date; dataFim?: Date }) {
    const where: any = {};

    if (filtros?.status) {
      where.status = filtros.status;
    }

    if (filtros?.dataInicio || filtros?.dataFim) {
      where.previsao = {};
      if (filtros.dataInicio) where.previsao.gte = filtros.dataInicio;
      if (filtros.dataFim) where.previsao.lte = filtros.dataFim;
    }

    return this.prisma.contaReceber.findMany({
      where,
      orderBy: { previsao: 'asc' },
    });
  }

  /**
   * Calcular fluxo de caixa
   */
  async calcularFluxoCaixa(dataInicio: Date, dataFim: Date) {
    const contasPagar = await this.listarContasPagar({ dataInicio, dataFim });
    const contasReceber = await this.listarContasReceber({ dataInicio, dataFim });

    const totalPagar = contasPagar.reduce((sum, c) => sum + c.valor, 0);
    const totalReceber = contasReceber.reduce((sum, c) => sum + c.valorBruto, 0);
    const totalLiquido = contasReceber.reduce((sum, c) => sum + c.liquido, 0);

    return {
      periodo: { inicio: dataInicio, fim: dataFim },
      pagar: { total: totalPagar, quantidade: contasPagar.length },
      receber: { bruto: totalReceber, liquido: totalLiquido, quantidade: contasReceber.length },
      saldo: totalLiquido - totalPagar,
    };
  }
}
