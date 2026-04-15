-- Tip platform fee: percentage retained by platform (default 20%); artist receives the remainder.
-- Used in tip confirmation emails and in-app notifications to artists.

INSERT INTO public.app_config (key, value, description)
SELECT 'tip_platform_percentage', '20'::jsonb, 'Percentage of tip amount retained by the platform (0-100). Artist receives the remainder. Used in tip confirmation and artist notifications.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'tip_platform_percentage'
);
