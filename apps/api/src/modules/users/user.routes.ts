import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRepository } from './user.repository';

const inviteSchema = z.object({
  email: z.string().email(),
  name:  z.string().min(1).max(100),
  role:  z.enum(['admin', 'manager', 'member', 'viewer']),
});

function randomPassword(len = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const router = Router();
const userRepo = new UserRepository();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await userRepo.findByTenant(req.user!.tenantId);
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// POST /users/invite — admin creates a new team member, gets back a temp password
router.post('/invite', authorize('admin', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, role } = inviteSchema.parse(req.body);
    const tempPassword = randomPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const user = await userRepo.create({ email, name, role, tenantId: req.user!.tenantId, passwordHash });
    // Temp password returned once so admin can share it with the invitee
    res.status(201).json({ success: true, data: { id: user.id, email: user.email, name: user.name, role: user.role, tempPassword } });
  } catch (err) { next(err); }
});

router.patch('/:id', authorize('admin', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await userRepo.update(req.params.id, req.user!.tenantId, req.body);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('admin', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await userRepo.softDelete(req.params.id, req.user!.tenantId);
    res.json({ success: true, message: 'User removed' });
  } catch (err) { next(err); }
});

export default router;
