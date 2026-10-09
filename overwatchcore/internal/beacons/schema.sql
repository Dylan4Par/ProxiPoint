CREATE TABLE IF NOT EXISTS beacons (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL,
    host_callsign TEXT NOT NULL,
    upvote_count INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS beacon_votes (
    beacon_id TEXT NOT NULL REFERENCES beacons(id),
    voter_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (beacon_id, voter_id)
);

CREATE OR REPLACE VIEW host_reputation AS
SELECT
    host_id,
    MAX(host_callsign) AS host_callsign,
    COUNT(*)::int AS total_drops,
    COALESCE(SUM(upvote_count), 0)::int AS upvote_count
FROM beacons
GROUP BY host_id;
