-- Add translated biography for artist profiles (en, es, fr).
-- bio remains the primary/fallback; bio_i18n stores { "en": "...", "es": "...", "fr": "..." }.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio_i18n JSONB;

COMMENT ON COLUMN profiles.bio_i18n IS 'Translated biography: { "en": "...", "es": "...", "fr": "..." }';
