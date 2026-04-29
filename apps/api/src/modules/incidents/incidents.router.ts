import { Router } from 'express';
import { pool } from '../../config/database';
import { IncidentRepository } from '../../database/repositories/incidentRepository';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

const incidentRepo = new IncidentRepository(pool);
const incidentsService = new IncidentsService(incidentRepo);
const incidentsController = new IncidentsController(incidentsService);

router.use(authenticate);

router.get('/', incidentsController.list);
router.post('/', incidentsController.create);
router.get('/:id', incidentsController.getById);
router.patch('/:id/status', requireRole('member'), incidentsController.updateStatus);
router.patch('/:id/commander', requireRole('admin'), incidentsController.updateCommander);
router.get('/:id/timeline', incidentsController.getTimeline);
router.delete('/:id', requireRole('admin'), incidentsController.delete);

export { router as incidentsRouter };
