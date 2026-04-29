-- Incident watchers (subscriptions)
CREATE TABLE IF NOT EXISTS incident_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(incident_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_watchers_user ON incident_watchers(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_watchers_incident ON incident_watchers(incident_id);
