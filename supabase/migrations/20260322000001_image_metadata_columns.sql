-- Adaptive Image Layout System: store dimensions, orientation, and focal point for smart rendering.
-- Orientation: portrait | landscape | square. Focal point: 0-100 each axis for object-position.

-- news_articles (featured image)
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS featured_image_width INTEGER;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS featured_image_height INTEGER;
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS featured_image_orientation TEXT
  CHECK (featured_image_orientation IS NULL OR featured_image_orientation IN ('portrait', 'landscape', 'square'));
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS featured_focal_x NUMERIC(5,2);
ALTER TABLE news_articles ADD COLUMN IF NOT EXISTS featured_focal_y NUMERIC(5,2);

-- events (poster image)
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_width INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_height INTEGER;
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_orientation TEXT
  CHECK (image_orientation IS NULL OR image_orientation IN ('portrait', 'landscape', 'square'));
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_focal_x NUMERIC(5,2);
ALTER TABLE events ADD COLUMN IF NOT EXISTS image_focal_y NUMERIC(5,2);

-- profiles (avatar and cover)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_width INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_height INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_orientation TEXT
  CHECK (avatar_orientation IS NULL OR avatar_orientation IN ('portrait', 'landscape', 'square'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_focal_x NUMERIC(5,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_focal_y NUMERIC(5,2);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_width INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_height INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_orientation TEXT
  CHECK (cover_orientation IS NULL OR cover_orientation IN ('portrait', 'landscape', 'square'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_focal_x NUMERIC(5,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_focal_y NUMERIC(5,2);
