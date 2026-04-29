import { Router } from 'express';
import { pool } from '../../config/database';
import { UserRepository } from '../../database/repositories/userRepository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { authenticate, requireRole } from '../../middleware/auth';

const router = Router();

const userRepo = new UserRepository(pool);
const usersService = new UsersService(userRepo);
const usersController = new UsersController(usersService);

router.use(authenticate);

router.get('/', usersController.list);
router.get('/:id', usersController.getById);
router.patch('/:id/role', requireRole('admin'), usersController.updateRole);
router.delete('/:id', requireRole('admin'), usersController.deactivate);

export { router as usersRouter };
