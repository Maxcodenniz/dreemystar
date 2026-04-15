-- Ensure super admin can delete events (by role or by known super admin IDs)
-- Idempotent: drop then create so re-run does not fail with "already exists"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'Admins and super admins can delete events'
  ) THEN
    DROP POLICY "Admins and super admins can delete events" ON events;
  END IF;
END $$;
CREATE POLICY "Admins and super admins can delete events"
  ON events FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (
        user_type IN ('global_admin', 'super_admin')
        OR id IN (
          'f20cd4f3-4779-4b21-aa79-7d8ce5e02ed8'::uuid,
          '95e074a3-7aa5-4423-8f6a-6dd0d060398e'::uuid
        )
      )
    )
  );
