-- Pawapay mobile-money checkout: store intent by depositId until callback completes.
CREATE TABLE IF NOT EXISTS pawapay_payment_intents (
  deposit_id UUID PRIMARY KEY,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE pawapay_payment_intents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE pawapay_payment_intents IS 'Server-side mapping from Pawapay depositId to checkout metadata; Edge Functions use service role only.';

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS pawapay_deposit_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_pawapay_deposit_unique
  ON tickets (pawapay_deposit_id, event_id, ticket_type)
  WHERE pawapay_deposit_id IS NOT NULL;

ALTER TABLE tips
  ADD COLUMN IF NOT EXISTS pawapay_deposit_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tips_pawapay_deposit_unique
  ON tips (pawapay_deposit_id)
  WHERE pawapay_deposit_id IS NOT NULL;
