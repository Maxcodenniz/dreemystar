-- Allow global_admin and super_admin to upload/update/delete avatars and covers for any user
-- (e.g. when updating an artist's profile photo from Artist Management)

-- Admins can upload to any user's avatars folder
CREATE POLICY "Admins can upload any avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Admins can update any user's avatar
CREATE POLICY "Admins can update any avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Admins can delete any user's avatar
CREATE POLICY "Admins can delete any avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Admins can upload to any user's covers folder
CREATE POLICY "Admins can upload any cover"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Admins can update any user's cover
CREATE POLICY "Admins can update any cover"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Admins can delete any user's cover
CREATE POLICY "Admins can delete any cover"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'covers'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );
