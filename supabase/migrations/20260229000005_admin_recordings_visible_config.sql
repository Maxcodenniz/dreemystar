-- Toggle for Recordings page in Admin Tools (for normal admins). Super admins always see it.
INSERT INTO public.app_config (key, value, description)
VALUES
  ('admin_recordings_visible', 'true'::jsonb, 'Show or hide Recordings link in Admin Tools for global admins. Super admins always see it.')
ON CONFLICT (key) DO NOTHING;
