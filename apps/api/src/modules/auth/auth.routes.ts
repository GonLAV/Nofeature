import { Router } from 'express';
import { register, login, refresh, logout, changePassword, me } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { authLimiter, refreshLimiter } from '../../middleware/rateLimiter';

const router = Router();

router.post('/register',        authLimiter,                  register);
router.post('/login',           authLimiter,                  login);
router.post('/refresh',         refreshLimiter,               refresh);
router.post('/logout',          authenticate,                 logout);
router.post('/change-password', authenticate, authLimiter,    changePassword);
router.get('/me',               authenticate,                 me);

export default router;
