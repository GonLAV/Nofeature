-- Postmortems
CREATE TABLE IF NOT EXISTS postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft', -- draft | review | published
  summary TEXT,
  impact TEXT,
  root_cause TEXT,
  what_went_well TEXT,
  what_went_wrong TEXT,
  timeline JSONB DEFAULT '[]',
  lessons TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(incident_id)
);
CREATE INDEX IF NOT EXISTS idx_postmortems_tenant ON postmortems(tenant_id);
CREATE INDEX IF NOT EXISTS idx_postmortems_status ON postmortems(tenant_id, status);
