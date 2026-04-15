-- Artist event scheduling failed: AFTER INSERT trigger create_artist_spotlight_for_event
-- inserts into news_articles, but RLS only allows global_admin/super_admin to INSERT.
-- Non-admin artists hit RLS, the trigger errors, and the whole event insert rolls back.
-- Run the trigger body as the function owner (bypasses RLS for the trusted INSERT).

ALTER FUNCTION public.create_artist_spotlight_for_event()
  SECURITY DEFINER
  SET search_path = public;

COMMENT ON FUNCTION public.create_artist_spotlight_for_event() IS
  'Creates draft news_articles for scheduled events; SECURITY DEFINER so INSERT is not blocked by news_articles RLS (admin-only).';
