// ==========================================
// SISTEMA MLH - APP EXPRESS
// ==========================================

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Routes
import produtosRoutes from './modules/produtos/routes';
import financeiroRoutes from './modules/financeiro/routes';
import adsRoutes from './modules/ads/routes';
import conciliacaoRoutes from './modules/conciliacao/routes';
import shopeeRoutes from './modules/shopee/routes';
import relatoriosRoutes from './modules/relatorios/routes';
import mapeamentoRoutes from './modules/mapeamento/routes';
import { mapeamentoUiHandler } from './modules/mapeamento/ui';
import { produtosUploadUiHandler } from './modules/produtos/uploadUi';
import { dashboardUiHandler } from './modules/dashboard/ui';
import otimizacaoRoutes from './modules/otimizacao/routes';
import pedidosRoutes from './modules/pedidos/routes';

// Shared
import { logger } from './shared/logger';
import { checkDatabaseHealth } from './shared/database';

const app = express();

// Railway/Reverse proxies: trust X-Forwarded-* headers
// Required for correct client IP detection and to avoid express-rate-limit warnings.
app.set('trust proxy', 1);

// ==========================================
// MIDDLEWARES
// ==========================================

// Segurança
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por IP
  message: 'Muitas requisições deste IP, tente novamente mais tarde',
  skip: (req) => {
    const path = req.path || '';
    // Permitir OAuth da Shopee sem bloqueio para facilitar o fluxo de autorização.
    // Observação: `req.path` aqui é relativo ao mount `/api/`.
    if (path.startsWith('/shopee/oauth/')) return true;
    return false;
  },
});

app.use('/api/', limiter);

// Logging de requests
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const dbHealthy = await checkDatabaseHealth();

    const health = {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbHealthy ? 'connected' : 'disconnected',
      memory: process.memoryUsage(),
    };

    res.status(dbHealthy ? 200 : 503).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
});

// ==========================================
// ROUTES
// ==========================================

app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Sistema MLH API',
    version: '1.0.0',
    description: 'Integração Tiny ERP v3 + Shopee Open API v2',
    endpoints: {
      health: '/health',
      produtos: '/api/produtos',
      financeiro: '/api/financeiro',
      ads: '/api/ads',
      conciliacao: '/api/conciliacao',
      mapeamento: '/api/mapeamento',
    },
  });
});

// UI simples para mapeamento SKU (usa API com x-admin-secret)
app.get('/mapeamento', mapeamentoUiHandler);

// UI simples para upload de planilha Tiny (custos)
app.get('/produtos/upload', produtosUploadUiHandler);

// Dashboard (saúde do negócio)
app.get('/dashboard', dashboardUiHandler);

app.use('/api/produtos', produtosRoutes);
app.use('/api/financeiro', financeiroRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/conciliacao', conciliacaoRoutes);
app.use('/api/shopee', shopeeRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/mapeamento', mapeamentoRoutes);
app.use('/api/otimizacao', otimizacaoRoutes);
app.use('/api/pedidos', pedidosRoutes);

// ==========================================
// ERROR HANDLING
// ==========================================

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint não encontrado',
    path: req.path,
  });
});

// Global error handler
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Erro não tratado', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : error.message,
  });
});

export default app;
