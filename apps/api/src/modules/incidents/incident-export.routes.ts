import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { db } from '../../config/database';

const router = Router();
router.use(authenticate);

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : (v instanceof Date ? v.toISOString() : JSON.stringify(v));
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const COLS: Array<[string, (r: any) => any]> = [
  ['id',              r => r.id],
  ['number',          r => r.incident_number],
  ['title',           r => r.title],
  ['description',     r => r.description],
  ['severity',        r => r.severity],
  ['status',          r => r.status],
  ['commander',       r => r.commander_name || ''],
  ['commander_email', r => r.commander_email || ''],
  ['created_at',      r => r.created_at?.toISOString?.() ?? r.created_at],
  ['acknowledged_at', r => r.acknowledged_at?.toISOString?.() ?? r.acknowledged_at ?? ''],
  ['resolved_at',     r => r.resolved_at?.toISOString?.() ?? r.resolved_at ?? ''],
  ['closed_at',       r => r.closed_at?.toISOString?.() ?? r.closed_at ?? ''],
];

router.get('/incidents/export', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId;
  const format = (req.query.format as string) === 'json' ? 'json' : 'csv';
  const status = req.query.status as string | undefined;
  const severity = req.query.severity as string | undefined;
  const search = req.query.search as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const where: string[] = ['i.tenant_id = $1'];
  const params: any[] = [tenantId];

  if (status) {
    const list = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) {
      params.push(list);
      where.push(`i.status = ANY($${params.length}::text[])`);
    }
  }
  if (severity) {
    const list = severity.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length) {
      params.push(list);
      where.push(`i.severity = ANY($${params.length}::text[])`);
    }
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(i.title ILIKE $${params.length} OR i.description ILIKE $${params.length})`);
  }
  if (from) {
    params.push(from);
    where.push(`i.created_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`i.created_at <= $${params.length}`);
  }

  const sql = `
    SELECT i.id, i.incident_number, i.title, i.description, i.severity, i.status,
           i.created_at, i.acknowledged_at, i.resolved_at, i.closed_at,
           u.name AS commander_name, u.email AS commander_email
    FROM incidents i
    LEFT JOIN users u ON u.id = i.commander_id
    WHERE ${where.join(' AND ')}
    ORDER BY i.created_at DESC
    LIMIT 5000
  `;

  const { rows } = await db.query(sql, params);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="incidents-${stamp}.json"`);
    res.send(JSON.stringify(rows, null, 2));
    return;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="incidents-${stamp}.csv"`);
  const header = COLS.map(([h]) => h).join(',');
  const lines = [header];
  for (const r of rows) {
    lines.push(COLS.map(([, fn]) => csvEscape(fn(r))).join(','));
  }
  res.send(lines.join('\r\n'));
});

export default router;
