-- Event deletion requests: artists request deletion; admins/super_admins can delete events
-- 1. Allow both global_admin and super_admin to delete events (was super_admin only)
-- 2. Table for artist deletion requests

DROP POLICY IF EXISTS "Super admin can delete events" ON events;
CREATE POLICY "Admins and super admins can delete events"
  ON events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('global_admin', 'super_admin')
    )
  );

-- Table: event_deletion_requests (artist requests; admin resolves)
CREATE TABLE IF NOT EXISTS public.event_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_event_deletion_requests_event_id ON event_deletion_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_event_deletion_requests_status ON event_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_event_deletion_requests_requested_by ON event_deletion_requests(requested_by);

ALTER TABLE event_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Artists can insert a request only for their own events
CREATE POLICY "Artists can request deletion for own events"
  ON event_deletion_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_id AND events.artist_id = auth.uid()
    )
  );

-- Artists can read their own requests
CREATE POLICY "Users can read own deletion requests"
  ON event_deletion_requests FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

-- Admins and super admins can read all and update (resolve)
CREATE POLICY "Admins can read all deletion requests"
  ON event_deletion_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('global_admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update deletion requests"
  ON event_deletion_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND user_type IN ('global_admin', 'super_admin')
    )
  )
  WITH CHECK (true);

COMMENT ON TABLE event_deletion_requests IS 'Artist requests for event deletion; admins approve or reject.';
