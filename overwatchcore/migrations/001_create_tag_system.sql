-- Enable trigram extension for fuzzy matching and duplicate detection
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Master canonical tag registry
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(50) NOT NULL UNIQUE,          -- normalized: 'food-truck'
    display_name VARCHAR(50) NOT NULL,         -- UI display: 'Food Truck'
    usage_count INT NOT NULL DEFAULT 0,
    is_curated BOOLEAN NOT NULL DEFAULT FALSE, -- Pre-seeded platform tags
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for autocomplete prefix searches and trigram fuzzy matching
CREATE INDEX IF NOT EXISTS idx_tags_slug_trgm ON tags USING gin (slug gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tags_usage_count ON tags (usage_count DESC);

-- Alias mapping for typo catching, plurals, and legacy redirects
CREATE TABLE IF NOT EXISTS tag_aliases (
    alias VARCHAR(50) PRIMARY KEY,             -- normalized alias: 'foodtrucks'
    tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Junction table with hard database constraint capping at 3 tags per event
CREATE TABLE IF NOT EXISTS event_tags (
    event_id UUID NOT NULL,
    tag_id INT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_event_tags_tag_id ON event_tags (tag_id);

-- Enforce maximum 3 tags per event constraint via trigger
CREATE OR REPLACE FUNCTION check_event_tag_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM event_tags WHERE event_id = NEW.event_id) >= 3 THEN
        RAISE EXCEPTION 'An event cannot have more than 3 tags assigned.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_event_tag_limit ON event_tags;
CREATE TRIGGER trg_check_event_tag_limit
BEFORE INSERT ON event_tags
FOR EACH ROW
EXECUTE FUNCTION check_event_tag_limit();

-- Seed starter curated tags
INSERT INTO tags (slug, display_name, is_curated, usage_count) VALUES
('live-music', 'Live Music', TRUE, 100),
('food-truck', 'Food Truck', TRUE, 100),
('dog-friendly', 'Dog Friendly', TRUE, 100),
('craft-beer', 'Craft Beer', TRUE, 100),
('board-games', 'Board Games', TRUE, 100),
('trivia', 'Trivia', TRUE, 100),
('networking', 'Networking', TRUE, 100),
('family-friendly', 'Family Friendly', TRUE, 100),
('patio-hang', 'Patio Hang', TRUE, 100)
ON CONFLICT (slug) DO NOTHING;

-- Seed common alias redirects
INSERT INTO tag_aliases (alias, tag_id) VALUES
('livemusic', (SELECT id FROM tags WHERE slug = 'live-music')),
('music', (SELECT id FROM tags WHERE slug = 'live-music')),
('foodtruck', (SELECT id FROM tags WHERE slug = 'food-truck')),
('foodtrucks', (SELECT id FROM tags WHERE slug = 'food-truck')),
('food-carts', (SELECT id FROM tags WHERE slug = 'food-truck')),
('dogs', (SELECT id FROM tags WHERE slug = 'dog-friendly')),
('pups', (SELECT id FROM tags WHERE slug = 'dog-friendly')),
('beer', (SELECT id FROM tags WHERE slug = 'craft-beer')),
('boardgames', (SELECT id FROM tags WHERE slug = 'board-games'))
ON CONFLICT (alias) DO NOTHING;
