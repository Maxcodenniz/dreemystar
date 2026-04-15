-- Public-safe read of mobile money toggles (checkout UI for guests + logged-in users).
-- Bypasses RLS edge cases; only exposes these three flags.
CREATE OR REPLACE FUNCTION public.get_mobile_money_payment_flags()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'mobile_money_payments_enabled',
    COALESCE(
      (SELECT value FROM public.app_config WHERE key = 'mobile_money_payments_enabled' LIMIT 1),
      'false'::jsonb
    ),
    'pawapay_enabled',
    COALESCE(
      (SELECT value FROM public.app_config WHERE key = 'pawapay_enabled' LIMIT 1),
      'false'::jsonb
    ),
    'dusupay_enabled',
    COALESCE(
      (SELECT value FROM public.app_config WHERE key = 'dusupay_enabled' LIMIT 1),
      'false'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_mobile_money_payment_flags() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mobile_money_payment_flags() TO anon, authenticated;
