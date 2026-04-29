-- ─────────────────────────────────────────────────────────────
-- Migration: 003_stripe_billing
-- Adds Stripe subscription fields + 14-day free trial to tenants
-- ─────────────────────────────────────────────────────────────

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id         TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS billing_email              TEXT,
  -- New tenants get a 14-day free trial of Growth features
  ADD COLUMN IF NOT EXISTS trial_ends_at              TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_customer
  ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_stripe_subscription
  ON tenants(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
