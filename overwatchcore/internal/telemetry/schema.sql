CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS watched_entities (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    location geography(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS watched_entities_location_gix
    ON watched_entities
    USING GIST (location);

CREATE TABLE IF NOT EXISTS beacons (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    venue TEXT NOT NULL,
    channels TEXT[] NOT NULL,
    geom geography(Point, 4326) NOT NULL,
    radius_meters DOUBLE PRECISION NOT NULL,
    visibility TEXT NOT NULL,
    duration_hours DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beacons_geom_gix
    ON beacons
    USING GIST (geom);

CREATE INDEX IF NOT EXISTS beacons_channels_gin
    ON beacons
    USING GIN (channels);

CREATE TABLE IF NOT EXISTS user_alert_configs (
    user_id TEXT PRIMARY KEY,
    tracked_tags TEXT[] NOT NULL DEFAULT '{}',
    last_known_location geography(Point, 4326),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_alert_configs_location_gix
    ON user_alert_configs
    USING GIST (last_known_location);

CREATE INDEX IF NOT EXISTS user_alert_configs_tags_gin
    ON user_alert_configs
    USING GIN (tracked_tags);
