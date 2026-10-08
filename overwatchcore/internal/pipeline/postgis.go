package pipeline

import (
	"context"
	"database/sql"
	_ "embed"
	"encoding/json"
)

//go:embed schema.sql
var schemaSQL string

// EnsureSchema creates the beacon and alert-config tables, plus their GiST and GIN indexes.
func EnsureSchema(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, schemaSQL)
	return err
}

// DropMatchSQL is the fan-out query: shared tags, beacon radius, and the user's cutoff.
const DropMatchSQL = `
SELECT
    u.user_id,
    u.push_token,
    b.id AS beacon_id,
    b.label,
    array_to_json(ARRAY(SELECT unnest(b.channels) INTERSECT SELECT unnest(u.tracked_tags)))::text AS matched_tags,
    ST_Distance(u.last_known_location::geography, b.location::geography) AS distance_meters
FROM user_alert_configs u
CROSS JOIN beacons b
WHERE b.id = $1
  AND b.is_live = true
  AND b.starts_at <= now()
  AND b.expires_at > now()
  AND u.user_id <> b.host_id
  AND u.tracked_tags && b.channels
  AND u.last_known_location IS NOT NULL
  AND ST_DWithin(
      u.last_known_location::geography,
      b.location::geography,
      b.radius_meters
  )
  AND ST_DWithin(
      u.last_known_location::geography,
      b.location::geography,
      u.max_receive_radius_meters
  )
`

// MoveMatchSQL evaluates live beacons against one user's latest coordinate.
const MoveMatchSQL = `
SELECT
    u.user_id,
    u.push_token,
    b.id AS beacon_id,
    b.label,
    array_to_json(ARRAY(SELECT unnest(b.channels) INTERSECT SELECT unnest(u.tracked_tags)))::text AS matched_tags,
    ST_Distance(u.last_known_location::geography, b.location::geography) AS distance_meters
FROM user_alert_configs u
JOIN beacons b ON u.tracked_tags && b.channels
WHERE u.user_id = $1
  AND b.is_live = true
  AND b.starts_at <= now()
  AND b.expires_at > now()
  AND b.host_id <> u.user_id
  AND u.last_known_location IS NOT NULL
  AND ST_DWithin(
      u.last_known_location::geography,
      b.location::geography,
      b.radius_meters
  )
  AND ST_DWithin(
      u.last_known_location::geography,
      b.location::geography,
      u.max_receive_radius_meters
  )
`

// PostGISStore persists beacons and runs the spatial tag queries.
type PostGISStore struct {
	db *sql.DB
}

func NewPostGISStore(db *sql.DB) *PostGISStore {
	return &PostGISStore{db: db}
}

func (s *PostGISStore) SaveBeacon(ctx context.Context, beacon Beacon) (Beacon, error) {
	if beacon.ID == "" {
		beacon.ID = newID()
	}
	_, err := s.db.ExecContext(ctx, `
INSERT INTO beacons (id, host_id, label, channels, location, radius_meters, source_tier, is_live, starts_at, expires_at)
VALUES ($1, $2, $3, $4, ST_SetSRID(ST_Point($5, $6), 4326), $7, $8, $9, $10, $11)
`, beacon.ID, beacon.HostID, beacon.Label, beacon.Channels, beacon.Longitude, beacon.Latitude, beacon.RadiusMeters, beacon.SourceTier, beacon.IsLive, beacon.StartsAt, beacon.ExpiresAt)
	return beacon, err
}

func (s *PostGISStore) SaveConfig(ctx context.Context, cfg AlertConfig) error {
	if cfg.MaxReceiveRadiusMeters <= 0 {
		cfg.MaxReceiveRadiusMeters = 10000
	}
	_, err := s.db.ExecContext(ctx, `
INSERT INTO user_alert_configs (user_id, tracked_tags, max_receive_radius_meters, push_token, last_known_location, updated_at)
VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN ST_SetSRID(ST_Point($6, $7), 4326) ELSE NULL END, now())
ON CONFLICT (user_id) DO UPDATE SET
    tracked_tags = EXCLUDED.tracked_tags,
    max_receive_radius_meters = EXCLUDED.max_receive_radius_meters,
    push_token = EXCLUDED.push_token,
    last_known_location = COALESCE(EXCLUDED.last_known_location, user_alert_configs.last_known_location),
    updated_at = now()
`, cfg.UserID, cfg.TrackedTags, cfg.MaxReceiveRadiusMeters, cfg.PushToken, cfg.HasLocation, cfg.Longitude, cfg.Latitude)
	return err
}

func (s *PostGISStore) UpdateLocation(ctx context.Context, userID string, latitude, longitude float64) error {
	_, err := s.db.ExecContext(ctx, `
UPDATE user_alert_configs
SET last_known_location = ST_SetSRID(ST_Point($2, $3), 4326), updated_at = now()
WHERE user_id = $1
`, userID, longitude, latitude)
	return err
}

func (s *PostGISStore) MatchBeacon(ctx context.Context, beaconID string) ([]AlertMatch, error) {
	return scanMatches(s.db.QueryContext(ctx, DropMatchSQL, beaconID))
}

func (s *PostGISStore) MatchUser(ctx context.Context, userID string) ([]AlertMatch, error) {
	return scanMatches(s.db.QueryContext(ctx, MoveMatchSQL, userID))
}

func scanMatches(rows *sql.Rows, err error) ([]AlertMatch, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	found := make([]AlertMatch, 0)
	for rows.Next() {
		var match AlertMatch
		var tagsJSON string
		if err := rows.Scan(&match.UserID, &match.PushToken, &match.BeaconID, &match.BeaconLabel, &tagsJSON, &match.DistanceMeters); err != nil {
			return nil, err
		}
		if tagsJSON != "" {
			_ = json.Unmarshal([]byte(tagsJSON), &match.MatchedTags)
		}
		if match.MatchedTags == nil {
			match.MatchedTags = []string{}
		}
		found = append(found, match)
	}
	return found, rows.Err()
}
