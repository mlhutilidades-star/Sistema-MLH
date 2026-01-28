import nodemailer from 'nodemailer';
import { getPrismaClient } from '../../shared/database';
import { logger } from '../../shared/logger';
import { config } from '../../shared/config';

export type AlertLevel = 'INFO' | 'WARN' | 'CRITICAL';
export type AlertChannel = 'slack' | 'email';

export type AlertItem = {
  code: string;
  level: AlertLevel;
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

function envBool(name: string, fallback = false): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

function safeNumber(n: any): number {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

function dateKeyUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatMoneyBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export class AlertasService {
  private prisma = getPrismaClient();

  async gerarAlertas(options?: {
    lookbackDaysMargem?: number;
    margemCriticaPct?: number; // 10 => 10%
    diasConsecutivos?: number;
    lookbackDaysSemCusto?: number;
    adsPctMax?: number; // 0.3
    adsLookbackDays?: number;
  }): Promise<AlertItem[]> {
    const lookbackDaysMargem = options?.lookbackDaysMargem ?? 7;
    const margemCriticaPct = options?.margemCriticaPct ?? 10;
    const diasConsecutivos = options?.diasConsecutivos ?? 7;
    const lookbackDaysSemCusto = options?.lookbackDaysSemCusto ?? 30;
    const adsPctMax = options?.adsPctMax ?? 0.3;
    const adsLookbackDays = options?.adsLookbackDays ?? 7;

    const alerts: AlertItem[] = [];

    // 1) Produto com margem < 10% por 7 dias consecutivos (considera somente dias com venda)
    try {
      const since = new Date(Date.now() - lookbackDaysMargem * 86400 * 1000);
      const itens = await this.prisma.pedidoItem.findMany({
        where: { pedido: { data: { gte: since } } },
        select: {
          sku: true,
          quantidade: true,
          rendaLiquida: true,
          custoTotal: true,
          pedido: { select: { data: true } },
        },
      });

      // Map sku -> day -> aggregates
      const bySkuDay = new Map<string, Map<string, { renda: number; custo: number }>>();
      for (const it of itens) {
        const sku = String(it.sku || '').trim();
        if (!sku) continue;
        const day = dateKeyUTC(new Date(it.pedido.data));
        const renda = safeNumber(it.rendaLiquida);
        const custo = safeNumber(it.custoTotal);
        const dayMap = bySkuDay.get(sku) || new Map();
        const cur = dayMap.get(day) || { renda: 0, custo: 0 };
        cur.renda += renda;
        cur.custo += custo;
        dayMap.set(day, cur);
        bySkuDay.set(sku, dayMap);
      }

      const criticalSkus: Array<{ sku: string; dias: string[]; margemMin: number }> = [];
      for (const [sku, dayMap] of bySkuDay) {
        const days = Array.from(dayMap.keys()).sort();
        if (days.length < diasConsecutivos) continue;

        // precisamos de dias consecutivos com venda e margem < limiar
        let streak: string[] = [];
        let margemMin = Infinity;

        for (let i = 0; i < days.length; i++) {
          const day = days[i];
          const prev = i > 0 ? days[i - 1] : null;
          const curAgg = dayMap.get(day)!;
          const renda = curAgg.renda;
          const lucro = curAgg.renda - curAgg.custo;
          const margem = renda > 0 ? (lucro / renda) * 100 : 0;

          const isConsecutive =
            !prev ||
            new Date(day + 'T00:00:00.000Z').getTime() - new Date(prev + 'T00:00:00.000Z').getTime() === 86400 * 1000;

          if (!isConsecutive) {
            streak = [];
            margemMin = Infinity;
          }

          if (margem < margemCriticaPct) {
            streak.push(day);
            if (margem < margemMin) margemMin = margem;
          } else {
            streak = [];
            margemMin = Infinity;
          }

          if (streak.length >= diasConsecutivos) {
            criticalSkus.push({ sku, dias: streak.slice(-diasConsecutivos), margemMin });
            break;
          }
        }
      }

      if (criticalSkus.length) {
        const top = criticalSkus.slice(0, 20);
        alerts.push({
          code: 'MARGEM_CRITICA_7D',
          level: 'CRITICAL',
          title: 'Margem crítica por 7 dias',
          message: `${top.length} SKU(s) com margem < ${margemCriticaPct}% por ${diasConsecutivos} dias consecutivos. Ex: ${top
            .slice(0, 5)
            .map((x) => x.sku)
            .join(', ')}`,
          data: { margemCriticaPct, diasConsecutivos, skus: top },
        });
      }
    } catch (e) {
      logger.error('Falha ao calcular alerta de margem crítica', { error: e });
    }

    // 2) SKU sem custo após 30 dias de vendas
    try {
      const since = new Date(Date.now() - lookbackDaysSemCusto * 86400 * 1000);
      const sold = await this.prisma.pedidoItem.findMany({
        where: { pedido: { data: { gte: since } } },
        distinct: ['sku'],
        select: { sku: true },
      });
      const skus = sold.map((s) => String(s.sku || '').trim()).filter(Boolean);

      if (skus.length) {
        const produtos = await this.prisma.produto.findMany({
          where: { sku: { in: skus } },
          select: { sku: true, custoReal: true, custoStatus: true, custoAtualizadoEm: true },
        });
        const bySku = new Map(produtos.map((p) => [p.sku, p] as const));

        const pendentes = skus
          .map((sku) => {
            const p = bySku.get(sku);
            const custoReal = safeNumber(p?.custoReal);
            const status = String(p?.custoStatus ?? 'PENDENTE_SYNC');
            const isPendente = !p || custoReal <= 0 || status === 'PENDENTE_SYNC';
            return isPendente
              ? {
                  sku,
                  custoReal,
                  custoStatus: status,
                  custoAtualizadoEm: p?.custoAtualizadoEm ?? null,
                }
              : null;
          })
          .filter(Boolean) as Array<{ sku: string; custoReal: number; custoStatus: string; custoAtualizadoEm: Date | null }>;

        if (pendentes.length) {
          alerts.push({
            code: 'SKU_SEM_CUSTO_30D',
            level: 'WARN',
            title: 'SKUs vendidos sem custo',
            message: `${pendentes.length} SKU(s) vendidos nos últimos ${lookbackDaysSemCusto} dias ainda sem custo (ou pendentes). Ex: ${pendentes
              .slice(0, 5)
              .map((x) => x.sku)
              .join(', ')}`,
            data: { lookbackDaysSemCusto, pendentes: pendentes.slice(0, 50) },
          });
        }
      }
    } catch (e) {
      logger.error('Falha ao calcular alerta de SKU sem custo', { error: e });
    }

    // 3) Gasto Ads > 30% da renda líquida (período)
    try {
      const since = new Date(Date.now() - adsLookbackDays * 86400 * 1000);
      const pedidosAgg = await this.prisma.pedido.aggregate({
        where: { data: { gte: since } },
        _sum: { rendaLiquida: true },
      });
      const adsAgg = await this.prisma.consumoAds.aggregate({
        where: { data: { gte: since } },
        _sum: { gasto: true },
      });

      const renda = safeNumber(pedidosAgg._sum.rendaLiquida);
      const gasto = safeNumber(adsAgg._sum.gasto);
      const pct = renda > 0 ? gasto / renda : 0;

      if (renda > 0 && pct > adsPctMax) {
        alerts.push({
          code: 'ADS_ACIMA_30PCT',
          level: 'CRITICAL',
          title: 'Ads consumindo renda líquida',
          message: `Gasto Ads (${formatMoneyBRL(gasto)}) está em ${(pct * 100).toFixed(1)}% da renda líquida (${formatMoneyBRL(
            renda
          )}) nos últimos ${adsLookbackDays} dias.`,
          data: { adsLookbackDays, gasto, renda, pct },
        });
      }
    } catch (e) {
      logger.error('Falha ao calcular alerta de Ads', { error: e });
    }

    // 4) Shopee OAuth: refresh token expirando / erro recente
    try {
      const shopId = Number(config.shopee.shopId);
      const configuredShopId = Number.isFinite(shopId) && shopId > 0 ? shopId : null;

      const row = configuredShopId
        ? await this.prisma.shopeeToken.findUnique({ where: { shopId: configuredShopId } })
        : await this.prisma.shopeeToken.findFirst({ orderBy: { atualizadoEm: 'desc' } });

      if (!row) {
        const hasEnvTokens = !!process.env.SHOPEE_ACCESS_TOKEN && !!process.env.SHOPEE_REFRESH_TOKEN;
        if (!hasEnvTokens) {
          alerts.push({
            code: 'SHOPEE_OAUTH_TOKENS_AUSENTES',
            level: 'WARN',
            title: 'Shopee OAuth sem tokens',
            message:
              'Nenhum token Shopee encontrado no DB e tokens em env vars ausentes. Integração Shopee pode falhar até completar o OAuth.',
          });
        }
      } else {
        const now = Date.now();
        const refreshExp = row.refreshTokenExpiresAt ? row.refreshTokenExpiresAt.getTime() : null;
        if (refreshExp && row.refreshTokenExpiresAt) {
          const refreshTokenExpiresAtIso = row.refreshTokenExpiresAt.toISOString();
          const daysLeft = Math.floor((refreshExp - now) / 86400000);
          if (daysLeft < 0) {
            alerts.push({
              code: 'SHOPEE_OAUTH_REFRESH_EXPIRADO',
              level: 'CRITICAL',
              title: 'Shopee refresh token expirado',
              message: `Refresh token expirado (dias restantes=${daysLeft}). Reautorize a Shopee para retomar a sincronização.`,
              data: { shopId: row.shopId, refreshTokenExpiresAt: refreshTokenExpiresAtIso },
            });
          } else if (daysLeft < 7) {
            alerts.push({
              code: 'SHOPEE_OAUTH_REFRESH_EXPIRA_EM_BREVE',
              level: 'WARN',
              title: 'Shopee refresh token perto de expirar',
              message: `Refresh token expira em ${daysLeft} dia(s). Recomenda-se reautorizar para evitar interrupções.`,
              data: { shopId: row.shopId, refreshTokenExpiresAt: refreshTokenExpiresAtIso, daysLeft },
            });
          }
        }

        if (row.lastRefreshError) {
          const lastAt = row.lastRefreshAt ? row.lastRefreshAt.getTime() : null;
          const recent = lastAt ? now - lastAt < 24 * 3600 * 1000 : false;
          alerts.push({
            code: 'SHOPEE_OAUTH_REFRESH_FALHOU',
            level: recent ? 'WARN' : 'INFO',
            title: 'Shopee refresh com erro',
            message: `Último refresh registrou erro${recent ? ' (últimas 24h)' : ''}: ${row.lastRefreshError}`,
            data: { shopId: row.shopId, lastRefreshAt: row.lastRefreshAt?.toISOString() ?? null },
          });
        }
      }
    } catch (e) {
      logger.error('Falha ao calcular alerta de Shopee OAuth', { error: e });
    }

    return alerts;
  }

  async enviarAlertas(alerts: AlertItem[]): Promise<{ sent: AlertChannel[] }> {
    const sent: AlertChannel[] = [];
    if (!alerts.length) return { sent };

    const slackEnabled = envBool('ALERTS_SLACK_ENABLED', true);
    const emailEnabled = envBool('ALERTS_EMAIL_ENABLED', false);

    if (slackEnabled) {
      const ok = await this.enviarSlack(alerts);
      if (ok) sent.push('slack');
    }

    if (emailEnabled) {
      const ok = await this.enviarEmail(alerts);
      if (ok) sent.push('email');
    }

    return { sent };
  }

  private async enviarSlack(alerts: AlertItem[]): Promise<boolean> {
    const url = String(process.env.ALERTS_SLACK_WEBHOOK_URL || '').trim();
    if (!url) return false;

    const lines = alerts
      .slice(0, 20)
      .map((a) => `*${a.level}* - ${a.title}\n${a.message}`)
      .join('\n\n');

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `*Sistema MLH — Alertas*\n\n${lines}` }),
      });

      if (!res.ok) {
        logger.warn('Falha ao enviar Slack', { status: res.status, text: await res.text() });
        return false;
      }

      return true;
    } catch (e) {
      logger.error('Erro ao enviar Slack', { error: e });
      return false;
    }
  }

  private async enviarEmail(alerts: AlertItem[]): Promise<boolean> {
    const host = String(process.env.ALERTS_EMAIL_SMTP_HOST || '').trim();
    const port = Number(process.env.ALERTS_EMAIL_SMTP_PORT || 587);
    const user = String(process.env.ALERTS_EMAIL_SMTP_USER || '').trim();
    const pass = String(process.env.ALERTS_EMAIL_SMTP_PASS || '').trim();
    const from = String(process.env.ALERTS_EMAIL_FROM || '').trim();
    const to = String(process.env.ALERTS_EMAIL_TO || '').trim();

    if (!host || !from || !to) return false;

    const transporter = nodemailer.createTransport({
      host,
      port: Number.isFinite(port) ? port : 587,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    const subject = `Sistema MLH — ${alerts.length} alerta(s)`;
    const text = alerts
      .map((a) => `[${a.level}] ${a.title}\n${a.message}\n`)
      .join('\n');

    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
      });
      return true;
    } catch (e) {
      logger.error('Erro ao enviar email', { error: e });
      return false;
    }
  }
}
