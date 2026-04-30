import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { TreasuryService } from './treasury.service';
import { createAccountSchema, txSchema } from './treasury.schema';
import { ValidationError } from '../../utils/errors';

const router  = Router();
const service = new TreasuryService();

router.use(authenticate);

router.get('/treasury/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.dashboard(req.user!.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/treasury/accounts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.listAccounts(req.user!.tenantId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/treasury/accounts', authorize('admin', 'manager', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError({ body: parsed.error.issues.map((i) => i.message) });
    const account = await service.createAccount({
      tenantId:    req.user!.tenantId,
      serviceName: parsed.data.serviceName,
      sloTarget:   parsed.data.sloTarget,
      windowDays:  parsed.data.windowDays,
    });
    res.status(201).json({ success: true, data: account });
  } catch (err) { next(err); }
});

router.get('/treasury/accounts/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getAccount(req.user!.tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/treasury/accounts/:id/ledger', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const data = await service.ledger(req.user!.tenantId, req.params.id, limit);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/treasury/accounts/:id/withdraw', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = txSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError({ body: parsed.error.issues.map((i) => i.message) });
    const data = await service.withdraw({
      tenantId:   req.user!.tenantId,
      accountId:  req.params.id,
      actorId:    req.user!.userId,
      minutes:    parsed.data.minutes,
      incidentId: parsed.data.incidentId,
      note:       parsed.data.note,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/treasury/accounts/:id/deposit', authorize('admin', 'manager', 'owner'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = txSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError({ body: parsed.error.issues.map((i) => i.message) });
    const data = await service.deposit({
      tenantId:   req.user!.tenantId,
      accountId:  req.params.id,
      actorId:    req.user!.userId,
      minutes:    parsed.data.minutes,
      incidentId: parsed.data.incidentId,
      note:       parsed.data.note,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
