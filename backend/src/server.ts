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
