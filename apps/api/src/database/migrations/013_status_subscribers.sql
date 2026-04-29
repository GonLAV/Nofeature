-- Status page email subscribers (public, per tenant slug)
CREATE TABLE IF NOT EXISTS status_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email VARCHAR(320) NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirm_token UUID NOT NULL DEFAULT gen_random_uuid(),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_status_subs_tenant ON status_subscribers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_status_subs_confirm_token ON status_subscribers(confirm_token);
CREATE INDEX IF NOT EXISTS idx_status_subs_unsub_token ON status_subscribers(unsubscribe_token);
