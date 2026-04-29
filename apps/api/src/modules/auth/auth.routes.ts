import { Router } from 'express';
import { register, login, refresh, logout, me } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login',    authLimiter, login);
router.post('/refresh',  refresh);
router.post('/logout',   authenticate, logout);
router.get('/me',        authenticate, me);

export default router;
