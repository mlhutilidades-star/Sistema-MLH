import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../../shared/database';

const router = Router();

function parseLimit(value: unknown, def: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

router.get('/', async (req: Request, res: Response) => {
  const prisma = getPrismaClient();

  const limit = parseLimit(req.query.limit, 50, 200);
  const dataInicio = parseDate(req.query.dataInicio ?? req.query.startDate);
  const dataFim = parseDate(req.query.dataFim ?? req.query.endDate);

  const where: any = {};
  if (dataInicio || dataFim) {
    where.data = {};
    if (dataInicio) where.data.gte = dataInicio;
    if (dataFim) where.data.lte = dataFim;
  }

  const [total, data] = await Promise.all([
    prisma.anuncio.count({ where }),
    prisma.anuncio.findMany({
      where,
      orderBy: [{ data: 'desc' }, { gasto: 'desc' }],
      take: limit,
    }),
  ]);

  res.json({ success: true, total, data });
});

export default router;
