import { Router, Request, Response, NextFunction } from 'express';
import db from '../../config/database';
import { NotFoundError } from '../../utils/errors';

const router = Router();

/**
 * Public status page endpoint — no auth.
 * GET /api/v1/public/status/:slug
 */
router.get('/status/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { slug } = req.params;

    const tenantRes = await db.query(
      `SELECT id, name, slug FROM tenants WHERE slug = $1 AND is_active = true LIMIT 1`,
      [slug]
    );
    const tenant = tenantRes.rows[0];
    if (!tenant) throw new NotFoundError('Status page not found');

    // Active (open / investigating) incidents
    const activeRes = await db.query(
      `SELECT id, title, severity, status, affected_systems, created_at, updated_at
       FROM incidents
       WHERE tenant_id = $1
         AND status IN ('open','investigating')
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [tenant.id]
    );

    // Attach latest stakeholder updates per active incident
    const activeIds = activeRes.rows.map((i: any) => i.id);
    let updatesByIncident: Record<string, any[]> = {};
    if (activeIds.length > 0) {
      const upRes = await db.query(
        `SELECT incident_id, status, body, posted_at
           FROM incident_status_updates
          WHERE tenant_id = $1 AND incident_id = ANY($2::uuid[])
          ORDER BY posted_at DESC`,
        [tenant.id, activeIds]
      );
      for (const u of upRes.rows) {
        (updatesByIncident[u.incident_id] ||= []).push({
          status: u.status,
          body: u.body,
          posted_at: u.posted_at,
        });
      }
      for (const inc of activeRes.rows as any[]) {
        inc.updates = (updatesByIncident[inc.id] || []).slice(0, 10);
      }
    }

    // Recent history (last 90 days, resolved/closed)
    const historyRes = await db.query(
      `SELECT id, title, severity, status, created_at, resolved_at
       FROM incidents
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND created_at >= NOW() - INTERVAL '90 days'
       ORDER BY created_at DESC
       LIMIT 50`,
      [tenant.id]
    );

    // Simple uptime: % of last 90 days without an active P1
    const downtimeRes = await db.query(
      `SELECT
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at))), 0)::bigint AS downtime_seconds
       FROM incidents
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND severity = 'P1'
         AND created_at >= NOW() - INTERVAL '90 days'`,
      [tenant.id]
    );
    const totalSeconds = 90 * 24 * 60 * 60;
    const downtime = Number(downtimeRes.rows[0].downtime_seconds) || 0;
    const uptimePct = Math.max(0, Math.min(100, ((totalSeconds - downtime) / totalSeconds) * 100));

    const overall =
      activeRes.rows.some((i) => i.severity === 'P1') ? 'major_outage'
      : activeRes.rows.some((i) => i.severity === 'P2') ? 'partial_outage'
      : activeRes.rows.length > 0 ? 'degraded'
      : 'operational';

    res.json({
      success: true,
      data: {
        tenant: { name: tenant.name, slug: tenant.slug },
        overall,
        uptime_90d: Number(uptimePct.toFixed(3)),
        active_incidents: activeRes.rows,
        recent_incidents: historyRes.rows,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// Public: tiny status badge JSON for embed widget
// GET /api/v1/public/status/:slug/badge.json
router.get('/status/:slug/badge.json', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantRes = await db.query(
      `SELECT id, name FROM tenants WHERE slug=$1 AND is_active=true LIMIT 1`,
      [req.params.slug]
    );
    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'not found' });
    }
    const tenant = tenantRes.rows[0];
    const a = await db.query(
      `SELECT severity FROM incidents
        WHERE tenant_id=$1 AND status IN ('open','investigating','monitoring')
          AND deleted_at IS NULL`,
      [tenant.id]
    );
    const overall =
      a.rows.some((i: any) => i.severity === 'P1') ? 'major_outage'
      : a.rows.some((i: any) => i.severity === 'P2') ? 'partial_outage'
      : a.rows.length > 0 ? 'degraded'
      : 'operational';
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      success: true,
      data: { tenant: tenant.name, overall, active: a.rows.length, updated_at: new Date().toISOString() },
    });
  } catch (err) { next(err); }
});

// Public: subscribe to email updates
// POST /api/v1/public/status/:slug/subscribe { email }
router.post('/status/:slug/subscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'invalid email' });
    }
    const t = await db.query(
      `SELECT id FROM tenants WHERE slug=$1 AND is_active=true LIMIT 1`,
      [req.params.slug]
    );
    if (t.rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });

    const r = await db.query(
      `INSERT INTO status_subscribers (tenant_id, email)
         VALUES ($1, $2)
         ON CONFLICT (tenant_id, email) DO UPDATE SET email = EXCLUDED.email
         RETURNING confirm_token, confirmed`,
      [t.rows[0].id, email]
    );
    return res.json({
      success: true,
      data: { ok: true, already_confirmed: r.rows[0].confirmed, confirm_token: r.rows[0].confirm_token },
    });
  } catch (err) { next(err); }
});

// Public: confirm subscription
// GET /api/v1/public/status/subscribe/confirm?token=...
router.get('/status/subscribe/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.query.token ?? '');
    const r = await db.query(
      `UPDATE status_subscribers
          SET confirmed=true, confirmed_at=NOW()
        WHERE confirm_token=$1 AND confirmed=false
        RETURNING id`,
      [token]
    );
    if (r.rowCount === 0) return res.status(400).json({ success: false, error: 'invalid or used token' });
    return res.json({ success: true, data: { confirmed: true } });
  } catch (err) { next(err); }
});

// Public: unsubscribe
// GET /api/v1/public/status/subscribe/unsubscribe?token=...
router.get('/status/subscribe/unsubscribe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = String(req.query.token ?? '');
    const r = await db.query(
      `DELETE FROM status_subscribers WHERE unsubscribe_token=$1`,
      [token]
    );
    if (r.rowCount === 0) return res.status(400).json({ success: false, error: 'invalid token' });
    return res.json({ success: true, data: { unsubscribed: true } });
  } catch (err) { next(err); }
});

// Public: embed widget JS — drop-in <script src="…/status/:slug/embed.js" data-target="#status"></script>
router.get('/status/:slug/embed.js', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const slug = req.params.slug;
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const base = `${proto}://${host}/api/v1/public/status/${encodeURIComponent(slug)}`;
    const js = `(function(){
  var COLOR={operational:"#10b981",degraded:"#f59e0b",partial_outage:"#ef4444",major_outage:"#dc2626"};
  var LABEL={operational:"All systems operational",degraded:"Degraded performance",partial_outage:"Partial outage",major_outage:"Major outage"};
  function render(d, host){
    var c=COLOR[d.overall]||"#6b7280", l=LABEL[d.overall]||d.overall;
    host.innerHTML='<a href="'+location.origin+'/status/${slug}" target="_blank" style="display:inline-flex;align-items:center;gap:.5rem;padding:.4rem .75rem;border-radius:.4rem;font:500 13px system-ui,sans-serif;color:#fff;background:'+c+';text-decoration:none">'
      +'<span style="display:inline-block;width:.55rem;height:.55rem;border-radius:50%;background:#fff"></span>'
      +'<span>'+l+(d.active?' ('+d.active+')':'')+'</span></a>';
  }
  function init(){
    var sel=(document.currentScript&&document.currentScript.getAttribute("data-target"))||"#status-badge";
    var host=document.querySelector(sel); if(!host) return;
    fetch(${JSON.stringify(base)}+"/badge.json").then(function(r){return r.json()}).then(function(j){if(j&&j.data) render(j.data, host)}).catch(function(){});
  }
  if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",init)}else{init()}
})();`;
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(js);
  } catch (err) { next(err); }
});

export default router;
