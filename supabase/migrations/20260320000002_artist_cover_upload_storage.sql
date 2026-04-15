-- Allow artists to upload/update/delete their own cover image in profiles bucket (covers/{user_id}/)
-- Fixes "Edit Cover" not working on artist profile (only admins had cover policies before).

-- Artists can upload to their own covers folder
CREATE POLICY "Artists can upload own cover"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'artist'
    )
  );

-- Artists can update their own cover
CREATE POLICY "Artists can update own cover"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'artist'
    )
  );

-- Artists can delete their own cover
CREATE POLICY "Artists can delete own cover"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'artist'
    )
  );
