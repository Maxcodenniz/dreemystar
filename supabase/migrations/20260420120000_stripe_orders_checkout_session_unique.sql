-- PostgREST upsert in stripe-webhook uses onConflict: 'checkout_session_id'.
-- Postgres error 42P10 means no unique or exclusion constraint exists on that column.
-- Tier2 migration (20260219000002) adds this via ALTER TABLE ... ADD CONSTRAINT; if that
-- migration never ran on a database, this index fixes webhook idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS stripe_orders_checkout_session_id_key
  ON public.stripe_orders (checkout_session_id);
