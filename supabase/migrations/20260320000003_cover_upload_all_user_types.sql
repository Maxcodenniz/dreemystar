-- Allow all authenticated users to upload/update/delete their own cover image (covers/{user_id}/).
-- Edit Cover is now available on the Profile page for every user type, not only artists.

-- All users can upload to their own covers folder
CREATE POLICY "Users can upload own cover"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- All users can update their own cover
CREATE POLICY "Users can update own cover"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- All users can delete their own cover
CREATE POLICY "Users can delete own cover"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
