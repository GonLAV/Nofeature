-- 016_responder_load.sql
-- War Room Vitals \u2014 per-responder cognitive load snapshots.
--
-- We snapshot load on demand (when a commander opens the page-someone
-- picker) and on every incident state change. Snapshots are append-only;
-- the most-recent row per (tenant_id, user_id) is the current value.
-- Keeping history is what unlocks the burnout-trend signal: a responder
-- whose load has been > 70% for 5 days is in a different category than
-- one who briefly spiked yesterday.
--
-- Score is a normalised 0..1 number; breakdown is JSONB so we can
-- evolve the model without a schema migration. schema_version protects
-- callers from comparing apples to oranges.

CREATE TABLE IF NOT EXISTS responder_load_snapshots (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id         UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  captured_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Headline number: 0.0 (idle) .. 1.0 (saturated).
  score           REAL         NOT NULL,

  -- Raw component counts \u2014 useful for analytics / fairness audits.
  active_incidents          INT NOT NULL DEFAULT 0,
  severity_weighted_load    REAL NOT NULL DEFAULT 0,
  comments_last_hour        INT NOT NULL DEFAULT 0,
  oncall_minutes_today      INT NOT NULL DEFAULT 0,
  minutes_since_last_break  INT NOT NULL DEFAULT 0,
  weekly_oncall_minutes     INT NOT NULL DEFAULT 0,

  breakdown       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  schema_version  SMALLINT     NOT NULL DEFAULT 1
);

-- "Latest snapshot per user" is the hot read path.
CREATE INDEX IF NOT EXISTS idx_responder_load_latest
  ON responder_load_snapshots (tenant_id, user_id, captured_at DESC);

-- Trend scans (e.g. "anyone over 70% for >5 days?") are bounded by date.
CREATE INDEX IF NOT EXISTS idx_responder_load_captured
  ON responder_load_snapshots (tenant_id, captured_at DESC);
