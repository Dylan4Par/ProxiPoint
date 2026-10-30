package events

import (
	"context"
	"database/sql"
)

// candidateUsersSQL is the immediate spatial evaluation run after a beacon insert.
// $1 is the beacon channel array, $2 is longitude, $3 is latitude, and $4 is radius meters.
const candidateUsersSQL = `
SELECT user_id FROM user_alert_configs
WHERE tracked_tags && $1
  AND ST_DWithin(last_known_location::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
`

const insertBeaconSQL = `
INSERT INTO beacons (id, title, venue, channels, geom, radius_meters, visibility, duration_hours)
VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8, $9)
`

const upsertTrackerSQL = `
INSERT INTO user_alert_configs (user_id, tracked_tags, last_known_location, updated_at)
VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, now())
ON CONFLICT (user_id) DO UPDATE SET
    last_known_location = EXCLUDED.last_known_location,
    tracked_tags = CASE
        WHEN cardinality(EXCLUDED.tracked_tags) = 0 THEN user_alert_configs.tracked_tags
        ELSE EXCLUDED.tracked_tags
    END,
    updated_at = now()
`

const coveringBeaconsSQL = `
SELECT id, title, venue, channels,
       ST_Y(geom::geometry) AS latitude,
       ST_X(geom::geometry) AS longitude,
       radius_meters, visibility, duration_hours
FROM beacons
WHERE visibility <> 'private'
  AND channels && $1
  AND ST_DWithin(
        geom,
        ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
        radius_meters
      )
`

// PostGISStore writes beacons and evaluates geography radii in meters.
type PostGISStore struct {
	db *sql.DB
}

func NewPostGISStore(db *sql.DB) *PostGISStore {
	return &PostGISStore{db: db}
}

func (p *PostGISStore) InsertBeacon(ctx context.Context, beacon Beacon) error {
	_, err := p.db.ExecContext(
		ctx,
		insertBeaconSQL,
		beacon.ID,
		beacon.Title,
		beacon.Venue,
		beacon.Channels,
		beacon.Longitude,
		beacon.Latitude,
		beacon.RadiusMeters,
		beacon.Visibility,
		beacon.DurationHours,
	)
	return err
}

func (p *PostGISStore) UsersInside(ctx context.Context, beacon Beacon) ([]string, error) {
	rows, err := p.db.QueryContext(ctx, candidateUsersSQL, beacon.Channels, beacon.Longitude, beacon.Latitude, beacon.RadiusMeters)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]string, 0)
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, err
		}
		users = append(users, userID)
	}
	return users, rows.Err()
}

func (p *PostGISStore) UpsertTracker(ctx context.Context, fix TrackerFix) error {
	tags := fix.TrackedTags
	if tags == nil {
		tags = []string{}
	}
	_, err := p.db.ExecContext(ctx, upsertTrackerSQL, fix.UserID, tags, fix.Longitude, fix.Latitude)
	return err
}

func (p *PostGISStore) BeaconsCovering(ctx context.Context, fix TrackerFix) ([]Beacon, error) {
	tags := fix.TrackedTags
	if tags == nil {
		tags = []string{}
	}
	rows, err := p.db.QueryContext(ctx, coveringBeaconsSQL, tags, fix.Longitude, fix.Latitude)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	hits := make([]Beacon, 0)
	for rows.Next() {
		var beacon Beacon
		if err := rows.Scan(
			&beacon.ID,
			&beacon.Title,
			&beacon.Venue,
			&beacon.Channels,
			&beacon.Latitude,
			&beacon.Longitude,
			&beacon.RadiusMeters,
			&beacon.Visibility,
			&beacon.DurationHours,
		); err != nil {
			return nil, err
		}
		hits = append(hits, beacon)
	}
	return hits, rows.Err()
}
