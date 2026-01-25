import { Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../../shared/database';
import type { Anuncio, Pedido } from '@prisma/client';

export class RelatoriosController {
  private prisma = getPrismaClient();

  margem = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pedidos = await this.prisma.pedido.findMany({
        orderBy: { data: 'desc' },
        take: 200,
        select: {
          pedidoId: true,
          data: true,
          rendaLiquida: true,
          custoProdutos: true,
          lucro: true,
          margem: true,
        },
      });

      res.json(
        pedidos.map((p: { pedidoId: string; data: Date; rendaLiquida: number; custoProdutos: number; lucro: number; margem: number }) => ({
          pedidoId: p.pedidoId,
          data: p.data,
          renda: p.rendaLiquida,
          custo: p.custoProdutos,
          lucro: p.lucro,
          margemPorcentagem: p.margem,
        }))
      );
    } catch (error) {
      next(error);
    }
  };

  lucroPedidos = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const pedidos = await this.prisma.pedido.findMany({
        orderBy: { data: 'desc' },
        take: 200,
      });

      const totalRenda = (pedidos as Pedido[]).reduce((sum: number, p: Pedido) => sum + (p.rendaLiquida || 0), 0);
      const totalCusto = (pedidos as Pedido[]).reduce((sum: number, p: Pedido) => sum + (p.custoProdutos || 0), 0);
      const totalLucro = (pedidos as Pedido[]).reduce((sum: number, p: Pedido) => sum + (p.lucro || 0), 0);

      res.json({
        totalRenda,
        totalCusto,
        totalLucro,
        pedidos: (pedidos as Pedido[]).map((p: Pedido) => ({
          id: p.pedidoId,
          data: p.data,
          cliente: p.cliente,
          renda: p.rendaLiquida,
          custo: p.custoProdutos,
          lucro: p.lucro,
          margem: p.margem,
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  lucroProdutos = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const groups = await this.prisma.pedidoItem.groupBy({
        by: ['sku'],
        _sum: { rendaLiquida: true, custoTotal: true, lucro: true },
        orderBy: { _sum: { lucro: 'desc' } },
        take: 200,
      });

      const skus = groups.map((g) => g.sku);
      const produtos = await this.prisma.produto.findMany({
        where: { sku: { in: skus } },
        select: { sku: true, descricao: true },
      });
      const descBySku = new Map(produtos.map((p) => [p.sku, p.descricao] as const));

      res.json(
        groups.map((g: any) => {
          const renda = g._sum.rendaLiquida || 0;
          const custo = g._sum.custoTotal || 0;
          const lucro = g._sum.lucro || 0;
          const margem = renda > 0 ? (lucro / renda) * 100 : 0;
          return {
            sku: g.sku,
            descricao: descBySku.get(g.sku) || null,
            renda,
            custo,
            lucro,
            margemPorcentagem: margem,
          };
        })
      );
    } catch (error) {
      next(error);
    }
  };

  lucroAnuncios = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const anuncios = await this.prisma.anuncio.findMany({
        orderBy: { data: 'desc' },
        take: 60,
      });

      const totalGasto = (anuncios as Anuncio[]).reduce((sum: number, a: Anuncio) => sum + (a.gasto || 0), 0);
      const totalRenda = (anuncios as Anuncio[]).reduce((sum: number, a: Anuncio) => sum + (a.rendaGerada || 0), 0);
      const totalLucro = (anuncios as Anuncio[]).reduce((sum: number, a: Anuncio) => sum + (a.lucro || 0), 0);

      res.json({
        totalGasto,
        totalRenda,
        totalLucro,
        anuncios: (anuncios as Anuncio[]).map((a: Anuncio) => ({
          campanhaId: a.campanhaId,
          data: a.data,
          gasto: a.gasto,
          renda: a.rendaGerada,
          custoProdutos: a.custoProdutos,
          lucro: a.lucro,
          roi: a.roi,
        })),
      });
    } catch (error) {
      next(error);
    }
  };
}
