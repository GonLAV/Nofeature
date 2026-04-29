-- ─────────────────────────────────────────────────────────────
-- Migration: 002_runbooks
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS runbooks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  severity    TEXT CHECK (severity IN ('P1','P2','P3','P4')),
  tags        TEXT[] DEFAULT '{}',
  steps       JSONB NOT NULL DEFAULT '[]',
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_runbooks_tenant   ON runbooks(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_runbooks_severity ON runbooks(tenant_id, severity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_runbooks_tags     ON runbooks USING gin(tags);

CREATE TRIGGER trg_runbooks_updated BEFORE UPDATE ON runbooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
