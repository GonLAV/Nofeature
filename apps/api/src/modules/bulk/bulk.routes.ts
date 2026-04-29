import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();
router.use(authenticate);

const baseSchema = z.object({
  incident_ids: z.array(z.string().uuid()).min(1).max(200),
});

const closeSchema = baseSchema.extend({
  action: z.literal('close'),
});

const assignSchema = baseSchema.extend({
  action: z.literal('assign'),
  user_id: z.string().uuid(),
});

const severitySchema = baseSchema.extend({
  action: z.literal('severity'),
  severity: z.enum(['P1', 'P2', 'P3', 'P4']),
});

const tagSchema = baseSchema.extend({
  action: z.literal('tag'),
  tag_ids: z.array(z.string().uuid()).min(1).max(20),
});

const bulkSchema = z.discriminatedUnion('action', [closeSchema, assignSchema, severitySchema, tagSchema]);

router.post('/incidents/bulk', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  const client = await db.getClient();
  try {
    const b = bulkSchema.parse(req.body);
    await client.query('BEGIN');

    let updated = 0;

    if (b.action === 'close') {
      const r = await client.query(
        `UPDATE incidents SET status = 'closed', resolved_at = COALESCE(resolved_at, NOW()), updated_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND status <> 'closed'`,
        [req.user!.tenantId, b.incident_ids]
      );
      updated = r.rowCount ?? 0;
    } else if (b.action === 'assign') {
      const r = await client.query(
        `UPDATE incidents SET commander_id = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [req.user!.tenantId, b.incident_ids, b.user_id]
      );
      updated = r.rowCount ?? 0;
    } else if (b.action === 'severity') {
      const r = await client.query(
        `UPDATE incidents SET severity = $3, updated_at = NOW()
         WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [req.user!.tenantId, b.incident_ids, b.severity]
      );
      updated = r.rowCount ?? 0;
    } else if (b.action === 'tag') {
      // verify all tags belong to tenant
      const tagOk = await client.query(
        `SELECT COUNT(*)::int AS n FROM tags WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [req.user!.tenantId, b.tag_ids]
      );
      if (tagOk.rows[0].n !== b.tag_ids.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, error: 'Invalid tag id(s)' });
      }
      // verify incidents belong to tenant
      const incOk = await client.query(
        `SELECT id FROM incidents WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [req.user!.tenantId, b.incident_ids]
      );
      const validIds: string[] = incOk.rows.map((r: any) => r.id);
      for (const incidentId of validIds) {
        for (const tagId of b.tag_ids) {
          await client.query(
            `INSERT INTO incident_tags (incident_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [incidentId, tagId]
          );
        }
      }
      updated = validIds.length;
    }

    // audit
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, resource, metadata)
       VALUES ($1,$2,$3,'incident',$4)`,
      [
        req.user!.tenantId,
        req.user!.userId,
        `bulk_${b.action}`,
        JSON.stringify({ ...b }),
      ]
    );

    await client.query('COMMIT');
    res.json({ success: true, data: { updated } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

export default router;
