-- 016_reliability_treasury.sql
-- Reliability Treasury: error budget as a financial account.
--
-- Each (tenant, service_name) maintains a balance of remaining
-- error-budget minutes inside a rolling window. Every withdrawal,
-- deposit, or interest credit is recorded as an immutable ledger
-- row so the dashboard can audit how the balance moved.

CREATE TABLE IF NOT EXISTS treasury_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_name    TEXT NOT NULL CHECK (length(service_name) BETWEEN 1 AND 120),
  slo_target      REAL NOT NULL CHECK (slo_target > 0 AND slo_target < 1),
  window_days     INT  NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 1 AND 365),
  -- Total budget in minutes for the window.
  -- e.g. 99.9% over 30d -> 30*24*60 * (1 - 0.999) = 43.2 minutes.
  budget_minutes  REAL NOT NULL CHECK (budget_minutes >= 0),
  balance_minutes REAL NOT NULL CHECK (balance_minutes >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_version  SMALLINT NOT NULL DEFAULT 1,
  UNIQUE (tenant_id, service_name)
);

CREATE TABLE IF NOT EXISTS treasury_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES treasury_accounts(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('withdrawal','deposit','interest','adjustment')),
  minutes       REAL NOT NULL,                       -- positive = deposit/interest, negative = withdrawal
  incident_id   UUID REFERENCES incidents(id) ON DELETE SET NULL,
  note          TEXT,
  actor_id      UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_version SMALLINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_treasury_acc_tenant
  ON treasury_accounts (tenant_id, service_name);

CREATE INDEX IF NOT EXISTS idx_treasury_ledger_account
  ON treasury_ledger (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_treasury_ledger_tenant_recent
  ON treasury_ledger (tenant_id, created_at DESC);
