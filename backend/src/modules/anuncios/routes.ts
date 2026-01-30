import { Router, Request, Response } from 'express';
import { getPrismaClient } from '../../shared/database';

const router = Router();

function parseLimit(value: unknown, def: number, max: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function parsePage(value: unknown, def: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.max(1, Math.floor(n));
}

function parseIntParam(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function parseBigIntParam(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(String(Math.floor(value)));
  if (typeof value === 'string' && value.trim()) {
    try {
      return BigInt(value.trim());
    } catch {
      return null;
    }
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeStatus(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return '';
  if (raw === 'ativo' || raw === 'active') return 'ATIVO';
  if (raw === 'inativo' || raw === 'inactive') return 'INATIVO';
  return String(value).trim();
}

router.get('/', async (req: Request, res: Response) => {
  const prisma = getPrismaClient();

  const limit = parseLimit(req.query.limit, 50, 200);

  const page = parsePage(req.query.page, 1);
  const offset = parseIntParam(req.query.offset) ?? (page - 1) * limit;

  const shopId = parseIntParam(req.query.shopId ?? req.query.shop_id);
  const status = normalizeStatus(req.query.status);
  const sku = typeof req.query.sku === 'string' ? req.query.sku.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const itemId = parseBigIntParam(req.query.itemId ?? req.query.item_id);

  const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';

  const orderBy = (() => {
    switch (sort) {
      case 'updatedAt_asc':
        return [{ updatedAt: 'asc' as const }];
      case 'price_asc':
        return [{ preco: 'asc' as const }, { updatedAt: 'desc' as const }];
      case 'price_desc':
        return [{ preco: 'desc' as const }, { updatedAt: 'desc' as const }];
      case 'stock_desc':
        return [{ estoque: 'desc' as const }, { updatedAt: 'desc' as const }];
      case 'name_asc':
        return [{ nome: 'asc' as const }, { updatedAt: 'desc' as const }];
      case 'name_desc':
        return [{ nome: 'desc' as const }, { updatedAt: 'desc' as const }];
      case 'updatedAt_desc':
      default:
        return [{ updatedAt: 'desc' as const }];
    }
  })();

  const dataInicio = parseDate(req.query.dataInicio ?? req.query.startDate);
  const dataFim = parseDate(req.query.dataFim ?? req.query.endDate);

  const where: any = {};
  if (shopId !== null) where.shopId = shopId;
  if (itemId !== null) where.itemId = itemId;
  if (status) where.status = status;
  if (dataInicio || dataFim) {
    where.updatedAt = {};
    if (dataInicio) where.updatedAt.gte = dataInicio;
    if (dataFim) where.updatedAt.lte = dataFim;
  }
  if (sku) where.sku = { contains: sku, mode: 'insensitive' };
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.anuncioCatalogo.count({ where }),
    prisma.anuncioCatalogo.findMany({
      where,
      orderBy,
      skip: Math.max(0, offset),
      take: limit,
    }),
  ]);

  const data = rows.map((r: any) => ({
    id: r.id,
    platform: r.platform,
    shopId: r.shopId,
    itemId: r.itemId ? String(r.itemId) : null,
    modelId: r.modelId ? String(r.modelId) : null,
    sku: r.sku,
    nome: r.nome,
    imageUrl: r.imageUrl ?? null,
    status: r.status,
    preco: r.preco,
    estoque: r.estoque,
    updatedAt: r.updatedAt.toISOString(),
  }));

  res.json({ success: true, total, page, limit, data });
});

export default router;
