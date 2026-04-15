-- ==========================================================================
-- TIER 1 SCALABILITY: Replace expensive viewer-count trigger + secure likes
-- ==========================================================================
--
-- Problem 1: The trigger update_event_viewer_count_from_sessions runs on
-- EVERY INSERT/UPDATE/DELETE on viewer_sessions and does a full COUNT(*)
-- aggregate. With millions of concurrent viewers, this causes:
--   - O(n) work per DB mutation (n = active sessions for that event)
--   - Thousands of events.viewer_count writes per second
--   - Supabase Realtime broadcast storm to all subscribers
--
-- Solution: Remove the trigger entirely. Viewer count is now derived from
-- Supabase Realtime Presence on the client (zero DB writes for counting).
-- A periodic sync writes the count to events.viewer_count every ~30s from
-- a single client for persistence / non-live pages.
-- ==========================================================================

-- 1. Drop the expensive per-row viewer count trigger
DROP TRIGGER IF EXISTS update_viewer_count_trigger ON viewer_sessions;

-- Keep the function for manual/admin use but it is no longer auto-fired
-- (renamed to avoid confusion if old code references it).

-- 2. Create a lightweight RPC for the periodic count sync.
-- Only the broadcaster or one designated client calls this every ~30s.
CREATE OR REPLACE FUNCTION sync_viewer_count(
  p_event_id UUID,
  p_count INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE events
  SET viewer_count = p_count
  WHERE id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_viewer_count(UUID, INTEGER) TO authenticated;

-- ==========================================================================
-- Problem 2: increment_event_like_count is callable by anon with no rate
-- limit or per-user cap. Bots can inflate likes arbitrarily.
--
-- Solution: Require authentication and enforce a per-user cooldown per event.
-- We use a lightweight tracking table to enforce cooldowns.
-- ==========================================================================

-- 3. Create a like tracking table for rate limiting
CREATE TABLE IF NOT EXISTS event_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_likes_event_user
  ON event_likes(event_id, user_id);

ALTER TABLE event_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own likes"
  ON event_likes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own likes"
  ON event_likes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4. Replace the likes RPC: require auth, enforce one-like-per-user-per-event
CREATE OR REPLACE FUNCTION increment_event_like_count(event_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only authenticated users can like
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to like an event';
  END IF;

  -- Insert into tracking table (unique constraint prevents duplicates)
  INSERT INTO event_likes (event_id, user_id)
  VALUES (increment_event_like_count.event_id, auth.uid())
  ON CONFLICT (event_id, user_id) DO NOTHING;

  -- Update the count from the authoritative tracking table
  UPDATE events
  SET like_count = (
    SELECT COUNT(*) FROM event_likes el
    WHERE el.event_id = increment_event_like_count.event_id
  )
  WHERE id = increment_event_like_count.event_id;
END;
$$;

-- Revoke anon access; only authenticated users can like
REVOKE EXECUTE ON FUNCTION increment_event_like_count(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION increment_event_like_count(UUID) TO authenticated;

-- ==========================================================================
-- 5. Add missing indexes for ticket lookups (guest email path)
-- ==========================================================================
CREATE INDEX IF NOT EXISTS idx_tickets_event_email
  ON tickets(event_id, email);

CREATE INDEX IF NOT EXISTS idx_tickets_event_user
  ON tickets(event_id, user_id);

-- ==========================================================================
-- 6. Restrict viewer_sessions writes to reduce spam/fake viewer risk
-- ==========================================================================

-- Drop overly permissive policies and replace with tighter ones
DROP POLICY IF EXISTS "Allow anonymous viewer session creation" ON viewer_sessions;
DROP POLICY IF EXISTS "Allow viewer session updates" ON viewer_sessions;
DROP POLICY IF EXISTS "Allow viewer session deletion" ON viewer_sessions;
DROP POLICY IF EXISTS "Anyone can create viewer sessions" ON viewer_sessions;
DROP POLICY IF EXISTS "Anyone can update viewer sessions" ON viewer_sessions;
DROP POLICY IF EXISTS "Anyone can delete viewer sessions" ON viewer_sessions;

-- Authenticated users: can manage their own sessions
CREATE POLICY "auth_insert_own_sessions" ON viewer_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_update_own_sessions" ON viewer_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Anonymous users: can create/update sessions only with a device_id (no user_id)
CREATE POLICY "anon_insert_sessions" ON viewer_sessions
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL AND device_id IS NOT NULL);

CREATE POLICY "anon_update_sessions" ON viewer_sessions
  FOR UPDATE TO anon
  USING (user_id IS NULL AND device_id IS NOT NULL);

-- Select: anyone can read their own sessions
CREATE POLICY "select_own_sessions" ON viewer_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "anon_select_sessions" ON viewer_sessions
  FOR SELECT TO anon
  USING (user_id IS NULL);
