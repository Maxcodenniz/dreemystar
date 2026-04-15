-- Add default_event_duration config for global event duration (in minutes)
-- Only super admins can change this via existing app_config RLS

INSERT INTO public.app_config (key, value, description)
SELECT 'default_event_duration', '60'::jsonb, 'Default event duration in minutes for artist-scheduled events'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'default_event_duration'
);

