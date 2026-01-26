import multer from 'multer';
import * as XLSX from 'xlsx';
import csvParser from 'csv-parser';
import { Readable } from 'stream';
import { getPrismaClient } from '../../shared/database';

export type PlanilhaTipo = 'excel' | 'csv';

export type ProdutoPlanilhaRow = {
  sku: string;
  descricao?: string;
  custoMedio?: number;
  precoCusto?: number;
  estoque?: number;
};

export type ProcessamentoPlanilhaResult = {
  tipo: PlanilhaTipo;
  totalLinhas: number;
  validos: ProdutoPlanilhaRow[];
  rejeitados: Array<{ linha: number; motivo: string }>; // linha 1-indexed no arquivo (inclui header quando aplicável)
};

export type AtualizarCustosResult = {
  processados: number;
  validos: number;
  atualizados: number;
  criados: number;
  ignorados: number;
  erros: number;
  detalhes: string[];
};

function normalizeHeader(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumberBR(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;

  const s = String(raw)
    .trim()
    .replace(/\s+/g, '')
    .replace(/^r\$?/i, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(raw: unknown): number {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function pickFirst(obj: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    if (k in obj) return obj[k];
  }
  return undefined;
}

function mapRowToProduto(row: Record<string, any>): ProdutoPlanilhaRow {
  // chaves já normalizadas no row
  const sku = pickFirst(row, ['sku', 'codigo', 'cod', 'codigo_sku', 'sku_codigo', 'codigo_produto']);
  const descricao = pickFirst(row, ['descricao', 'descricao_produto', 'nome', 'produto']);

  const custoMedioRaw = pickFirst(row, ['custo_medio', 'custo_medio_r', 'customedio']);
  const precoCustoRaw = pickFirst(row, ['preco_custo', 'precocusto', 'preco_de_custo', 'custo']);
  const estoqueRaw = pickFirst(row, ['estoque', 'qtd', 'quantidade', 'saldo']);

  const skuStr = String(sku ?? '').trim();
  const descricaoStr = String(descricao ?? '').trim();

  const custoMedio = parseNumberBR(custoMedioRaw);
  const precoCusto = parseNumberBR(precoCustoRaw);
  const estoque = parseIntSafe(estoqueRaw);

  return {
    sku: skuStr,
    descricao: descricaoStr || undefined,
    custoMedio: custoMedio || undefined,
    precoCusto: precoCusto || undefined,
    estoque: Number.isFinite(estoque) ? estoque : undefined,
  };
}

export class UploadService {
  private prisma = getPrismaClient();

  readonly upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
      const allowedMime = new Set([
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv',
        'application/csv',
        // Alguns browsers/antivírus/gateways enviam mimetype genérico.
        'application/octet-stream',
      ]);

      const name = String(file.originalname || '').toLowerCase();
      const allowedExt = name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv');

      if (allowedMime.has(file.mimetype) && (allowedExt || file.mimetype !== 'application/octet-stream')) {
        cb(null, true);
        return;
      }

      if (allowedExt) {
        // Aceita pela extensão mesmo que o mimetype não seja reconhecido.
        cb(null, true);
        return;
      }

      cb(new Error('Apenas arquivos Excel (.xlsx, .xls) ou CSV'));
    },
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  detectTipo(mimetype: string, filename?: string): PlanilhaTipo {
    const name = String(filename ?? '').toLowerCase();
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel';

    if (String(mimetype || '').includes('spreadsheet')) return 'excel';
    if (String(mimetype || '').includes('excel')) return 'excel';
    return 'csv';
  }

  async processarPlanilha(buffer: Buffer, tipo: PlanilhaTipo): Promise<ProcessamentoPlanilhaResult> {
    const validos: ProdutoPlanilhaRow[] = [];
    const rejeitados: Array<{ linha: number; motivo: string }> = [];

    if (tipo === 'excel') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: '',
        raw: true,
      });

      data.forEach((rawRow, idx) => {
        const row: Record<string, any> = {};
        for (const [k, v] of Object.entries(rawRow)) {
          row[normalizeHeader(k)] = v;
        }

        const produto = mapRowToProduto(row);
        const custoMedio = produto.custoMedio ?? 0;
        const precoCusto = produto.precoCusto ?? 0;

        if (!produto.sku) {
          rejeitados.push({ linha: idx + 2, motivo: 'SKU/Código ausente' });
          return;
        }

        if (custoMedio <= 0 && precoCusto <= 0) {
          rejeitados.push({ linha: idx + 2, motivo: 'Sem custo (custo_medio/preco_custo)' });
          return;
        }

        validos.push(produto);
      });

      return {
        tipo,
        totalLinhas: data.length,
        validos,
        rejeitados,
      };
    }

    // CSV
    const text = buffer.toString('utf8');
    const stream = Readable.from(text);

    let rowIndex = 0;

    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(
          csvParser({
            mapHeaders: ({ header }) => normalizeHeader(header),
            strict: false,
          }),
        )
        .on('data', (rawRow) => {
          rowIndex++;
          const produto = mapRowToProduto(rawRow as Record<string, any>);
          const custoMedio = produto.custoMedio ?? 0;
          const precoCusto = produto.precoCusto ?? 0;

          if (!produto.sku) {
            rejeitados.push({ linha: rowIndex + 1, motivo: 'SKU/Código ausente' });
            return;
          }

          if (custoMedio <= 0 && precoCusto <= 0) {
            rejeitados.push({ linha: rowIndex + 1, motivo: 'Sem custo (custo_medio/preco_custo)' });
            return;
          }

          validos.push(produto);
        })
        .on('end', () => resolve())
        .on('error', (e) => reject(e));
    });

    return {
      tipo,
      totalLinhas: rowIndex,
      validos,
      rejeitados,
    };
  }

  async atualizarCustos(produtos: ProdutoPlanilhaRow[]): Promise<AtualizarCustosResult> {
    const resultados: AtualizarCustosResult = {
      processados: produtos.length,
      validos: 0,
      atualizados: 0,
      criados: 0,
      ignorados: 0,
      erros: 0,
      detalhes: [],
    };

    const skus = Array.from(new Set(produtos.map((p) => p.sku).filter(Boolean)));
    const existentes = skus.length
      ? await this.prisma.produto.findMany({
          where: { sku: { in: skus } },
          select: { sku: true },
        })
      : [];

    const existentesSet = new Set(existentes.map((e) => e.sku));

    // Processa em batches para evitar transações gigantes
    const BATCH = 100;
    for (let i = 0; i < produtos.length; i += BATCH) {
      const batch = produtos.slice(i, i + BATCH);

      const ops = batch.map(async (produto) => {
        try {
          const custoMedio = produto.custoMedio ?? 0;
          const precoCusto = produto.precoCusto ?? 0;
          const custoReal = custoMedio > 0 ? custoMedio : precoCusto;

          if (!produto.sku) {
            resultados.ignorados++;
            return;
          }

          if (!(typeof custoReal === 'number' && Number.isFinite(custoReal) && custoReal > 0)) {
            resultados.ignorados++;
            return;
          }

          resultados.validos++;

          const isCreate = !existentesSet.has(produto.sku);

          await this.prisma.produto.upsert({
            where: { sku: produto.sku },
            create: {
              sku: produto.sku,
              descricao: produto.descricao || produto.sku,
              custoReal,
              custoStatus: 'OK',
              custoAtualizadoEm: new Date(),
              estoqueTiny: typeof produto.estoque === 'number' ? produto.estoque : 0,
              ativo: true,
            },
            update: {
              ...(produto.descricao ? { descricao: produto.descricao } : {}),
              custoReal,
              custoStatus: 'OK',
              custoAtualizadoEm: new Date(),
              ...(typeof produto.estoque === 'number' ? { estoqueTiny: produto.estoque } : {}),
              ativo: true,
              atualizadoEm: new Date(),
            },
          });

          if (isCreate) {
            resultados.criados++;
            resultados.detalhes.push(`🆕 ${produto.sku}: criado/atualizado via planilha`);
          } else {
            resultados.atualizados++;
            resultados.detalhes.push(`✅ ${produto.sku}: custo atualizado via planilha`);
          }
        } catch (e: any) {
          resultados.erros++;
          resultados.detalhes.push(`❌ ${produto.sku}: erro - ${String(e?.message || e)}`);
        }
      });

      // executa concorrente, mas limitando por batch
      await Promise.all(ops);
    }

    // limita tamanho do payload
    if (resultados.detalhes.length > 200) {
      resultados.detalhes = resultados.detalhes.slice(0, 200).concat([`... (${resultados.detalhes.length - 200} linhas omitidas)`]);
    }

    return resultados;
  }
}
