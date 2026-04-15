/*
  # Artist survey suggestions & config

  - Adds artist_survey_suggestions table with country + artist names
  - Adds config keys to control how many countries and artists per country to show
*/

CREATE TABLE IF NOT EXISTS public.artist_survey_suggestions (
  id            bigserial PRIMARY KEY,
  country       text NOT NULL,
  artist_name   text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.artist_survey_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Allow admins to manage suggestions (insert/update/delete/select)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'artist_survey_suggestions'
      AND policyname = 'Admins manage artist survey suggestions'
  ) THEN
    CREATE POLICY "Admins manage artist survey suggestions"
      ON public.artist_survey_suggestions
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.user_type IN ('global_admin', 'super_admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.user_type IN ('global_admin', 'super_admin')
        )
      );
  END IF;

  -- Allow everyone to read suggestions (safe marketing data)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'artist_survey_suggestions'
      AND policyname = 'Everyone can read artist survey suggestions'
  ) THEN
    CREATE POLICY "Everyone can read artist survey suggestions"
      ON public.artist_survey_suggestions
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- Seed with a few default suggestions (super admins can edit later)
INSERT INTO public.artist_survey_suggestions (country, artist_name, display_order) VALUES
  ('Nigeria', 'Burna Boy', 1),
  ('Nigeria', 'Davido', 2),
  ('Nigeria', 'Wizkid', 3),
  ('Nigeria', 'Rema', 4),
  ('Nigeria', 'Tiwa Savage', 5),
  ('United States', 'Beyoncé', 1),
  ('United States', 'Taylor Swift', 2),
  ('United States', 'Drake', 3),
  ('United States', 'The Weeknd', 4),
  ('United States', 'Ariana Grande', 5),
  ('France', 'Aya Nakamura', 1),
  ('France', 'Gims', 2),
  ('France', 'Maitre Gims', 3),
  ('France', 'Dadju', 4),
  ('France', 'Stromae', 5),
  ('Ghana', 'Sarkodie', 1),
  ('Ghana', 'Stonebwoy', 2),
  ('Ghana', 'Shatta Wale', 3),
  ('Cameroon', 'Fally Ipupa', 1),
  ('Cameroon', 'Charlotte Dipanda', 2),
  ('Côte d''Ivoire', 'DJ Arafat', 1),
  ('Côte d''Ivoire', 'Magic System', 2),
  ('Morocco', 'Saad Lamjarred', 1),
  ('Morocco', 'Fnaire', 2)
ON CONFLICT DO NOTHING;

-- Config: how many countries and artists to show in the survey UI
INSERT INTO public.app_config (key, value, description)
VALUES
  ('artist_survey_max_countries', '5'::jsonb, 'Maximum number of countries to show in the initial artist favorites survey'),
  ('artist_survey_artists_per_country', '5'::jsonb, 'Maximum number of artists per country to show in the initial artist favorites survey')
ON CONFLICT (key) DO NOTHING;

