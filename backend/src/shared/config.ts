// ==========================================
// SISTEMA MLH - CONFIGURAÇÕES
// ==========================================

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Tiny ERP v3
  tiny: {
    apiKey: process.env.TINY_API_KEY || '',
    baseUrl: process.env.TINY_BASE_URL || 'https://api.tiny.com.br/api/v3',
    timeout: 30000,
    maxRetries: 3,
    rateLimit: {
      maxRequests: 100,
      perMinutes: 1,
    },
  },
  
  // Shopee Open API v2
  shopee: {
    partnerId: parseInt(process.env.SHOPEE_PARTNER_ID || '0', 10),
    partnerKey: process.env.SHOPEE_PARTNER_KEY || '',
    shopId: parseInt(process.env.SHOPEE_SHOP_ID || '0', 10),
    baseUrl: process.env.SHOPEE_BASE_URL || 'https://partner.shopeemobile.com/api/v2',
    timeout: 30000,
    maxRetries: 3,
    rateLimit: {
      maxRequests: 1000,
      perHour: 1,
    },
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'change-me-in-production',
    expiresIn: '24h',
  },
  
  // Sync Settings
  sync: {
    intervalHours: parseInt(process.env.SYNC_INTERVAL_HOURS || '4', 10),
    autoStart: process.env.SYNC_AUTO_START === 'true',
  },
};

// Validar configurações obrigatórias
export function validateConfig(): void {
  const errors: string[] = [];
  
  if (!config.databaseUrl) {
    errors.push('DATABASE_URL não configurada');
  }
  
  if (config.nodeEnv === 'production') {
    if (config.jwt.secret === 'change-me-in-production') {
      errors.push('JWT_SECRET precisa ser alterada em produção');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Erros de configuração:\n${errors.join('\n')}`);
  }
}

export function getConfigWarnings(): string[] {
  const warnings: string[] = [];

  if (config.nodeEnv === 'production') {
    if (!config.tiny.apiKey) {
      warnings.push('TINY_API_KEY não configurada (integração Tiny desabilitada até configurar)');
    }

    if (!config.shopee.partnerId || !config.shopee.partnerKey || !config.shopee.shopId) {
      warnings.push('Credenciais Shopee não configuradas (integração Shopee desabilitada até configurar)');
    } else {
      if (!process.env.SHOPEE_ACCESS_TOKEN || !process.env.SHOPEE_REFRESH_TOKEN) {
        warnings.push(
          'Tokens Shopee ausentes em env vars (SHOPEE_ACCESS_TOKEN/SHOPEE_REFRESH_TOKEN). Se você estiver usando tokens no banco (SHOPEE_TOKEN_USE_DB!=false), ignore; caso contrário, complete o OAuth.'
        );
      }
    }
  }

  return warnings;
}
