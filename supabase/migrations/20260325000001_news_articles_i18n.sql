-- Add translated content columns for news articles (en, es, fr).
-- Each column stores JSONB like { "en": "...", "es": "...", "fr": "..." }.
-- Fallback: if no key for current locale, use main column (title, excerpt, content, author).

ALTER TABLE news_articles
  ADD COLUMN IF NOT EXISTS title_i18n JSONB,
  ADD COLUMN IF NOT EXISTS excerpt_i18n JSONB,
  ADD COLUMN IF NOT EXISTS content_i18n JSONB,
  ADD COLUMN IF NOT EXISTS author_i18n JSONB;

COMMENT ON COLUMN news_articles.title_i18n IS 'Translated titles: { "en": "...", "es": "...", "fr": "..." }';
COMMENT ON COLUMN news_articles.excerpt_i18n IS 'Translated excerpts';
COMMENT ON COLUMN news_articles.content_i18n IS 'Translated HTML content';
COMMENT ON COLUMN news_articles.author_i18n IS 'Translated author display names';
