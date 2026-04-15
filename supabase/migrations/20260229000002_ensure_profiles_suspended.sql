-- Ensure profiles.suspended exists (fixes "suspended column not in schema cache" if migration 20260203000005 was skipped or schema cache is stale)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.profiles.suspended IS 'When true, account is suspended (e.g. by super_admin).';
