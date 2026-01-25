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

export default router;
