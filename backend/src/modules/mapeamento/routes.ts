import { Router } from 'express';
import { MapeamentoController } from './controller';

const router = Router();
const controller = new MapeamentoController();

router.get('/pendentes', controller.pendentes);
router.get('/listar', controller.listar);
router.get('/buscar-tiny', controller.buscarTiny);
router.post('/adicionar', controller.adicionar);
router.post('/importar', controller.importar);

export default router;
