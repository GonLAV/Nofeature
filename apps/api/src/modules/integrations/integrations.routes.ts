import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import db from '../../config/database';
import { authenticate, authorize } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const router = Router();
router.use(authenticate);

const linkSchema = z.object({
  provider: z.enum(['jira', 'linear', 'github']),
  external_id: z.string().min(1).max(200),
  external_url: z.string().url(),
  title: z.string().max(500).optional(),
});

// List all links for incident
router.get('/incidents/:id/links', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM integration_links
       WHERE incident_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
      [req.params.id, req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// Create manual link (for any provider, no remote API call)
router.post('/incidents/:id/links', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = linkSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO integration_links (tenant_id, incident_id, provider, external_id, external_url, title, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user!.tenantId, req.params.id, body.provider, body.external_id, body.external_url, body.title ?? null, req.user!.userId]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

router.delete('/links/:linkId', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await db.query('DELETE FROM integration_links WHERE id = $1 AND tenant_id = $2',
      [req.params.linkId, req.user!.tenantId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Provider-specific: create issue from incident (Jira)
router.post('/jira/incidents/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const cfg = await db.query(
      `SELECT config FROM tenant_integrations WHERE tenant_id = $1 AND provider = 'jira' AND is_active = true`,
      [tenantId]
    );
    const inc = await db.query(`SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (!inc.rows[0]) return res.status(404).json({ success: false, error: 'Incident not found' });

    if (!cfg.rows[0]) {
      return res.status(400).json({
        success: false,
        error: 'Jira not configured. Configure tenant_integrations or create a manual link via POST /integrations/incidents/:id/links',
      });
    }

    const { baseUrl, projectKey, email, apiToken } = cfg.rows[0].config;
    const incident = inc.rows[0];

    try {
      const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: `[${incident.severity}] ${incident.title}`,
            description: {
              type: 'doc',
              version: 1,
              content: [{ type: 'paragraph', content: [{ type: 'text', text: incident.description || incident.title }] }],
            },
            issuetype: { name: 'Bug' },
          },
        }),
      });
      if (!response.ok) throw new Error(`Jira API ${response.status}`);
      const data = await response.json() as { key: string; self: string };
      const issueUrl = `${baseUrl}/browse/${data.key}`;
      const { rows } = await db.query(
        `INSERT INTO integration_links (tenant_id, incident_id, provider, external_id, external_url, title, created_by)
         VALUES ($1,$2,'jira',$3,$4,$5,$6) RETURNING *`,
        [tenantId, req.params.id, data.key, issueUrl, incident.title, req.user!.userId]
      );
      res.status(201).json({ success: true, data: rows[0] });
    } catch (e) {
      logger.error('Jira issue create failed', e);
      res.status(502).json({ success: false, error: 'Failed to create Jira issue' });
    }
  } catch (err) { next(err); }
});

// Provider-specific: create issue from incident (Linear)
router.post('/linear/incidents/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const cfg = await db.query(
      `SELECT config FROM tenant_integrations WHERE tenant_id = $1 AND provider = 'linear' AND is_active = true`,
      [tenantId]
    );
    const inc = await db.query(`SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (!inc.rows[0]) return res.status(404).json({ success: false, error: 'Incident not found' });
    if (!cfg.rows[0]) {
      return res.status(400).json({ success: false, error: 'Linear not configured' });
    }
    const { apiKey, teamId } = cfg.rows[0].config;
    const incident = inc.rows[0];

    try {
      const response = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Authorization': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id identifier url title } success } }`,
          variables: {
            input: {
              teamId,
              title: `[${incident.severity}] ${incident.title}`,
              description: incident.description ?? '',
            },
          },
        }),
      });
      const json = await response.json() as { data?: { issueCreate?: { issue?: { id: string; identifier: string; url: string; title: string }; success: boolean } } };
      const issue = json?.data?.issueCreate?.issue;
      if (!issue) throw new Error('Linear API returned no issue');
      const { rows } = await db.query(
        `INSERT INTO integration_links (tenant_id, incident_id, provider, external_id, external_url, title, created_by)
         VALUES ($1,$2,'linear',$3,$4,$5,$6) RETURNING *`,
        [tenantId, req.params.id, issue.identifier, issue.url, issue.title, req.user!.userId]
      );
      res.status(201).json({ success: true, data: rows[0] });
    } catch (e) {
      logger.error('Linear issue create failed', e);
      res.status(502).json({ success: false, error: 'Failed to create Linear issue' });
    }
  } catch (err) { next(err); }
});

