-- 016_cognitive_debt.sql
-- Cognitive Debt Ledger.
--
-- An append-only balance sheet of shortcuts taken to resolve
-- incidents. Each entry accrues interest with time, severity, and
-- exposure surface until explicitly repaid by linking the PR or
-- runbook change that actually fixed the underlying issue.

CREATE TABLE IF NOT EXISTS debt_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  incident_id              UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  declared_by              UUID REFERENCES users(id),
  declared_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  category                 TEXT NOT NULL CHECK (category IN (
    'rate_limit_raised','feature_flag_flipped','retry_added',
    'capacity_scaled','alert_silenced','monkey_patch','config_override',
    'data_repaired','rollback','other'
  )),
  title                    TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description              TEXT,
  surface                  INT  NOT NULL DEFAULT 1 CHECK (surface BETWEEN 1 AND 5),
  principal                REAL NOT NULL DEFAULT 1 CHECK (principal BETWEEN 0 AND 100),
  severity_at_declaration  TEXT NOT NULL CHECK (severity_at_declaration IN ('P1','P2','P3','P4')),

  -- Repayment
  repaid_at                TIMESTAMPTZ,
  repaid_by                UUID REFERENCES users(id),
  repayment_url            TEXT,
  repayment_note           TEXT,

  schema_version           SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_debt_tenant_open
  ON debt_items (tenant_id, repaid_at)
  WHERE repaid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_debt_incident
  ON debt_items (incident_id, declared_at DESC);

CREATE INDEX IF NOT EXISTS idx_debt_category
  ON debt_items (tenant_id, category);
