import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { list, getOne, create, updateStatus, assignCommander, timeline, remove } from './incident.controller';

const router = Router();
router.use(authenticate);

router.get('/',                    list);
router.post('/',                   create);
router.get('/:id',                 getOne);
router.patch('/:id/status',        updateStatus);
router.patch('/:id/commander',     authorize('admin', 'owner', 'manager'), assignCommander);
router.get('/:id/timeline',        timeline);
router.delete('/:id',              authorize('admin', 'owner'), remove);

export default router;
