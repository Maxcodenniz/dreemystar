-- Fix events RLS policies to allow super_admin users to create and manage events
-- Previously, policies only allowed artists and global_admin, which blocked super_admin from saving scheduled events.

-- Policy: insert events
DROP POLICY IF EXISTS "Artists and admins can create events" ON events;
CREATE POLICY "Artists and admins can create events"
ON events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('artist', 'global_admin', 'super_admin')
  )
);

-- Policy: update events
DROP POLICY IF EXISTS "Artists and admins can manage events" ON events;
CREATE POLICY "Artists and admins can manage events"
ON events
FOR UPDATE
TO authenticated
USING (
  artist_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
  )
)
WITH CHECK (
  artist_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
  )
);

-- Policy: delete events
DROP POLICY IF EXISTS "Artists and admins can delete events" ON events;
CREATE POLICY "Artists and admins can delete events"
ON events
FOR DELETE
TO authenticated
USING (
  artist_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
  )
);

