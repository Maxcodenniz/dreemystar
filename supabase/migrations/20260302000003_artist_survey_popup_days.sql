-- Default frequency (in days) for the popup survey
INSERT INTO public.app_config (key, value, description)
VALUES
  ('artist_survey_popup_days', '30'::jsonb, 'Number of days between popup survey prompts asking which artist users want to see online soon')
ON CONFLICT (key) DO NOTHING;

