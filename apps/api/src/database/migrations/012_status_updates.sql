-- Stakeholder status updates per incident (broadcast-style messages, separate from comments)
CREATE TABLE IF NOT EXISTS incident_status_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'investigating',
  body TEXT NOT NULL,
  posted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_updates_incident ON incident_status_updates(incident_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_updates_tenant ON incident_status_updates(tenant_id, posted_at DESC);
