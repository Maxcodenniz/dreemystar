-- Add configurable minimum followers threshold for artist qualification
INSERT INTO public.app_config (key, value, description)
VALUES
  (
    'artist_min_followers',
    '100000'::jsonb,
    'Minimum followers on at least one social platform (YouTube, Instagram, TikTok, or Facebook) required for an artist application to qualify automatically.'
  )
ON CONFLICT (key) DO NOTHING;

