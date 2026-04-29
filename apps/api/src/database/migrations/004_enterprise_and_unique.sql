-- 004_enterprise_and_unique.sql
-- API keys, IP allowlist, outgoing webhooks, data retention,
-- on-call schedules, customer impact, linked incidents, saved filters.

-- ── API keys (service tokens) ────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_hash      TEXT NOT NULL UNIQUE,
  key_prefix    TEXT NOT NULL,
  scopes        TEXT[] NOT NULL DEFAULT '{incidents:read,incidents:write}',
  created_by    UUID REFERENCES users(id),
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_apikeys_tenant ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash) WHERE revoked_at IS NULL;

-- ── IP allowlist ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_allowlist (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cidr          TEXT NOT NULL,
  description   TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ipallow_tenant ON ip_allowlist(tenant_id);

-- ── Outgoing webhooks ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  secret        TEXT,
  events        TEXT[] NOT NULL DEFAULT '{incident.created,incident.resolved}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_status   INTEGER,
  last_attempt_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhooks(tenant_id);

-- ── Data retention settings (per tenant) ─────────────────────
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id     UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  incident_retention_days INTEGER NOT NULL DEFAULT 365,
  audit_retention_days    INTEGER NOT NULL DEFAULT 365,
  ai_chat_retention_days  INTEGER NOT NULL DEFAULT 30,
  require_ip_allowlist    BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── On-call schedules ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oncall_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  rotation_days INTEGER NOT NULL DEFAULT 7,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oncall_shifts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id   UUID NOT NULL REFERENCES oncall_schedules(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shifts_schedule ON oncall_shifts(schedule_id, starts_at);

-- ── Customer impact tracking on incidents ────────────────────
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS customers_affected INTEGER,
  ADD COLUMN IF NOT EXISTS revenue_impact_usd NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS parent_incident_id UUID REFERENCES incidents(id);
CREATE INDEX IF NOT EXISTS idx_incidents_parent ON incidents(parent_incident_id);

-- ── Saved filters ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_filters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  query         JSONB NOT NULL,
  is_shared     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_savedfilters_tenant ON saved_filters(tenant_id);
