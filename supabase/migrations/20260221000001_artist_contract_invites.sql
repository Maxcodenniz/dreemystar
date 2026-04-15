-- Contract-based artist invites: paper contract flow
-- Super admin / global admin create invites; artist uses contract number + temp password to register

CREATE TABLE IF NOT EXISTS artist_contract_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number TEXT NOT NULL,
  temp_password_hash TEXT NOT NULL,
  registration_token UUID NOT NULL DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_contract_invites_contract_number ON artist_contract_invites(contract_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_contract_invites_registration_token ON artist_contract_invites(registration_token);
CREATE INDEX IF NOT EXISTS idx_artist_contract_invites_email ON artist_contract_invites(email);
CREATE INDEX IF NOT EXISTS idx_artist_contract_invites_used_at ON artist_contract_invites(used_at);

ALTER TABLE artist_contract_invites ENABLE ROW LEVEL SECURITY;

-- Only super_admin and global_admin can manage contract invites
CREATE POLICY "Admins can insert contract invites"
  ON artist_contract_invites FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('super_admin', 'global_admin')
    )
  );

CREATE POLICY "Admins can select contract invites"
  ON artist_contract_invites FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('super_admin', 'global_admin')
    )
  );

CREATE POLICY "Admins can update contract invites"
  ON artist_contract_invites FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('super_admin', 'global_admin')
    )
  );
