import { Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../../shared/database';
import { logger } from '../../shared/logger';
import { TinyClient } from '../../integrations/tiny/client';

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

function parseDaysParam(req: Request, fallback: number): number {
  const raw = req.query.days;
  const n = typeof raw === 'string' ? Number(raw) : fallback;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 365) : fallback;
}

export class MapeamentoController {
  private prisma = getPrismaClient();
  private tiny = new TinyClient();

  pendentes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const days = parseDaysParam(req, 30);
      const start = new Date();
      start.setDate(start.getDate() - days);

      const sold = await this.prisma.pedidoItem.findMany({
        where: { pedido: { data: { gte: start } } },
        distinct: ['sku'],
        select: { sku: true, descricao: true },
      });

      const soldSkus = sold.map((s) => s.sku);

      const produtos = soldSkus.length
        ? await this.prisma.produto.findMany({
            where: { sku: { in: soldSkus } },
            select: { sku: true, descricao: true, custoReal: true, custoStatus: true, custoAtualizadoEm: true },
          })
        : [];

      const produtoBySku = new Map(produtos.map((p) => [p.sku, p] as const));

      const pendentes = soldSkus
        .map((sku) => {
          const p = produtoBySku.get(sku);
          const custoReal = Number(p?.custoReal ?? 0) || 0;
          const custoStatus = String(p?.custoStatus ?? 'PENDENTE_SYNC');
          const descricao = p?.descricao || sold.find((x) => x.sku === sku)?.descricao || sku;
          const isPendente = !p || custoReal <= 0 || custoStatus === 'PENDENTE_SYNC';
          return isPendente
            ? {
                sku,
                descricao,
                custoReal,
                custoStatus,
                custoAtualizadoEm: p?.custoAtualizadoEm || null,
              }
            : null;
        })
        .filter(Boolean) as Array<{ sku: string; descricao: string; custoReal: number; custoStatus: string; custoAtualizadoEm: Date | null }>;

      const mappings = pendentes.length
        ? await this.prisma.mapeamentoSKU.findMany({
            where: { skuShopee: { in: pendentes.map((p) => p.sku) } },
            select: { skuShopee: true, codigoTiny: true, criadoEm: true },
          })
        : [];

      const mappingBySku = new Map(mappings.map((m) => [m.skuShopee, m] as const));

      res.json({
        success: true,
        days,
        soldSkus: soldSkus.length,
        pendentes: pendentes.map((p) => ({
          ...p,
          mapping: mappingBySku.get(p.sku) || null,
        })),
      });
    } catch (error) {
      logger.error('Erro ao listar SKUs pendentes de mapeamento', { error });
      next(error);
    }
  };

  adicionar = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const skuShopee = String(req.body?.skuShopee || '').trim();
      const codigoTiny = String(req.body?.codigoTiny || '').trim();
      const atualizarCusto = Boolean(req.body?.atualizarCusto ?? true);

      if (!skuShopee || !codigoTiny) {
        return res.status(400).json({
          success: false,
          error: 'Informe skuShopee e codigoTiny',
        });
      }

      const mapping = await this.prisma.mapeamentoSKU.upsert({
        where: { skuShopee },
        create: { skuShopee, codigoTiny },
        update: { codigoTiny },
      });

      let custoAtualizado: number | null = null;
      if (atualizarCusto) {
        const custo = await this.tiny.buscarCustoPorSkuComFallbacks(codigoTiny);
        if (typeof custo === 'number' && Number.isFinite(custo) && custo > 0) {
          custoAtualizado = custo;

          const existente = await this.prisma.produto.findUnique({
            where: { sku: skuShopee },
            select: { descricao: true },
          });

          await this.prisma.produto.upsert({
            where: { sku: skuShopee },
            create: {
              sku: skuShopee,
              descricao: existente?.descricao || skuShopee,
              custoReal: custo,
              custoStatus: 'OK',
              custoAtualizadoEm: new Date(),
              ativo: true,
            },
            update: {
              custoReal: custo,
              custoStatus: 'OK',
              custoAtualizadoEm: new Date(),
              ativo: true,
            },
          });
        }
      }

      return res.json({
        success: true,
        data: { mapping, custoAtualizado },
      });
    } catch (error) {
      logger.error('Erro ao adicionar mapeamento SKU', { error });
      next(error);
    }
  };

  buscarTiny = async (req: Request, res: Response, next: NextFunction) => {
    try {
      requireAdmin(req);

      const q = String(req.query?.q || '').trim();
      if (!q) {
        return res.status(400).json({ success: false, error: 'Informe q' });
      }

      const results = await this.tiny.pesquisarProdutosPorTexto(q);
      return res.json({ success: true, q, total: results.length, data: results });
    } catch (error) {
      logger.error('Erro ao buscar produtos no Tiny', { error });
      next(error);
    }
  };
}
