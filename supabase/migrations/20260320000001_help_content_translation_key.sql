-- Add optional translation_key to help_content so article title/content can be translated via i18n.
-- When set, the Help page uses help.db_${translation_key}_title and help.db_${translation_key}_content from locale files.
ALTER TABLE help_content
  ADD COLUMN IF NOT EXISTS translation_key TEXT;

COMMENT ON COLUMN help_content.translation_key IS 'Optional i18n key for title/content (e.g. account_sign_up). When set, Help page uses help.db_${key}_title and help.db_${key}_content from locale files.';
