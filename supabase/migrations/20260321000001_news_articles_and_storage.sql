-- Dreemystar News & Magazine: articles table, RLS, and news-images storage

-- Table: news_articles
CREATE TABLE IF NOT EXISTS news_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT,
  content TEXT,
  featured_image TEXT,
  category TEXT NOT NULL CHECK (category IN ('platform', 'artist', 'concerts', 'industry', 'tutorials')),
  author TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  views INTEGER NOT NULL DEFAULT 0,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_news_articles_slug ON news_articles(slug);
CREATE INDEX IF NOT EXISTS idx_news_articles_status ON news_articles(status);
CREATE INDEX IF NOT EXISTS idx_news_articles_category ON news_articles(category);
CREATE INDEX IF NOT EXISTS idx_news_articles_published_at ON news_articles(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_news_articles_is_featured ON news_articles(is_featured) WHERE is_featured = true;

COMMENT ON TABLE news_articles IS 'Dreemystar News & Magazine articles; public reads published, admins manage via CMS';

-- RLS
ALTER TABLE news_articles ENABLE ROW LEVEL SECURITY;

-- Public: read published only
CREATE POLICY "Public can read published articles"
  ON news_articles FOR SELECT
  TO anon, authenticated
  USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now());

-- Admins: full CRUD
CREATE POLICY "Admins can insert news articles"
  ON news_articles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update news articles"
  ON news_articles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete news articles"
  ON news_articles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Admins can read all (including drafts) for CMS
CREATE POLICY "Admins can read all news articles"
  ON news_articles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION news_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS news_articles_updated_at ON news_articles;
CREATE TRIGGER news_articles_updated_at
  BEFORE UPDATE ON news_articles
  FOR EACH ROW EXECUTE FUNCTION news_articles_updated_at();

-- Storage bucket: news-images (public read for article images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: admins can upload/update/delete in news-images
CREATE POLICY "Admins can upload news images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'news-images'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can update news images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'news-images'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete news images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'news-images'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Public read for news-images (bucket is public; allow SELECT for anon)
CREATE POLICY "Public can read news images"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'news-images');

-- RPC: increment article view count (callable by anyone for published articles)
CREATE OR REPLACE FUNCTION increment_news_article_views(article_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE news_articles
  SET views = views + 1
  WHERE id = article_id
    AND status = 'published'
    AND published_at IS NOT NULL
    AND published_at <= now();
END;
$$;