// Provider-specific: create GitHub issue from incident
router.post('/github/incidents/:id', authorize('owner', 'admin', 'manager'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const cfg = await db.query(
      `SELECT config FROM tenant_integrations WHERE tenant_id = $1 AND provider = 'github' AND is_active = true`,
      [tenantId]
    );
    const inc = await db.query(`SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId]);
    if (!inc.rows[0]) return res.status(404).json({ success: false, error: 'Incident not found' });
    if (!cfg.rows[0]) return res.status(400).json({ success: false, error: 'GitHub not configured' });
    const { token, owner, repo } = cfg.rows[0].config;
    const incident = inc.rows[0];

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: `[${incident.severity}] ${incident.title}`,
          body: incident.description ?? '',
          labels: ['incident', incident.severity?.toLowerCase()].filter(Boolean),
        }),
      });
      if (!response.ok) throw new Error(`GitHub API ${response.status}`);
      const data = await response.json() as { number: number; html_url: string; title: string };
      const { rows } = await db.query(
        `INSERT INTO integration_links (tenant_id, incident_id, provider, external_id, external_url, title, created_by)
         VALUES ($1,$2,'github',$3,$4,$5,$6) RETURNING *`,
        [tenantId, req.params.id, String(data.number), data.html_url, data.title, req.user!.userId]
      );
      res.status(201).json({ success: true, data: rows[0] });
    } catch (e) {
      logger.error('GitHub issue create failed', e);
      res.status(502).json({ success: false, error: 'Failed to create GitHub issue' });
    }
  } catch (err) { next(err); }
});

// Recent GitHub deploys/PRs (for correlation panel)
router.get('/github/recent-activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const cfg = await db.query(
      `SELECT config FROM tenant_integrations WHERE tenant_id = $1 AND provider = 'github' AND is_active = true`,
      [tenantId]
    );
    if (!cfg.rows[0]) return res.json({ success: true, data: { configured: false, items: [] } });
    const { token, owner, repo } = cfg.rows[0].config;
    try {
      const [prsRes, deploysRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&per_page=10`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/deployments?per_page=10`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        }),
      ]);
      const prs = prsRes.ok ? (await prsRes.json() as Array<{ number: number; title: string; merged_at: string | null; html_url: string; user: { login: string } }>) : [];
      const deploys = deploysRes.ok ? (await deploysRes.json() as Array<{ id: number; ref: string; environment: string; created_at: string }>) : [];
      res.json({
        success: true,
        data: {
          configured: true,
          recent_prs: prs.filter(p => p.merged_at).slice(0, 5),
          recent_deploys: deploys.slice(0, 5),
        },
      });
    } catch (e) {
      logger.error('GitHub fetch failed', e);
      res.json({ success: true, data: { configured: true, items: [], error: 'fetch_failed' } });
    }
  } catch (err) { next(err); }
});

// Manage tenant integration config
router.get('/config', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await db.query(
      `SELECT id, provider, is_active, created_at,
              jsonb_strip_nulls(config - 'apiToken' - 'token' - 'apiKey') AS config
       FROM tenant_integrations WHERE tenant_id = $1`,
      [req.user!.tenantId]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

const configSchema = z.object({
  provider: z.enum(['jira', 'linear', 'github']),
  config: z.record(z.any()),
  is_active: z.boolean().optional(),
});

router.put('/config', authorize('owner', 'admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = configSchema.parse(req.body);
    const { rows } = await db.query(
      `INSERT INTO tenant_integrations (tenant_id, provider, config, is_active)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET config = EXCLUDED.config, is_active = EXCLUDED.is_active, updated_at = NOW()
       RETURNING id, provider, is_active`,
      [req.user!.tenantId, body.provider, body.config, body.is_active ?? true]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

export default router;
