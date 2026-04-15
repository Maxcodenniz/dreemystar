-- Critical RLS fixes (aligned with production pg_policies audit):
-- 1) artist_applications: remove SELECT USING (true); invite lookups use SECURITY DEFINER RPC only.
-- 2) viewer_sessions: drop permissive INSERT/UPDATE policies (WITH CHECK true) so stricter policies apply.

-- ---------------------------------------------------------------------------
-- 1) Artist applications: invite token lookup without exposing all rows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can look up their own application by invite token"
  ON public.artist_applications;

CREATE OR REPLACE FUNCTION public.get_artist_application_by_invite_token(p_token uuid)
RETURNS SETOF public.artist_applications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.artist_applications
  WHERE invite_token = p_token
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_artist_application_by_invite_token(uuid) IS
  'Returns at most one row for an invite token; anon must not SELECT the whole table.';

GRANT EXECUTE ON FUNCTION public.get_artist_application_by_invite_token(uuid) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Viewer sessions: remove blanket insert/update (not in all local migrations;
--    present in production as "Allow session creation" / "Allow session updates for upsert")
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow session creation" ON public.viewer_sessions;
DROP POLICY IF EXISTS "Allow session updates for upsert" ON public.viewer_sessions;
