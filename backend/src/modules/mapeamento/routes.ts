import { Router } from 'express';
import { MapeamentoController } from './controller';

const router = Router();
const controller = new MapeamentoController();

router.get('/pendentes', controller.pendentes);
router.get('/buscar-tiny', controller.buscarTiny);
router.post('/adicionar', controller.adicionar);

export default router;
