// ==========================================
// SISTEMA MLH - DATABASE CONNECTION
// ==========================================

import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Singleton do Prisma Client
let prisma: PrismaClient;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
    
    // Logs de queries em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      prisma.$on('query' as never, (e: any) => {
        logger.debug('Prisma Query', {
          query: e.query,
          params: e.params,
          duration: `${e.duration}ms`,
        });
      });
    }
    
    // Logs de erros
    prisma.$on('warn' as never, (e: any) => {
      logger.warn('Prisma Warning', { message: e.message });
    });
    
    prisma.$on('error' as never, (e: any) => {
      logger.error('Prisma Error', { message: e.message });
    });
    
    logger.info('Prisma Client inicializado');
  }
  
  return prisma;
}

// Conectar ao banco
export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    logger.info('Conectado ao banco de dados PostgreSQL');
  } catch (error) {
    logger.error('Erro ao conectar ao banco de dados', { error });
    throw error;
  }
}

// Desconectar do banco
export async function disconnectDatabase(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
      logger.info('Desconectado do banco de dados');
    }
  } catch (error) {
    logger.error('Erro ao desconectar do banco de dados', { error });
    throw error;
  }
}

// Health check do banco
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Health check do banco falhou', { error });
    return false;
  }
}
