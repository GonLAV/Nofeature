-- ─────────────────────────────────────────────────────────────
-- Migration: 006_sla_links_actions_saved_searches
-- ─────────────────────────────────────────────────────────────

-- ── SLA Targets per severity per tenant ──────────────────────
CREATE TABLE IF NOT EXISTS sla_targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  severity        TEXT NOT NULL CHECK (severity IN ('P1','P2','P3','P4')),
  ack_minutes     INTEGER NOT NULL DEFAULT 15,
  resolve_minutes INTEGER NOT NULL DEFAULT 240,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, severity)
);

-- ── Add acknowledged_at to incidents ─────────────────────────
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id);

-- ── Related Incidents (graph) ────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  src_id       UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  dst_id       UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  relation     TEXT NOT NULL DEFAULT 'related'
               CHECK (relation IN ('related','duplicate','caused-by','blocks')),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (src_id, dst_id, relation),
  CHECK (src_id <> dst_id)
);
CREATE INDEX IF NOT EXISTS idx_incident_links_src ON incident_links (src_id);
CREATE INDEX IF NOT EXISTS idx_incident_links_dst ON incident_links (dst_id);

-- ── Action Items (post-incident followups) ───────────────────
CREATE TABLE IF NOT EXISTS action_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  assignee_id  UUID REFERENCES users(id),
  due_date     DATE,
  status       TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','in_progress','done','cancelled')),
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_action_items_incident ON action_items (incident_id);
CREATE INDEX IF NOT EXISTS idx_action_items_tenant_status ON action_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_action_items_assignee ON action_items (assignee_id);

-- ── Saved Searches (per user) ────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_searches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  filters     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON saved_searches (user_id);
