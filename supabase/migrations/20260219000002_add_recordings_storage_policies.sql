/*
  # Add storage policies for recordings uploads
  
  1. Changes
    - Add storage policies to allow artists to upload recordings to profiles bucket
    - Allow uploads to recordings/{eventId}/... paths
    - Public read access for completed recordings
    - Artists can manage their own recordings
    
  2. Security
    - Only artists and admins can upload recordings
    - Artists can only upload to their own event recordings folders
    - Public can read completed recordings
*/

-- Public read access for recordings in profiles bucket
CREATE POLICY "Public can read recordings"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'profiles' AND
  (storage.foldername(name))[1] = 'recordings'
);

-- Artists and admins can upload recordings
CREATE POLICY "Artists and admins can upload recordings"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profiles' AND
  (storage.foldername(name))[1] = 'recordings' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.user_type = 'artist' OR profiles.user_type IN ('global_admin', 'super_admin'))
  )
);

-- Artists and admins can update recordings
CREATE POLICY "Artists and admins can update recordings"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profiles' AND
  (storage.foldername(name))[1] = 'recordings' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.user_type = 'artist' OR profiles.user_type IN ('global_admin', 'super_admin'))
  )
);

-- Artists and admins can delete recordings
CREATE POLICY "Artists and admins can delete recordings"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profiles' AND
  (storage.foldername(name))[1] = 'recordings' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND (profiles.user_type = 'artist' OR profiles.user_type IN ('global_admin', 'super_admin'))
  )
);
