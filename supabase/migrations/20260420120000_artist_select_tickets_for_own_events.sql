-- Allow artists to read ticket rows for events they own (dashboard sales counts, mobile app).
-- Complements "Users view own tickets" (20260415120000) which only allows buyer or admin.

CREATE POLICY "Artists can view tickets for their events"
  ON public.tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tickets.event_id
      AND e.artist_id = auth.uid()
    )
  );

COMMENT ON POLICY "Artists can view tickets for their events" ON public.tickets IS
  'Artists can SELECT tickets tied to events where they are artist_id (RLS ORs with other SELECT policies).';
