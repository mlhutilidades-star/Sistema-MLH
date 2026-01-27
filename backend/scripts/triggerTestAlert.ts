import { AlertasService, type AlertItem } from '../src/modules/alertas/service';
import { logger } from '../src/shared/logger';

function envBool(name: string, fallback = false): boolean {
  const v = String(process.env[name] ?? '').trim().toLowerCase();
  if (!v) return fallback;
  return v === 'true' || v === '1' || v === 'yes';
}

async function main(): Promise<void> {
  // Safety: only allow manual trigger when explicitly enabled.
  const allowed = envBool('ALLOW_MANUAL_ALERT_TEST', false);
  if (!allowed) {
    logger.error('ALLOW_MANUAL_ALERT_TEST!=true (bloqueado por segurança)');
    process.exit(2);
    return;
  }

  const service = new AlertasService();

  const alerts: AlertItem[] = [
    {
      code: 'MARGEM_CRITICA_TESTE',
      level: 'CRITICAL',
      title: 'Margem crítica (teste controlado)',
      message:
        'Disparo manual de teste para validação do canal de alertas. Se você recebeu isso no Slack/Email, a integração está OK.',
      data: {
        sku: 'TESTE-SKU-MLH',
        margemMin: -5,
        diasConsecutivos: 7,
        origem: 'scripts/triggerTestAlert.ts',
      },
    },
  ];

  const sent = await service.enviarAlertas(alerts);

  if (!sent.sent.length) {
    logger.warn('Alerta de teste não enviado: nenhum canal configurado', {
      slackWebhook: Boolean(String(process.env.ALERTS_SLACK_WEBHOOK_URL || '').trim()),
      emailEnabled: envBool('ALERTS_EMAIL_ENABLED', false),
    });
    process.exit(3);
    return;
  }

  logger.info('Alerta de teste enviado com sucesso', { channels: sent.sent });
}

main().catch((error) => {
  logger.error('Falha ao disparar alerta de teste', { error });
  process.exit(1);
});
