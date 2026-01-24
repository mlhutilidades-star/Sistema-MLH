// ==========================================
// MÓDULO PRODUTOS - ROUTES
// ==========================================

import { Router } from 'express';
import { ProdutoController } from './controller';

const router = Router();
const controller = new ProdutoController();

/**
 * GET /produtos
 * Listar produtos com filtros opcionais
 * Query params: ativo, sku, descricao
 */
router.get('/', controller.listar);

/**
 * GET /produtos/:id
 * Obter produto por ID
 */
router.get('/:id', controller.obter);

/**
 * GET /produtos/sku/:sku
 * Obter produto por SKU
 */
router.get('/sku/:sku', controller.obterPorSku);

/**
 * POST /produtos/sync/tiny
 * Sincronizar produtos do Tiny ERP
 */
router.post('/sync/tiny', controller.syncTiny);

/**
 * POST /produtos/sync/shopee
 * Sincronizar produtos do Shopee
 * Body: { accessToken: string }
 */
router.post('/sync/shopee', controller.syncShopee);

/**
 * PATCH /produtos/:id/custo
 * Atualizar custo real de um produto
 * Body: { custoReal: number }
 */
router.patch('/:id/custo', controller.atualizarCusto);

export default router;
