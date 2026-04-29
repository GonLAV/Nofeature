import { Router } from 'express';
import { pool } from '../../config/database';
import { UserRepository } from '../../database/repositories/userRepository';
import { TenantRepository } from '../../database/repositories/tenantRepository';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();

const userRepo = new UserRepository(pool);
const tenantRepo = new TenantRepository(pool);
const authService = new AuthService(userRepo, tenantRepo);
const authController = new AuthController(authService);

router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authLimiter, authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export { router as authRouter };
