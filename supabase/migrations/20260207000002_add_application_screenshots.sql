-- Add screenshot URL columns to artist_applications for proof of follower counts
ALTER TABLE artist_applications
ADD COLUMN IF NOT EXISTS youtube_screenshot_url TEXT,
ADD COLUMN IF NOT EXISTS instagram_screenshot_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_screenshot_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_screenshot_url TEXT;

-- Create a public storage bucket for application screenshots
INSERT INTO storage.buckets (id, name, public)
VALUES ('artist-applications', 'artist-applications', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to the artist-applications bucket (applicants aren't logged in)
CREATE POLICY "Anyone can upload application screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'artist-applications');

-- Allow public read access
CREATE POLICY "Public read access for application screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'artist-applications');

-- Allow admins and service role to delete
CREATE POLICY "Admins can delete application screenshots"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'artist-applications'
  AND (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  )
);
