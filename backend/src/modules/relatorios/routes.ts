import { Router } from 'express';
import { RelatoriosController } from './controller';

const router = Router();
const controller = new RelatoriosController();

// Requisitado: lista simples
router.get('/margem', controller.margem);

// Extras (relatórios simples)
router.get('/lucro-pedidos', controller.lucroPedidos);
router.get('/lucro-produtos', controller.lucroProdutos);
router.get('/lucro-anuncios', controller.lucroAnuncios);
router.get('/lucro-total', controller.lucroTotal);

// Novo: top SKUs por lucro
router.get('/top-lucro', controller.topLucro);

export default router;
