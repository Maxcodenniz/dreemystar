-- Toggle for Delete user action in User Management (for normal admins). Super admins can always delete.
INSERT INTO public.app_config (key, value, description)
VALUES
  ('admin_user_delete_enabled', 'true'::jsonb, 'Allow or disallow normal admins to delete users in User Management. Super admins can always delete.')
ON CONFLICT (key) DO NOTHING;
