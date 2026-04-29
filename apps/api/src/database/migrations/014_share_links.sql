-- ── Public read-only share links for incidents ──────────────
CREATE TABLE IF NOT EXISTS incident_share_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id   UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  token         UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_by    UUID REFERENCES users(id),
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  view_count    INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_share_links_incident ON incident_share_links (incident_id);
CREATE INDEX IF NOT EXISTS idx_share_links_token    ON incident_share_links (token);
CREATE INDEX IF NOT EXISTS idx_share_links_tenant   ON incident_share_links (tenant_id);
