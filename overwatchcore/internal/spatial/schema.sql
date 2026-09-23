CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    geom geography(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS entities_geom_gix ON entities USING GIST (geom);
