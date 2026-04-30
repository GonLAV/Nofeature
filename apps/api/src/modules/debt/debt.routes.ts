import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../middleware/auth';
import { DebtService } from './debt.service';
import { declareDebtSchema, repayDebtSchema } from './debt.schema';
import { ValidationError } from '../../utils/errors';

const router  = Router();
const service = new DebtService();

router.use(authenticate);

router.post('/incidents/:id/debt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = declareDebtSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError({ body: parsed.error.issues.map((i) => i.message) });
    const item = await service.declare({
      tenantId:    req.user!.tenantId,
      incidentId:  req.params.id,
      declaredBy:  req.user!.userId,
      category:    parsed.data.category,
      title:       parsed.data.title,
      description: parsed.data.description,
      surface:     parsed.data.surface,
      principal:   parsed.data.principal,
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.get('/incidents/:id/debt', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await service.listByIncident(req.params.id, req.user!.tenantId);
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.post('/debt/:debtId/repay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = repayDebtSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError({ body: parsed.error.issues.map((i) => i.message) });
    const item = await service.repay({
      tenantId:      req.user!.tenantId,
      debtId:        req.params.debtId,
      repaidBy:      req.user!.userId,
      repaymentUrl:  parsed.data.repaymentUrl,
      repaymentNote: parsed.data.repaymentNote,
    });
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.get('/debt/open', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const items = await service.listOpen(req.user!.tenantId, limit);
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

router.get('/debt/portfolio', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await service.portfolio(req.user!.tenantId);
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

export default router;
