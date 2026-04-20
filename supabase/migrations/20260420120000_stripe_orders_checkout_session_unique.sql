-- PostgREST upsert in stripe-webhook uses onConflict: 'checkout_session_id'.
-- Postgres 42P10 = no unique constraint; 23505 on CREATE UNIQUE INDEX = duplicate keys.

-- 1) Dedupe: keep one row per checkout_session_id (lowest id = first inserted).
DELETE FROM public.stripe_orders o
WHERE EXISTS (
  SELECT 1
  FROM public.stripe_orders o2
  WHERE o2.checkout_session_id = o.checkout_session_id
    AND o2.id < o.id
);

-- 2) Unique index for webhook idempotency (no-op if tier2 constraint already exists).
CREATE UNIQUE INDEX IF NOT EXISTS stripe_orders_checkout_session_id_key
  ON public.stripe_orders (checkout_session_id);
