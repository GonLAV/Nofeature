import { Router, Request, Response, NextFunction } from 'express';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate, authorize('owner', 'admin'));

// GET /audit
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, action, resource, limit = '50', offset = '0' } = req.query;
    const conds = ['tenant_id = $1'];
    const vals: unknown[] = [req.user!.tenantId];
    let i = 2;
    if (user_id)  { conds.push(`user_id = $${i++}`);  vals.push(user_id); }
    if (action)   { conds.push(`action = $${i++}`);    vals.push(action); }
    if (resource) { conds.push(`resource = $${i++}`);  vals.push(resource); }

    const lim = Math.min(parseInt(String(limit), 10) || 50, 200);
    const off = parseInt(String(offset), 10) || 0;
    vals.push(lim, off);

    const where = conds.join(' AND ');
    const { rows } = await db.query(
      `SELECT a.id, a.action, a.resource, a.resource_id, a.ip_address, a.metadata, a.created_at,
              u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${where}
       ORDER BY a.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      vals
    );
    const count = await db.query(`SELECT COUNT(*) FROM audit_logs WHERE ${where}`, vals.slice(0, -2));
    res.json({ success: true, data: { logs: rows, total: parseInt(count.rows[0].count, 10) } });
  } catch (err) { next(err); }
});

// CSV export
router.get('/export.csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = Math.min(parseInt(String(req.query.days ?? '90'), 10) || 90, 365);
    const { rows } = await db.query(
      `SELECT a.created_at, u.email AS user_email, a.action, a.resource, a.resource_id, a.ip_address,
              a.metadata::text AS metadata
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.tenant_id = $1 AND a.created_at >= NOW() - ($2 || ' days')::interval
       ORDER BY a.created_at DESC`,
      [req.user!.tenantId, days]
    );
    const escape = (v: unknown): string => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = 'timestamp,user,action,resource,resource_id,ip,metadata\n';
    const body = rows.map((r) => [
      r.created_at.toISOString(), r.user_email ?? '', r.action, r.resource ?? '',
      r.resource_id ?? '', r.ip_address ?? '', r.metadata ?? ''
    ].map(escape).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(header + body);
  } catch (err) { next(err); }
});

export default router;
