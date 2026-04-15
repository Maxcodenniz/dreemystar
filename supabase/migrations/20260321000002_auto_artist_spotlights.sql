-- Automatic Artist Spotlight generator for Dreemystar News & Magazine
-- Creates draft news_articles rows when an artist schedules a new event.

-- 1) Link news_articles to events (one spotlight per event)
ALTER TABLE news_articles
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_news_articles_event_id_unique
  ON news_articles(event_id)
  WHERE event_id IS NOT NULL;

-- 2) Trigger function: create draft Artist Spotlight article when an event is scheduled
CREATE OR REPLACE FUNCTION create_artist_spotlight_for_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  artist_name TEXT;
  artist_avatar TEXT;
  spotlight_exists BOOLEAN;
  base_slug TEXT;
  slug_candidate TEXT;
  suffix INT := 1;
  artist_slug TEXT;
  date_slug TEXT;
  watch_url TEXT;
  article_title TEXT;
  article_excerpt TEXT;
  article_content TEXT;
  follower_count BIGINT := 0;
  auto_feature BOOLEAN := false;
BEGIN
  -- Only run when event is upcoming/scheduled and has an artist_id
  IF NEW.status <> 'upcoming' OR NEW.artist_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only create spotlight when status just became upcoming (on insert or status change)
  IF TG_OP = 'UPDATE' AND (OLD.status IS NULL OR OLD.status = NEW.status) THEN
    RETURN NEW;
  END IF;

  -- Prevent duplicates: one spotlight per event_id
  SELECT EXISTS (
    SELECT 1 FROM news_articles WHERE event_id = NEW.id
  ) INTO spotlight_exists;

  IF spotlight_exists THEN
    RETURN NEW;
  END IF;

  -- Fetch artist display name and avatar
  SELECT
    COALESCE(p.full_name, p.username, 'Artist') AS name,
    p.avatar_url
  INTO artist_name, artist_avatar
  FROM profiles p
  WHERE p.id = NEW.artist_id;

  IF artist_name IS NULL THEN
    artist_name := 'Artist';
  END IF;

  -- Optional: auto-feature artists with many followers (favorite_artists count >= 1000)
  SELECT COUNT(*) INTO follower_count
  FROM favorite_artists fa
  WHERE fa.artist_id = NEW.artist_id;

  IF follower_count >= 1000 THEN
    auto_feature := true;
  END IF;

  -- Generate slug: artist-name-live-on-dreemystar-month-day
  artist_slug := lower(regexp_replace(artist_name, '[^a-z0-9]+', '-', 'g'));
  artist_slug := regexp_replace(artist_slug, '^-+|-+$', '', 'g');
  date_slug := lower(to_char(NEW.start_time, 'Mon-DD'));
  base_slug := artist_slug || '-live-on-dreemystar-' || date_slug;

  slug_candidate := base_slug;
  -- Ensure slug uniqueness
  WHILE EXISTS (SELECT 1 FROM news_articles WHERE slug = slug_candidate) LOOP
    suffix := suffix + 1;
    slug_candidate := base_slug || '-' || suffix::text;
  END LOOP;

  watch_url := '/watch/' || NEW.id::text;

  -- Title & excerpt
  article_title := artist_name || ' is going live on Dreemystar';
  article_excerpt := artist_name ||
    ' will be performing live on Dreemystar. Fans can tune in to watch the concert and experience the performance from anywhere.';

  -- Content body (simple HTML)
  article_content :=
    format(
      '<p>Dreemystar is excited to announce that %1$s will be performing live on the platform.</p>' ||
      '<h2>Concert Details</h2>' ||
      '<ul>' ||
      '<li><strong>Artist:</strong> %1$s</li>' ||
      '<li><strong>Event Title:</strong> %2$s</li>' ||
      '<li><strong>Date:</strong> %3$s</li>' ||
      '<li><strong>Time:</strong> %4$s</li>' ||
      '</ul>' ||
      '<p>Fans will be able to watch the live concert directly on Dreemystar.</p>' ||
      '<p>Don''t miss this upcoming performance and join the live stream when the event starts.</p>' ||
      '<p><a href=\"%5$s\" style=\"display:inline-block;padding:10px 18px;border-radius:9999px;background:#a855f7;color:#ffffff;text-decoration:none;font-weight:600;\">Watch Event</a></p>',
      artist_name,
      COALESCE(NEW.title, 'Live Concert'),
      to_char(NEW.start_time, 'FMMonth DD, YYYY'),
      to_char(NEW.start_time, 'FMHH12:MI AM'),
      watch_url
    );

  INSERT INTO news_articles (
    title,
    slug,
    excerpt,
    content,
    featured_image,
    category,
    author,
    status,
    is_featured,
    event_id
  )
  VALUES (
    article_title,
    slug_candidate,
    article_excerpt,
    article_content,
    artist_avatar,
    'artist',          -- Artist Spotlight category
    'Dreemystar',
    'draft',           -- Start as draft; admins can refine/publish
    auto_feature,
    NEW.id
  );

  RETURN NEW;
END;
$$;

-- 3) Triggers on events: after insert and after status update
DROP TRIGGER IF EXISTS create_artist_spotlight_on_insert ON events;
CREATE TRIGGER create_artist_spotlight_on_insert
AFTER INSERT ON events
FOR EACH ROW
EXECUTE FUNCTION create_artist_spotlight_for_event();

DROP TRIGGER IF EXISTS create_artist_spotlight_on_update ON events;
CREATE TRIGGER create_artist_spotlight_on_update
AFTER UPDATE OF status ON events
FOR EACH ROW
EXECUTE FUNCTION create_artist_spotlight_for_event();

