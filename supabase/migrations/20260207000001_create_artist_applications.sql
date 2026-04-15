-- Artist Application / Candidature system
-- Artists fill out an application form; if they meet the follower threshold
-- they receive an invite link to create an artist account.

CREATE TABLE IF NOT EXISTS artist_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  country_of_residence TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  youtube_url TEXT,
  youtube_followers INTEGER DEFAULT 0,
  instagram_url TEXT,
  instagram_followers INTEGER DEFAULT 0,
  tiktok_url TEXT,
  tiktok_followers INTEGER DEFAULT 0,
  facebook_url TEXT,
  facebook_followers INTEGER DEFAULT 0,
  has_held_online_event BOOLEAN DEFAULT false,
  online_event_video_url TEXT,
  description TEXT NOT NULL,
  -- processing
  status TEXT CHECK (status IN ('pending', 'qualified', 'rejected', 'registered')) DEFAULT 'pending',
  qualification_met BOOLEAN DEFAULT false,
  invite_token UUID DEFAULT gen_random_uuid(),
  rejection_reason TEXT,
  admin_notes TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast invite-token lookups during signup
CREATE UNIQUE INDEX IF NOT EXISTS idx_artist_applications_invite_token ON artist_applications(invite_token);
CREATE INDEX IF NOT EXISTS idx_artist_applications_email ON artist_applications(email);
CREATE INDEX IF NOT EXISTS idx_artist_applications_status ON artist_applications(status);

-- RLS
ALTER TABLE artist_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (the form is public)
CREATE POLICY "Anyone can submit an artist application"
  ON artist_applications FOR INSERT
  WITH CHECK (true);

-- Only admins can read all applications
CREATE POLICY "Admins can view all artist applications"
  ON artist_applications FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Allow anonymous read by invite_token (for signup page validation)
CREATE POLICY "Anyone can look up their own application by invite token"
  ON artist_applications FOR SELECT
  USING (true);

-- Admins can update (override decisions, add notes)
CREATE POLICY "Admins can update artist applications"
  ON artist_applications FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );
