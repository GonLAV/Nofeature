import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { UserRepository } from './user.repository';

const router = Router();
const userRepo = new UserRepository();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await userRepo.findByTenant(req.user!.tenantId);
    res.json({ success: true, data: users });
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
