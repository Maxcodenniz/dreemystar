-- Ensure news_articles.slug is always unique by appending -2, -3, ... when needed.
-- Fixes "duplicate key value violates unique constraint news_articles_slug_key" on insert/update.

CREATE OR REPLACE FUNCTION news_articles_ensure_slug_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  slug_candidate TEXT;
  suffix INT := 1;
BEGIN
  base_slug := trim(NEW.slug);
  IF base_slug = '' THEN
    base_slug := 'article';
  END IF;
  slug_candidate := base_slug;

  IF TG_OP = 'INSERT' THEN
    WHILE EXISTS (SELECT 1 FROM news_articles WHERE slug = slug_candidate) LOOP
      suffix := suffix + 1;
      slug_candidate := base_slug || '-' || suffix::text;
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    WHILE EXISTS (
      SELECT 1 FROM news_articles
      WHERE slug = slug_candidate AND id IS DISTINCT FROM NEW.id
    ) LOOP
      suffix := suffix + 1;
      slug_candidate := base_slug || '-' || suffix::text;
    END LOOP;
  END IF;

  NEW.slug := slug_candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS news_articles_ensure_slug_unique_trigger ON news_articles;
CREATE TRIGGER news_articles_ensure_slug_unique_trigger
  BEFORE INSERT OR UPDATE OF slug ON news_articles
  FOR EACH ROW
  EXECUTE FUNCTION news_articles_ensure_slug_unique();
