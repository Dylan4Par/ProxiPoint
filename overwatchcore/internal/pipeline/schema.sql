CREATE EXTENSION IF NOT EXISTS postgis;

-- Active beacons. Ids are text so a callsign or a UUID can be the host.
CREATE TABLE IF NOT EXISTS beacons (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    label TEXT NOT NULL DEFAULT '',
    channels TEXT[] NOT NULL,
    location GEOMETRY(Point, 4326) NOT NULL,
    radius_meters DOUBLE PRECISION NOT NULL,
    source_tier TEXT NOT NULL DEFAULT '',
    is_live BOOLEAN NOT NULL DEFAULT true,
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beacons_location ON beacons USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_beacons_channels ON beacons USING GIN (channels);
CREATE INDEX IF NOT EXISTS idx_beacons_active ON beacons (is_live, expires_at);

-- Followed hashtags and the farthest alert a person wants.
CREATE TABLE IF NOT EXISTS user_alert_configs (
    user_id TEXT PRIMARY KEY,
    tracked_tags TEXT[] NOT NULL,
    max_receive_radius_meters DOUBLE PRECISION NOT NULL DEFAULT 10000.0,
    push_token TEXT NOT NULL DEFAULT '',
    last_known_location GEOMETRY(Point, 4326),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_alert_location ON user_alert_configs USING GIST (last_known_location);
CREATE INDEX IF NOT EXISTS idx_user_alert_tags ON user_alert_configs USING GIN (tracked_tags);
