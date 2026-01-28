// ==========================================
// SISTEMA MLH - SERVER
// ==========================================

import app from './app';
import { config, getConfigWarnings, validateConfig } from './shared/config';
import { logger } from './shared/logger';
import { connectDatabase, disconnectDatabase } from './shared/database';
import cron from 'node-cron';
import { ProdutoService } from './modules/produtos/service';
import { FinanceiroService } from './modules/financeiro/service';
import { startAlertasScheduler } from './modules/alertas/scheduler';
import { spawn } from 'node:child_process';

// Validar configurações
try {
  validateConfig();
  logger.info('Configurações validadas com sucesso');

  const warnings = getConfigWarnings();
  for (const warning of warnings) {
    logger.warn(warning);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  logger.error('Erro ao validar configurações', { message, stack });
  process.exit(1);
}

// Conectar ao banco
connectDatabase()
  .then(() => {
    // Iniciar servidor
    const server = app.listen(config.port, () => {
      logger.info(`🚀 Servidor rodando na porta ${config.port}`);
      logger.info(`📊 Ambiente: ${config.nodeEnv}`);
      logger.info(`🔗 Health check: http://localhost:${config.port}/health`);
    });

    // Configurar sincronização automática
    if (config.sync.autoStart) {
      if (!config.tiny.apiKey) {
        logger.warn('SYNC_AUTO_START=true, mas TINY_API_KEY está ausente; sync automático não será iniciado.');
      } else {
        logger.info(`⏰ Sync automático configurado: a cada ${config.sync.intervalHours} horas`);

        // Executar a cada X horas
        const cronExpression = `0 */${config.sync.intervalHours} * * *`;

        cron.schedule(cronExpression, async () => {
          logger.info('Iniciando sincronização automática...');

          try {
            const produtoService = new ProdutoService();
            await produtoService.syncProdutosTiny();
            logger.info('Produtos sincronizados');

            const financeiroService = new FinanceiroService();
            await financeiroService.syncContasPagar();
            await financeiroService.syncContasReceber();
            logger.info('Financeiro sincronizado');

            logger.info('Sincronização automática concluída');
          } catch (error) {
            logger.error('Erro na sincronização automática', { error });
          }
        });
      }
    }

    // Alertas automáticos (Slack/email)
    startAlertasScheduler();

    // Automação semanal: recálculo e relatório
    const weeklyEnabled = String(process.env.WEEKLY_AUTOMATION_ENABLED || '').trim().toLowerCase() === 'true';
    if (weeklyEnabled) {
      const recalcCron = String(process.env.RECALC_WEEKLY_CRON || '30 2 * * 0').trim(); // domingo 02:30
      const reportCron = String(process.env.REPORT_WEEKLY_CRON || '0 8 * * 1').trim(); // segunda 08:00

      logger.info(`Weekly automation: habilitada (recalc=${recalcCron}, report=${reportCron})`);

      cron.schedule(recalcCron, async () => {
        try {
          logger.info('Weekly recalc: iniciando (script)');

          const lookbackDaysRaw = Number(process.env.RECALC_LOOKBACK_DAYS || 45);
          const lookbackDays = Number.isFinite(lookbackDaysRaw) ? Math.max(7, Math.min(365, Math.floor(lookbackDaysRaw))) : 45;

          const to = new Date();
          const from = new Date(Date.now() - lookbackDays * 86400 * 1000);
          const fromStr = from.toISOString().slice(0, 10);
          const toStr = to.toISOString().slice(0, 10);

          const includeAnuncios = String(process.env.RECALC_INCLUDE_ANUNCIOS || 'true').trim().toLowerCase() !== 'false';
          const cmd = 'node';
          const args = [
            'dist/scripts/recalculateProfit.js',
            `--from=${fromStr}`,
            `--to=${toStr}`,
            ...(includeAnuncios ? [] : ['--no-anuncios']),
          ];

          const child = spawn(cmd, args, { stdio: 'inherit', env: process.env, cwd: process.cwd() });
          child.on('exit', (code) => {
            logger.info('Weekly recalc: finalizado', { code });
          });
        } catch (e) {
          logger.error('Weekly recalc: erro', { error: e });
        }
      });

      cron.schedule(reportCron, async () => {
        try {
          logger.info('Weekly report: gerando PDF (script)');
          const cmd = 'node';
          const args = ['dist/scripts/weeklyReport.js'];

          const child = spawn(cmd, args, { stdio: 'inherit', env: process.env, cwd: process.cwd() });
          child.on('exit', (code) => {
            logger.info('Weekly report: finalizado', { code });

            // Distribuição (Slack/email) — best-effort; script faz no-op se não houver credenciais.
            try {
              const notify = spawn('node', ['dist/scripts/sendLatestWeeklyReport.js'], {
                stdio: 'inherit',
                env: process.env,
                cwd: process.cwd(),
              });
              notify.on('exit', (notifyCode) => {
                logger.info('Weekly report: distribuição finalizada', { code: notifyCode });
              });
            } catch (e) {
              logger.warn('Weekly report: falha ao iniciar distribuição', { error: e });
            }
          });
        } catch (e) {
          logger.error('Weekly report: erro', { error: e });
        }
      });
    } else {
      logger.info('Weekly automation: desabilitada (WEEKLY_AUTOMATION_ENABLED!=true)');
    }

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} recebido, encerrando servidor...`);

      server.close(async () => {
        logger.info('Servidor HTTP encerrado');

        await disconnectDatabase();
        logger.info('Banco de dados desconectado');

        process.exit(0);
      });

      // Forçar encerramento após 10 segundos
      setTimeout(() => {
        logger.error('Timeout no encerramento, forçando saída');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Tratar erros não capturados
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', {
        reason,
        promise,
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error });
      process.exit(1);
    });
  })
  .catch((error) => {
    logger.error('Erro ao conectar ao banco de dados', { error });
    process.exit(1);
  });
