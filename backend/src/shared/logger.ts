// ==========================================
// SISTEMA MLH - LOGGER
// ==========================================

import axios from 'axios';
import winston from 'winston';
import { config } from './config';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Formato customizado para logs
const customFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let log = `${timestamp} [${level}]: ${message}`;
  
  if (Object.keys(meta).length > 0) {
    log += ` ${JSON.stringify(meta)}`;
  }
  
  if (stack) {
    log += `\n${stack}`;
  }
  
  return log;
});

// Criar logger
export const logger = winston.createLogger({
  level: config.nodeEnv === 'development' ? 'debug' : 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        customFormat
      ),
    }),
  ],
});

// Adicionar arquivo de log em produção
if (config.nodeEnv === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    })
  );
  
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
    })
  );
}

// Helper functions para logs estruturados
export const loggers = {
  sync: {
    start: (tipo: string, origem: string) => {
      logger.info(`Sync iniciado: ${tipo}`, { tipo, origem });
    },
    success: (tipo: string, origem: string, registros: number, duracaoMs: number) => {
      logger.info(`Sync concluído: ${tipo}`, { tipo, origem, registros, duracaoMs });
    },
    error: (tipo: string, origem: string, error: Error) => {
      logger.error(`Sync falhou: ${tipo}`, { tipo, origem, error: error.message, stack: error.stack });
    },
  },
  
  api: {
    request: (method: string, url: string, params?: any) => {
      logger.debug(`API Request: ${method} ${url}`, { method, url, params });
    },
    response: (method: string, url: string, status: number, duracaoMs: number) => {
      logger.debug(`API Response: ${method} ${url} [${status}]`, { method, url, status, duracaoMs });
    },
    error: (method: string, url: string, error: unknown) => {
      const redact = (value: any, depth: number = 0): any => {
        if (depth > 4) return '[truncated]';
        if (value === null || value === undefined) return value;
        if (typeof value === 'string') {
          return value
            .replace(/(access_token=)[^&]+/gi, '$1***')
            .replace(/(refresh_token=)[^&]+/gi, '$1***');
        }
        if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
        if (typeof value === 'object') {
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(value as Record<string, any>)) {
            if (/token|authorization/i.test(k)) {
              out[k] = '***';
            } else {
              out[k] = redact(v, depth + 1);
            }
          }
          return out;
        }
        return value;
      };

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const responseData = error.response?.data;
        logger.error(`API Error: ${method} ${url}`, {
          method,
          url,
          status,
          error: error.message,
          responseData: redact(responseData),
        });
        return;
      }

      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`API Error: ${method} ${url}`, { method, url, error: msg });
    },
  },
  
  database: {
    query: (operation: string, model: string) => {
      logger.debug(`DB Query: ${operation} ${model}`, { operation, model });
    },
    error: (operation: string, model: string, error: Error) => {
      logger.error(`DB Error: ${operation} ${model}`, { operation, model, error: error.message });
    },
  },
};
