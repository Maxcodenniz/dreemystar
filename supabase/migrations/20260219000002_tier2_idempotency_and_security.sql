-- ==========================================================================
-- TIER 2: Idempotency constraints, TOCTOU prevention, and security hardening
-- ==========================================================================

-- 1. Unique constraint on stripe_orders.checkout_session_id
--    Prevents duplicate orders when Stripe replays webhooks.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stripe_orders_checkout_session_id_key'
  ) THEN
    ALTER TABLE stripe_orders
      ADD CONSTRAINT stripe_orders_checkout_session_id_key UNIQUE (checkout_session_id);
  END IF;
END $$;

-- 2. Unique constraint on tickets to prevent duplicate ticket per event+user+type.
--    This is the DB-level defense against TOCTOU races where two webhook
--    deliveries both pass the "no existing ticket" check simultaneously.
--
--    We use a partial unique index (only active tickets) so that cancelled/
--    refunded tickets don't block new purchases.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_unique_active_user
  ON tickets (event_id, user_id, ticket_type)
  WHERE status = 'active' AND user_id IS NOT NULL;

-- Guest tickets (no user_id) are deduplicated by email+event+type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_unique_active_email
  ON tickets (event_id, lower(email), ticket_type)
  WHERE status = 'active' AND user_id IS NULL AND email IS NOT NULL;

-- 3. Unique constraint on tickets.stripe_session_id to make Stripe
--    webhook processing fully idempotent at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_stripe_session_unique
  ON tickets (stripe_session_id, event_id, ticket_type)
  WHERE stripe_session_id IS NOT NULL;

-- 4. Unique constraint on tickets.flutterwave_tx_ref to make Flutterwave
--    webhook processing fully idempotent at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_flutterwave_tx_ref_unique
  ON tickets (flutterwave_tx_ref, event_id, ticket_type)
  WHERE flutterwave_tx_ref IS NOT NULL;

-- 5. Index to speed up ticket ownership lookups in the Agora token endpoint
--    (event_id + user_id + status) — used for "has active ticket?" checks.
CREATE INDEX IF NOT EXISTS idx_tickets_ownership_lookup
  ON tickets (event_id, user_id, status)
  WHERE status = 'active';

-- 6. Index for tip idempotency (prevent double tip completion)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tips_stripe_session_unique
  ON tips (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tips_flutterwave_tx_ref_unique
  ON tips (flutterwave_tx_ref)
  WHERE flutterwave_tx_ref IS NOT NULL;
