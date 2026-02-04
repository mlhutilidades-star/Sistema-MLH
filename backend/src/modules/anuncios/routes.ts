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

function parseFloatParam(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseBoolParam(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return null;
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

router.get('/rentabilidade', async (req: Request, res: Response) => {
  const prisma = getPrismaClient();

  const limit = parseLimit(req.query.limit, 50, 200);
  const page = parsePage(req.query.page, 1);
  const offset = (page - 1) * limit;

  const status = normalizeStatus(req.query.status);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const shopId = parseIntParam(req.query.shopId ?? req.query.shop_id);
  const margemMinima = parseFloatParam(req.query.margemMinima ?? req.query.margem_minima);
  const estoqueMinimo = parseIntParam(req.query.estoqueMinimo ?? req.query.estoque_minimo);
  const semCusto = parseBoolParam(req.query.semCusto ?? req.query.sem_custo);
  const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';

  const where: any = { modelId: null };
  if (status) where.status = status;
  if (shopId !== null) where.shopId = shopId;
  if (q) {
    where.OR = [
      { nome: { contains: q, mode: 'insensitive' } },
      { sku: { contains: q, mode: 'insensitive' } },
    ];
  }

  const anuncios = await prisma.anuncioCatalogo.findMany({
    where,
    include: {
      variacoes: { orderBy: [{ modelId: 'asc' as const }] },
    },
    orderBy: [{ updatedAt: 'desc' as const }],
    take: 5000,
  });

  const skuSet = new Set<string>();
  for (const a of anuncios) {
    if (a.sku) skuSet.add(String(a.sku).trim());
    for (const v of a.variacoes || []) {
      const sku = String(v.sku || '').trim();
      if (sku) skuSet.add(sku);
    }
  }

  const skus = Array.from(skuSet.values());
  const mappings = skus.length
    ? await prisma.mapeamentoSKU.findMany({
        where: { skuShopee: { in: skus } },
        select: { skuShopee: true, codigoTiny: true },
      })
    : [];

  const codigoTinyBySkuShopee = new Map<string, string>();
  const codigoTinys: string[] = [];
  for (const m of mappings as any[]) {
    const skuShopee = String(m?.skuShopee || '').trim();
    const codigoTiny = String(m?.codigoTiny || '').trim();
    if (!skuShopee || !codigoTiny) continue;
    codigoTinyBySkuShopee.set(skuShopee, codigoTiny);
    codigoTinys.push(codigoTiny);
  }

  const produtoSkusToFetch = Array.from(new Set([...skus, ...codigoTinys].filter(Boolean)));
  const produtos = produtoSkusToFetch.length
    ? await prisma.produto.findMany({
        where: { sku: { in: produtoSkusToFetch } },
        select: { sku: true, custoReal: true, custoStatus: true },
      })
    : [];

  const custoRealBySku = new Map<string, number>();
  const custoStatusBySku = new Map<string, string>();
  for (const p of produtos as any[]) {
    const sku = String(p?.sku || '').trim();
    if (!sku) continue;
    const custoReal = Number(p?.custoReal ?? 0) || 0;
    custoRealBySku.set(sku, custoReal);
    if (p?.custoStatus) custoStatusBySku.set(sku, String(p.custoStatus));
  }

  function resolveCusto(sku: string): { custoUnitario: number; codigoTiny: string | null; status: string } {
    const direct = custoRealBySku.get(sku) ?? 0;
    if (direct > 0) {
      return { custoUnitario: direct, codigoTiny: codigoTinyBySkuShopee.get(sku) || null, status: 'OK' };
    }

    const codigoTiny = codigoTinyBySkuShopee.get(sku);
    if (codigoTiny) {
      const mapped = custoRealBySku.get(codigoTiny) ?? 0;
      if (mapped > 0) {
        return { custoUnitario: mapped, codigoTiny, status: 'OK' };
      }
    }

    const status = custoStatusBySku.get(sku) || 'PENDENTE';
    return { custoUnitario: 0, codigoTiny: codigoTiny || null, status };
  }

  const computed = anuncios.map((a: any) => {
    const parentSku = String(a.sku || '').trim();
    type VariacaoRent = {
      id: string;
      modelId: string | null;
      sku: string | null;
      nome: string | null;
      preco: number | null;
      estoque: number | null;
      rendaEstimada: number;
      codigoTiny: string | null;
      custoUnitario: number;
      custoStatus: string;
      custoTotal: number;
      lucro: number;
      margem: number;
    };

    const variacoes: VariacaoRent[] = (a.variacoes || []).map((v: any) => {
      const sku = String(v.sku || parentSku || '').trim();
      const preco = Number(v.preco ?? a.preco ?? 0) || 0;
      const estoque = Number(v.estoque ?? 0) || 0;
      const rendaEstimada = preco * estoque;
      const custoMeta = sku ? resolveCusto(sku) : { custoUnitario: 0, codigoTiny: null, status: 'PENDENTE' };
      const custoTotal = custoMeta.custoUnitario > 0 ? custoMeta.custoUnitario * estoque : 0;
      const lucro = rendaEstimada - custoTotal;
      const margem = rendaEstimada > 0 ? (lucro / rendaEstimada) * 100 : 0;
      return {
        id: v.id,
        modelId: v.modelId ? String(v.modelId) : null,
        sku: sku || null,
        nome: v.nome ?? null,
        preco: Number.isFinite(preco) ? preco : null,
        estoque: Number.isFinite(estoque) ? estoque : null,
        rendaEstimada,
        codigoTiny: custoMeta.codigoTiny,
        custoUnitario: custoMeta.custoUnitario,
        custoStatus: custoMeta.status,
        custoTotal,
        lucro,
        margem,
      };
    });

    const variacoesFinal: VariacaoRent[] = variacoes.length
      ? variacoes
      : [
          (() => {
            const sku = parentSku || null;
            const preco = Number(a.preco ?? 0) || 0;
            const estoque = Number(a.estoque ?? 0) || 0;
            const rendaEstimada = preco * estoque;
            const custoMeta = sku ? resolveCusto(String(sku)) : { custoUnitario: 0, codigoTiny: null, status: 'PENDENTE' };
            const custoTotal = custoMeta.custoUnitario > 0 ? custoMeta.custoUnitario * estoque : 0;
            const lucro = rendaEstimada - custoTotal;
            const margem = rendaEstimada > 0 ? (lucro / rendaEstimada) * 100 : 0;
            return {
              id: a.id,
              modelId: null,
              sku,
              nome: a.nome ?? null,
              preco: Number.isFinite(preco) ? preco : null,
              estoque: Number.isFinite(estoque) ? estoque : null,
              rendaEstimada,
              codigoTiny: custoMeta.codigoTiny,
              custoUnitario: custoMeta.custoUnitario,
              custoStatus: custoMeta.status,
              custoTotal,
              lucro,
              margem,
            } as VariacaoRent;
          })(),
        ];

    const totalEstoque = variacoesFinal.reduce((s, v) => s + (v.estoque || 0), 0);
    const rendaTotal = variacoesFinal.reduce((s, v) => s + (v.rendaEstimada || 0), 0);
    const custoTotal = variacoesFinal.reduce((s, v) => s + (v.custoTotal || 0), 0);
    const lucroTotal = rendaTotal - custoTotal;
    const margemMedia = rendaTotal > 0 ? (lucroTotal / rendaTotal) * 100 : 0;

    const totalPrecos = variacoesFinal.reduce((s, v) => s + (v.preco || 0), 0);
    const precoMedio = totalEstoque > 0 ? rendaTotal / totalEstoque : variacoesFinal.length ? totalPrecos / variacoesFinal.length : 0;

    const semCustoFlag = variacoesFinal.some((v) => (v.custoUnitario || 0) <= 0);

    return {
      id: a.id,
      platform: a.platform,
      shopId: a.shopId,
      itemId: a.itemId ? String(a.itemId) : null,
      sku: a.sku ?? null,
      nome: a.nome,
      imageUrl: a.imageUrl ?? null,
      status: a.status,
      updatedAt: a.updatedAt.toISOString(),
      totalVariacoes: variacoesFinal.length,
      precoMedio,
      estoqueTotal: totalEstoque,
      rendaTotal,
      custoTotal,
      lucroTotal,
      margemMedia,
      semCusto: semCustoFlag,
      variacoes: variacoesFinal,
    };
  });

  const filtered = computed.filter((r) => {
    if (margemMinima !== null && r.margemMedia < margemMinima) return false;
    if (estoqueMinimo !== null && r.estoqueTotal < estoqueMinimo) return false;
    if (semCusto !== null && semCusto && !r.semCusto) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    switch (sort) {
      case 'lucro_asc':
        return (a.lucroTotal || 0) - (b.lucroTotal || 0);
      case 'margem_desc':
        return (b.margemMedia || 0) - (a.margemMedia || 0);
      case 'margem_asc':
        return (a.margemMedia || 0) - (b.margemMedia || 0);
      case 'estoque_desc':
        return (b.estoqueTotal || 0) - (a.estoqueTotal || 0);
      case 'estoque_asc':
        return (a.estoqueTotal || 0) - (b.estoqueTotal || 0);
      case 'renda_desc':
        return (b.rendaTotal || 0) - (a.rendaTotal || 0);
      case 'renda_asc':
        return (a.rendaTotal || 0) - (b.rendaTotal || 0);
      case 'nome_asc':
        return String(a.nome).localeCompare(String(b.nome));
      case 'nome_desc':
        return String(b.nome).localeCompare(String(a.nome));
      case 'updatedAt_asc':
        return String(a.updatedAt).localeCompare(String(b.updatedAt));
      case 'updatedAt_desc':
      case 'lucro_desc':
      default:
        return (b.lucroTotal || 0) - (a.lucroTotal || 0);
    }
  });

  const total = sorted.length;
  const data = sorted.slice(offset, offset + limit);

  const estoqueTotal = sorted.reduce((s, r) => s + (r.estoqueTotal || 0), 0);
  const rendaTotal = sorted.reduce((s, r) => s + (r.rendaTotal || 0), 0);
  const custoTotal = sorted.reduce((s, r) => s + (r.custoTotal || 0), 0);
  const lucroTotal = sorted.reduce((s, r) => s + (r.lucroTotal || 0), 0);
  const margemMedia = rendaTotal > 0 ? (lucroTotal / rendaTotal) * 100 : 0;
  const semCustoCount = sorted.filter((r) => r.semCusto).length;

  res.json({
    success: true,
    total,
    page,
    limit,
    resumo: {
      totalAnuncios: total,
      estoqueTotal,
      rendaTotal,
      custoTotal,
      lucroTotal,
      margemMedia,
      semCusto: semCustoCount,
    },
    data,
  });
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

  const [items, mappings] = await Promise.all([
    skus.length
      ? prisma.pedidoItem.findMany({
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
          },
        })
      : Promise.resolve([]),
    skus.length
      ? prisma.mapeamentoSKU.findMany({
          where: { skuShopee: { in: skus } },
          select: { skuShopee: true, codigoTiny: true },
        })
      : Promise.resolve([]),
  ]);

  const codigoTinyBySkuShopee = new Map<string, string>();
  const codigoTinys: string[] = [];
  for (const m of mappings as any[]) {
    const skuShopee = String(m?.skuShopee || '').trim();
    const codigoTiny = String(m?.codigoTiny || '').trim();
    if (!skuShopee || !codigoTiny) continue;
    codigoTinyBySkuShopee.set(skuShopee, codigoTiny);
    codigoTinys.push(codigoTiny);
  }

  const produtoSkusToFetch = Array.from(new Set([...skus, ...codigoTinys].filter(Boolean)));
  const produtos = produtoSkusToFetch.length
    ? await prisma.produto.findMany({
        where: { sku: { in: produtoSkusToFetch } },
        select: { sku: true, custoReal: true },
      })
    : [];

  // Fonte do custo:
  // - Preferir `pedido_itens.custoTotal` quando já calculado na rotina de sync.
  // - Senão, usar `produtos.custoReal` (custo unitário) * quantidade.
  // - Quando SKU for Shopee e custo estiver no Tiny, usar `mapeamento_sku` (skuShopee -> codigoTiny).
  const custoRealBySku = new Map<string, number>();
  for (const p of produtos as any[]) {
    const sku = String(p?.sku || '').trim();
    if (!sku) continue;
    const custoReal = Number(p?.custoReal ?? 0) || 0;
    custoRealBySku.set(sku, custoReal);
  }

  function getCustoUnitarioForSku(sku: string): number {
    const direct = custoRealBySku.get(sku) ?? 0;
    if (direct > 0) return direct;

    const codigoTiny = codigoTinyBySkuShopee.get(sku);
    if (codigoTiny) {
      const mapped = custoRealBySku.get(codigoTiny) ?? 0;
      if (mapped > 0) return mapped;
    }

    return 0;
  }

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

    const quantidade = Number(it.quantidade ?? 0) || 0;
    const rendaLiquida = Number(it.rendaLiquida ?? 0) || 0;

    const custoTotalFromPedidoItem = Number((it as any).custoTotal ?? 0) || 0;
    let custoUnitario = getCustoUnitarioForSku(sku);

    // Fallback extra para variações: se a variação não tem custo, tentar o SKU do anúncio pai.
    if (custoUnitario <= 0 && skuParent && sku !== skuParent) {
      custoUnitario = getCustoUnitarioForSku(skuParent);
    }

    // Fallback heurístico: tentar "base" antes do primeiro '-'
    if (custoUnitario <= 0) {
      const pos = sku.indexOf('-');
      if (pos > 0) {
        const base = sku.slice(0, pos).trim();
        if (base) custoUnitario = getCustoUnitarioForSku(base);
      }
    }

    const custoTotal =
      custoTotalFromPedidoItem > 0
        ? custoTotalFromPedidoItem
        : custoUnitario > 0
          ? custoUnitario * quantidade
          : 0;

    // Regra pedida: lucro = rendaLiquida - custo
    const lucro = rendaLiquida - custoTotal;

    cur.pedidos.add(String((it as any).pedidoId));
    cur.quantidade += quantidade;
    cur.rendaLiquida += rendaLiquida;
    cur.custoTotal += custoTotal;
    cur.lucro += lucro;
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
