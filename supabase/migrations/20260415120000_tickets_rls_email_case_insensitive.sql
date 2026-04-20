-- Case-insensitive ticket email match for authenticated users (auth.email() vs tickets.email)
-- Fixes: logged-in users not seeing tickets / duplicate purchases when casing differed (Stripe vs Supabase).

DROP POLICY IF EXISTS "Users view own tickets" ON tickets;

CREATE POLICY "Users view own tickets"
  ON tickets FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND user_type IN ('admin', 'global_admin', 'super_admin')
    )
    OR (
      email IS NOT NULL
      AND auth.email() IS NOT NULL
      AND lower(trim(email)) = lower(trim(auth.email()))
    )
  );

COMMENT ON POLICY "Users view own tickets" ON tickets IS
  'Own tickets by user_id OR admin OR email match (case-insensitive).';
