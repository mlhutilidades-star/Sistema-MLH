import { Router, Request, Response, NextFunction } from 'express';
import { getPrismaClient } from '../../shared/database';

const router = Router();
const prisma = getPrismaClient();

function parseDateRangeOrThrow(dataInicioStr: string, dataFimStr: string): { inicio: Date; fim: Date } {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

  const inicio = isDateOnly(dataInicioStr) ? new Date(`${dataInicioStr}T00:00:00.000Z`) : new Date(dataInicioStr);
  const fim = isDateOnly(dataFimStr) ? new Date(`${dataFimStr}T23:59:59.999Z`) : new Date(dataFimStr);

  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fim.getTime())) {
    throw new Error('dataInicio/dataFim inválidos. Use YYYY-MM-DD ou ISO.');
  }

  return { inicio, fim };
}

// GET /api/pedidos?dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&limit=200
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dataInicioStr = typeof req.query.dataInicio === 'string' ? req.query.dataInicio : '';
    const dataFimStr = typeof req.query.dataFim === 'string' ? req.query.dataFim : '';

    if (!dataInicioStr || !dataFimStr) {
      return res.status(400).json({ success: false, error: 'Informe dataInicio e dataFim (YYYY-MM-DD ou ISO).' });
    }

    const { inicio, fim } = parseDateRangeOrThrow(dataInicioStr, dataFimStr);

    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 200;
    const limit = Math.max(1, Math.min(1000, Number.isFinite(limitRaw) ? limitRaw : 200));

    const pedidos = await prisma.pedido.findMany({
      where: { data: { gte: inicio, lte: fim } },
      orderBy: { data: 'desc' },
      take: limit,
      select: {
        pedidoId: true,
        data: true,
        cliente: true,
        rendaLiquida: true,
        custoProdutos: true,
        lucro: true,
        margem: true,
        itens: {
          select: {
            sku: true,
            descricao: true,
            quantidade: true,
            rendaLiquida: true,
            custoTotal: true,
            lucro: true,
          },
          orderBy: { sku: 'asc' },
        },
      },
    });

    return res.json({
      success: true,
      total: pedidos.length,
      data: pedidos.map((p) => ({
        ...p,
        data: p.data.toISOString(),
        itens: p.itens.map((i) => ({
          ...i,
          rendaLiquida: Number(i.rendaLiquida || 0),
          custoTotal: Number(i.custoTotal || 0),
          lucro: Number(i.lucro || 0),
        })),
        rendaLiquida: Number(p.rendaLiquida || 0),
        custoProdutos: Number(p.custoProdutos || 0),
        lucro: Number(p.lucro || 0),
        margem: Number(p.margem || 0),
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
