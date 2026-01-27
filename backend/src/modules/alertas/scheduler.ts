import cron from 'node-cron';
import { logger } from '../../shared/logger';
import { AlertasService } from './service';

function envBool(name: string, fallback = false): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

export function startAlertasScheduler(): void {
  const enabled = envBool('ALERTS_ENABLED', false);
  if (!enabled) {
    logger.info('Alertas: desabilitado (ALERTS_ENABLED!=true)');
    return;
  }

  const schedule = String(process.env.ALERTS_CRON || '0 9 * * *').trim(); // diariamente 09:00
  const service = new AlertasService();

  logger.info(`Alertas: agendado (${schedule})`);

  cron.schedule(schedule, async () => {
    logger.info('Alertas: executando checks...');
    const alerts = await service.gerarAlertas();

    if (!alerts.length) {
      logger.info('Alertas: nenhum alerta gerado');
      return;
    }

    const sent = await service.enviarAlertas(alerts);
    logger.info('Alertas: enviados', { channels: sent.sent, total: alerts.length });
  });
}
