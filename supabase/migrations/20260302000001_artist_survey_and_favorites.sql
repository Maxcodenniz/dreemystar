/*
  # Artist favorites & survey tables

  - Adds per-user favorite artists and survey completion flag on profiles
  - Adds artist_survey_wishlist table to collect:
    - Initial onboarding survey (5 favorite artists)
    - Ongoing popup survey: "Which artist do you want to see online soon?"
*/

-- Add favorite_artists and survey_initial_completed to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS favorite_artists text[] NULL,
  ADD COLUMN IF NOT EXISTS survey_initial_completed boolean NOT NULL DEFAULT false;

-- Table to store artist survey answers
CREATE TABLE IF NOT EXISTS public.artist_survey_wishlist (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  artist_name   text NOT NULL,
  source        text NOT NULL DEFAULT 'popup' CHECK (source IN ('initial', 'popup')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_survey_wishlist ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert their own survey responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'artist_survey_wishlist'
      AND policyname = 'Users can insert their own survey responses'
  ) THEN
    CREATE POLICY "Users can insert their own survey responses"
      ON public.artist_survey_wishlist
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- Allow users to see their own responses
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'artist_survey_wishlist'
      AND policyname = 'Users can view their own survey responses'
  ) THEN
    CREATE POLICY "Users can view their own survey responses"
      ON public.artist_survey_wishlist
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  -- Allow admins (global_admin, super_admin) to view all responses
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'artist_survey_wishlist'
      AND policyname = 'Admins can view all survey responses'
  ) THEN
    CREATE POLICY "Admins can view all survey responses"
      ON public.artist_survey_wishlist
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.user_type IN ('global_admin', 'super_admin')
        )
      );
  END IF;
END $$;

