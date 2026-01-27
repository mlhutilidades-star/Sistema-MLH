import { Router, Request, Response, NextFunction } from 'express';
import { OtimizacaoService } from './service';

const router = Router();
const service = new OtimizacaoService();

function parseDateOrThrow(value: string, label: string): Date {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`${label} inválida: ${value}. Use YYYY-MM-DD ou ISO.`);
  }
  return d;
}

function parseDateRangeOrThrow(dataInicio: string, dataFim: string): { inicio: Date; fim: Date } {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const inicio = isDateOnly(dataInicio) ? new Date(`${dataInicio}T00:00:00.000Z`) : parseDateOrThrow(dataInicio, 'dataInicio');
  const fim = isDateOnly(dataFim) ? new Date(`${dataFim}T23:59:59.999Z`) : parseDateOrThrow(dataFim, 'dataFim');
  return { inicio, fim };
}

router.get('/precos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dataInicio = String(req.query.dataInicio || '').trim();
    const dataFim = String(req.query.dataFim || '').trim();

    if (!dataInicio || !dataFim) {
      return res.status(400).json({ success: false, error: 'Informe dataInicio e dataFim.' });
    }

    const { inicio, fim } = parseDateRangeOrThrow(dataInicio, dataFim);
    const metaMargemPct = req.query.metaMargemPct ? Number(req.query.metaMargemPct) : 25;
    const limit = req.query.limit ? Number(req.query.limit) : 50;

    const out = await service.sugerirPrecos({ dataInicio: inicio, dataFim: fim, metaMargemPct, limit });
    res.json(out);
  } catch (e) {
    next(e);
  }
});

export default router;
