-- Add streaming limits config for max streaming time and warning threshold
-- Values are in minutes

INSERT INTO public.app_config (key, value, description)
SELECT 'streaming_max_minutes', '60'::jsonb, 'Maximum continuous streaming time in minutes before auto-ending the stream'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'streaming_max_minutes'
);

INSERT INTO public.app_config (key, value, description)
SELECT 'streaming_warning_minutes', '5'::jsonb, 'Minutes before auto-end when a warning is shown to the streamer'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'streaming_warning_minutes'
);

