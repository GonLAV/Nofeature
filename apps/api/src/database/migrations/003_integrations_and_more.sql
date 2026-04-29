-- 003_integrations_and_more.sql
-- Jira/Linear/GitHub integration links, maintenance windows, templates, custom severity

-- ── External issue links (Jira/Linear/GitHub) ────────────────
CREATE TABLE IF NOT EXISTS integration_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id   UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('jira','linear','github')),
  external_id   TEXT NOT NULL,
  external_url  TEXT NOT NULL,
  title         TEXT,
  status        TEXT,
  metadata      JSONB DEFAULT '{}',
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_intlinks_incident ON integration_links(incident_id);
CREATE INDEX IF NOT EXISTS idx_intlinks_tenant ON integration_links(tenant_id, provider);

-- ── Tenant integration credentials ───────────────────────────
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('jira','linear','github')),
  config        JSONB NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, provider)
);

-- ── Maintenance windows ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_windows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  affected_systems TEXT[] DEFAULT '{}',
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  notify_status_page BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant ON maintenance_windows(tenant_id, starts_at);

-- ── Incident templates ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  default_severity TEXT,
  default_title TEXT,
  default_description TEXT,
  default_systems TEXT[] DEFAULT '{}',
  checklist     JSONB DEFAULT '[]',
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON incident_templates(tenant_id);

-- ── Custom severity definitions ──────────────────────────────
CREATE TABLE IF NOT EXISTS severity_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  color         TEXT NOT NULL DEFAULT '#6b7280',
  sla_minutes   INTEGER NOT NULL DEFAULT 480,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
