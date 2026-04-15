-- Single-row snapshot for PawaPay / DusuPay country→operator maps (refreshed by Edge Function).
CREATE TABLE IF NOT EXISTS public.mobile_money_capability_snapshots (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  pawapay jsonb NOT NULL DEFAULT '{}'::jsonb,
  dusupay jsonb NOT NULL DEFAULT '{}'::jsonb,
  dusupay_provider_codes jsonb NOT NULL DEFAULT '{}'::jsonb,
  pawapay_fetched_at timestamptz,
  dusupay_fetched_at timestamptz,
  last_refresh_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.mobile_money_capability_snapshots (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.mobile_money_capability_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mobile_money_capability_snapshots_select"
  ON public.mobile_money_capability_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

COMMENT ON TABLE public.mobile_money_capability_snapshots IS 'PawaPay/DusuPay deposit capabilities; refresh via refresh-mobile-money-capabilities Edge Function.';
