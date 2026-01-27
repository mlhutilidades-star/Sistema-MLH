// ==========================================
// MÓDULO PRODUTOS - ROUTES
// ==========================================

import { Router } from 'express';
import { ProdutoController } from './controller';
import { UploadService } from './uploadService';

const router = Router();
const controller = new ProdutoController();
const uploadService = new UploadService();
const upload = uploadService.upload;

function requireAdmin(req: any): void {
	const secret = process.env.OAUTH_ADMIN_SECRET;
	if (!secret) {
		throw new Error('OAUTH_ADMIN_SECRET não configurado');
	}

	const provided = req.header?.('x-admin-secret');
	if (!provided || provided !== secret) {
		throw new Error('Acesso negado');
	}
}

/**
 * GET /produtos
 * Listar produtos com filtros opcionais
 * Query params: ativo, sku, descricao
 */
router.get('/', controller.listar);

/**
 * POST /produtos/preview-planilha
 * Preview de planilha (primeiras linhas válidas)
 * multipart/form-data: planilha
 * Header: x-admin-secret
 */
router.post(
	'/preview-planilha',
	upload.single('planilha'),
	async (req, res, next) => {
		try {
			requireAdmin(req);

			const file = (req as any).file as Express.Multer.File | undefined;
			if (!file) {
				return res.status(400).json({ success: false, error: 'Arquivo não enviado' });
			}

			const tipo = uploadService.detectTipo(file.mimetype, file.originalname);
			const parsed = await uploadService.processarPlanilha(file.buffer, tipo);

			return res.json({
				success: true,
				tipo,
				totalLinhas: parsed.totalLinhas,
				validos: parsed.validos.length,
				rejeitados: parsed.rejeitados.length,
				preview: parsed.validos.slice(0, 10),
				amostraRejeitados: parsed.rejeitados.slice(0, 10),
				colunas: ['sku', 'descricao', 'custoMedio', 'precoCusto', 'estoque'],
			});
		} catch (error) {
			next(error);
		}
	},
);

/**
 * POST /produtos/upload-planilha
 * Processa a planilha e atualiza custos no banco
 * multipart/form-data: planilha
 * Header: x-admin-secret
 */
router.post(
	'/upload-planilha',
	upload.single('planilha'),
	async (req, res, next) => {
		try {
			requireAdmin(req);

			const file = (req as any).file as Express.Multer.File | undefined;
			if (!file) {
				return res.status(400).json({ success: false, error: 'Arquivo não enviado' });
			}

			const tipo = uploadService.detectTipo(file.mimetype, file.originalname);
			const parsed = await uploadService.processarPlanilha(file.buffer, tipo);
			const resultados = await uploadService.atualizarCustos(parsed.validos);

			return res.json({
				success: true,
				tipo,
				totalLinhas: parsed.totalLinhas,
				validos: parsed.validos.length,
				rejeitados: parsed.rejeitados.length,
				resultados,
				mensagem: 'Planilha processada com sucesso. Custos atualizados!',
			});
		} catch (error) {
			next(error);
		}
	},
);

/**
 * GET /produtos/:id
 * Obter produto por ID
 */
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

/**
 * PATCH /produtos/:id/preco-venda
 * Atualizar precoVenda de um produto
 * Body: { precoVenda: number }
 * Header: x-admin-secret
 */
router.patch('/:id/preco-venda', async (req, res, next) => {
	try {
		requireAdmin(req);
		return controller.atualizarPrecoVenda(req as any, res as any, next as any);
	} catch (error) {
		next(error);
	}
});

/**
 * GET /produtos/:id
 * Obter produto por ID
 */
router.get('/:id', controller.obter);

export default router;
