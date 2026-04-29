import { Router, Request, Response, NextFunction } from 'express';
import express from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

// ── Advanced search ─────────────────────────────────────────
const searchSchema = z.object({
  q:        z.string().max(200).optional(),
  status:   z.array(z.enum(['open', 'investigating', 'resolved', 'closed'])).optional(),
  severity: z.array(z.enum(['P1', 'P2', 'P3', 'P4'])).optional(),
  tag_ids:  z.array(z.string().uuid()).optional(),
  from:     z.string().datetime().optional(),
  to:       z.string().datetime().optional(),
  commander_id: z.string().uuid().optional(),
  limit:    z.number().int().min(1).max(500).optional(),
});

router.post('/incidents/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = searchSchema.parse(req.body);
    const where: string[] = ['i.tenant_id = $1', 'i.deleted_at IS NULL'];
    const params: any[] = [req.user!.tenantId];

    if (b.q) {
      params.push(`%${b.q}%`);
      where.push(`(i.title ILIKE $${params.length} OR i.description ILIKE $${params.length})`);
    }
    if (b.status?.length)   { params.push(b.status);   where.push(`i.status   = ANY($${params.length}::text[])`); }
    if (b.severity?.length) { params.push(b.severity); where.push(`i.severity = ANY($${params.length}::text[])`); }
    if (b.commander_id)     { params.push(b.commander_id); where.push(`i.commander_id = $${params.length}`); }
    if (b.from)             { params.push(b.from); where.push(`i.created_at >= $${params.length}`); }
    if (b.to)               { params.push(b.to);   where.push(`i.created_at <= $${params.length}`); }
    if (b.tag_ids?.length) {
      params.push(b.tag_ids);
      where.push(`EXISTS (SELECT 1 FROM incident_tags it WHERE it.incident_id = i.id AND it.tag_id = ANY($${params.length}::uuid[]))`);
    }

    const limit = b.limit ?? 100;
    params.push(limit);

    const sql = `
      SELECT i.id, i.title, i.severity, i.status, i.created_at, i.resolved_at,
             u.name AS commander_name
      FROM incidents i
      LEFT JOIN users u ON u.id = i.commander_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.created_at DESC
      LIMIT $${params.length}
    `;
    const { rows } = await db.query(sql, params);
    res.json({ success: true, data: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ── CSV import ──────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  // simple CSV parser supporting quoted fields with commas / escaped quotes
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') { inQ = true; }
      else if (c === ',') { cur.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.length > 1 || cur[0]) rows.push(cur);
        cur = [];
      } else { field += c; }
    }
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

router.post(
  '/incidents/import',
  authorize('owner', 'admin', 'manager'),
  express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }),
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await db.getClient();
    try {
      const text = typeof req.body === 'string' ? req.body : '';
      if (!text.trim()) return res.status(400).json({ success: false, error: 'Empty CSV body' });

      const rows = parseCSV(text);
      if (rows.length < 2) return res.status(400).json({ success: false, error: 'CSV must include header row' });

      const header = rows[0].map(h => h.trim().toLowerCase());
      const idx = (n: string) => header.indexOf(n);
      if (idx('title') === -1 || idx('severity') === -1) {
        return res.status(400).json({ success: false, error: 'CSV must include columns: title, severity' });
      }
      const iTitle = idx('title');
      const iDesc  = idx('description');
      const iSev   = idx('severity');
      const iStat  = idx('status');

      await client.query('BEGIN');
      let imported = 0;
      const errors: Array<{ row: number; error: string }> = [];

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const title = (r[iTitle] ?? '').trim();
        const sev   = (r[iSev]   ?? '').trim().toUpperCase();
        const desc  = iDesc  >= 0 ? (r[iDesc]  ?? '').trim() : '';
        const stat  = iStat  >= 0 ? (r[iStat]  ?? 'open').trim().toLowerCase() : 'open';

        if (!title) { errors.push({ row: i + 1, error: 'missing title' }); continue; }
        if (!['P1','P2','P3','P4'].includes(sev)) { errors.push({ row: i + 1, error: `bad severity "${sev}"` }); continue; }
        if (!['open','investigating','resolved','closed'].includes(stat)) {
          errors.push({ row: i + 1, error: `bad status "${stat}"` }); continue;
        }

        await client.query(
          `INSERT INTO incidents (tenant_id, title, description, severity, status, commander_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6, NOW())`,
          [req.user!.tenantId, title, desc, sev, stat, req.user!.userId]
        );
        imported++;
      }

      await client.query(
        `INSERT INTO audit_logs (tenant_id, user_id, action, resource, metadata)
         VALUES ($1,$2,'incident.import','incident',$3)`,
        [req.user!.tenantId, req.user!.userId, JSON.stringify({ imported, errors: errors.length })]
      );

      await client.query('COMMIT');
      res.json({ success: true, data: { imported, error_count: errors.length, errors: errors.slice(0, 50) } });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  }
);

export default router;
