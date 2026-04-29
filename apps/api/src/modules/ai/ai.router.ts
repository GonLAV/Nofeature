import { Router } from 'express';
import { pool } from '../../config/database';
import { IncidentRepository } from '../../database/repositories/incidentRepository';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

const incidentRepo = new IncidentRepository(pool);
const aiService = new AiService(incidentRepo);
const aiController = new AiController(aiService);

router.use(authenticate);

router.post('/incidents/:id/analyze', aiController.analyze);
router.get('/incidents/:id/postmortem', aiController.postmortem);
router.get('/incidents/:id/suggest-responders', aiController.suggestResponders);

export { router as aiRouter };
