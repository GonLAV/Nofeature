-- ─────────────────────────────────────────────────────────────
-- Migration: 001_initial_schema
-- ─────────────────────────────────────────────────────────────

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Tenants ───────────────────────────────────────────────────
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'starter',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner','admin','manager','member','viewer')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  last_login_ip   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (tenant_id, email)
);

-- ── Incidents ─────────────────────────────────────────────────
CREATE TABLE incidents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK (severity IN ('P1','P2','P3','P4')),
  status           TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','investigating','resolved','closed')),
  commander_id     UUID REFERENCES users(id),
  affected_systems TEXT[] DEFAULT '{}',
  ai_root_cause    TEXT,
  ai_summary       TEXT,
  ai_action_items  JSONB DEFAULT '{}',
  created_by       UUID NOT NULL REFERENCES users(id),
  updated_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  deleted_at       TIMESTAMPTZ
);

-- ── Incident Timeline ─────────────────────────────────────────
CREATE TABLE incident_timeline (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  user_id      UUID REFERENCES users(id),
  action       TEXT NOT NULL,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Audit Log ─────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  action      TEXT NOT NULL,
  resource    TEXT,
  resource_id TEXT,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX idx_users_tenant       ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email        ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_tenant   ON incidents(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_status   ON incidents(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_severity ON incidents(tenant_id, severity) WHERE deleted_at IS NULL;
CREATE INDEX idx_incidents_created  ON incidents(created_at DESC);
CREATE INDEX idx_timeline_incident  ON incident_timeline(incident_id);
CREATE INDEX idx_audit_tenant       ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_user         ON audit_logs(user_id);

-- ── Updated_at trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated   BEFORE UPDATE ON tenants   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated     BEFORE UPDATE ON users     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_incidents_updated BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
