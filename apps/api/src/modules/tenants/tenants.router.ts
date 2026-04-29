import { Router } from 'express';
import { pool } from '../../config/database';
import { TenantRepository } from '../../database/repositories/tenantRepository';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

const tenantRepo = new TenantRepository(pool);
const tenantsService = new TenantsService(tenantRepo);
const tenantsController = new TenantsController(tenantsService);

router.use(authenticate);

router.get('/me', tenantsController.getMyTenant);
router.get('/:id', tenantsController.getById);

export { router as tenantsRouter };
