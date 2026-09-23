CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS watched_entities (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    location geography(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS watched_entities_location_gix
    ON watched_entities
    USING GIST (location);
