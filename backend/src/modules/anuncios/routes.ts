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
  const includeVariacoesRaw = typeof req.query.includeVariacoes === 'string' ? req.query.includeVariacoes.trim().toLowerCase() : '';
  const includeVariacoes = includeVariacoesRaw === '1' || includeVariacoesRaw === 'true' || includeVariacoesRaw === 'yes';

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
      include: includeVariacoes
        ? {
            variacoes: {
              orderBy: [{ modelId: 'asc' as const }],
            },
          }
        : undefined,
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
    variacoes: includeVariacoes
      ? (r.variacoes || []).map((v: any) => ({
          id: v.id,
          modelId: v.modelId ? String(v.modelId) : null,
          sku: v.sku ?? null,
          nome: v.nome ?? null,
          preco: v.preco ?? null,
          estoque: v.estoque ?? null,
        }))
      : undefined,
    updatedAt: r.updatedAt.toISOString(),
  }));

  res.json({ success: true, total, page, limit, data });
});

router.get('/:id/detalhes', async (req: Request, res: Response) => {
  const prisma = getPrismaClient();
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ success: false, error: 'id inválido' });

  const daysRaw = typeof req.query.days === 'string' ? Number(req.query.days) : NaN;
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(3650, Math.floor(daysRaw)) : 30;

  const now = new Date();
  const start = new Date(now.getTime() - days * 86400 * 1000);

  const anuncio = await prisma.anuncioCatalogo.findUnique({
    where: { id },
    include: {
      variacoes: { orderBy: [{ modelId: 'asc' as const }] },
    },
  });

  if (!anuncio) return res.status(404).json({ success: false, error: 'Anúncio não encontrado' });

  const skuParent = anuncio.sku ? String(anuncio.sku).trim() : '';
  const skuVariacoes = (anuncio.variacoes || [])
    .map((v) => String(v.sku || '').trim())
    .filter(Boolean);

  const skus = Array.from(new Set([skuParent, ...skuVariacoes].filter(Boolean)));

  const items = skus.length
    ? await prisma.pedidoItem.findMany({
        where: {
          sku: { in: skus },
          pedido: {
            data: { gte: start, lte: now },
          },
        },
        select: {
          pedidoId: true,
          sku: true,
          quantidade: true,
          rendaLiquida: true,
          custoTotal: true,
          lucro: true,
        },
      })
    : [];

  const aggBySku = new Map<
    string,
    {
      sku: string;
      pedidos: Set<string>;
      quantidade: number;
      rendaLiquida: number;
      custoTotal: number;
      lucro: number;
    }
  >();

  for (const it of items) {
    const sku = String(it.sku || '').trim();
    if (!sku) continue;

    const cur =
      aggBySku.get(sku) ||
      {
        sku,
        pedidos: new Set<string>(),
        quantidade: 0,
        rendaLiquida: 0,
        custoTotal: 0,
        lucro: 0,
      };

    cur.pedidos.add(String(it.pedidoId));
    cur.quantidade += Number(it.quantidade ?? 0) || 0;
    cur.rendaLiquida += Number(it.rendaLiquida ?? 0) || 0;
    cur.custoTotal += Number(it.custoTotal ?? 0) || 0;
    cur.lucro += Number(it.lucro ?? 0) || 0;
    aggBySku.set(sku, cur);
  }

  const porSku = Array.from(aggBySku.values())
    .map((x) => {
      const margem = x.rendaLiquida > 0 ? (x.lucro / x.rendaLiquida) * 100 : 0;
      return {
        sku: x.sku,
        pedidos: x.pedidos.size,
        quantidade: x.quantidade,
        rendaLiquida: x.rendaLiquida,
        custoTotal: x.custoTotal,
        lucro: x.lucro,
        margem,
      };
    })
    .sort((a, b) => (b.rendaLiquida || 0) - (a.rendaLiquida || 0));

  const totalPedidos = new Set(items.map((i) => String(i.pedidoId))).size;
  const totalQuantidade = porSku.reduce((s, r) => s + (r.quantidade || 0), 0);
  const totalRenda = porSku.reduce((s, r) => s + (r.rendaLiquida || 0), 0);
  const totalCusto = porSku.reduce((s, r) => s + (r.custoTotal || 0), 0);
  const totalLucro = porSku.reduce((s, r) => s + (r.lucro || 0), 0);
  const totalMargem = totalRenda > 0 ? (totalLucro / totalRenda) * 100 : 0;

  const variacoes = (anuncio.variacoes || []).map((v: any) => ({
    id: v.id,
    modelId: v.modelId ? String(v.modelId) : null,
    sku: v.sku ?? null,
    nome: v.nome ?? null,
    preco: v.preco ?? null,
    estoque: v.estoque ?? null,
  }));

  res.json({
    success: true,
    data: {
      periodo: {
        days,
        start: start.toISOString(),
        end: now.toISOString(),
      },
      anuncio: {
        id: anuncio.id,
        platform: anuncio.platform,
        shopId: anuncio.shopId,
        itemId: anuncio.itemId ? String(anuncio.itemId) : null,
        sku: anuncio.sku ?? null,
        nome: anuncio.nome,
        imageUrl: (anuncio as any).imageUrl ?? null,
        status: anuncio.status,
        preco: anuncio.preco ?? null,
        estoque: anuncio.estoque ?? null,
        variacoes,
      },
      resumo: {
        pedidos: totalPedidos,
        quantidade: totalQuantidade,
        rendaLiquida: totalRenda,
        custoTotal: totalCusto,
        lucro: totalLucro,
        margem: totalMargem,
      },
      porSku,
      observacoes: {
        precisaSyncPedidos: porSku.length === 0,
        skusConsiderados: skus,
      },
    },
  });
});

export default router;
