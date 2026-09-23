package telemetry

import (
	"context"
	"database/sql"
	_ "embed"
)

//go:embed schema.sql
var schemaSQL string

// nearbyEntitiesSQL keeps the geofence radius as a bound parameter.
// $1 is longitude, $2 is latitude, and $3 is radiusMeters from the ping.
// ST_DWithin on geography treats that third argument as meters.
const nearbyEntitiesSQL = `
SELECT
    id,
    label,
    ST_Y(location::geometry) AS latitude,
    ST_X(location::geometry) AS longitude,
    ST_Distance(
        location,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
    ) AS distance_meters
FROM watched_entities
WHERE ST_DWithin(
    location,
    ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
    $3
)
ORDER BY distance_meters ASC
`

// NearbyQuerier returns entities inside the caller-supplied radius.
type NearbyQuerier interface {
	QueryNearbyEntities(ctx context.Context, longitude, latitude, radiusMeters float64) ([]ProximityAlert, error)
}

// PostGISIndex queries watched_entities with ST_DWithin.
type PostGISIndex struct {
	db *sql.DB
}

func NewPostGISIndex(db *sql.DB) *PostGISIndex {
	return &PostGISIndex{db: db}
}

// EnsureSchema creates the PostGIS extension and watched_entities table.
func EnsureSchema(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, schemaSQL)
	return err
}

// QueryNearbyEntities runs ST_DWithin($1, $2, radiusMeters) using the ping radius.
func QueryNearbyEntities(ctx context.Context, db *sql.DB, longitude, latitude, radiusMeters float64) ([]ProximityAlert, error) {
	rows, err := db.QueryContext(ctx, nearbyEntitiesSQL, longitude, latitude, radiusMeters)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	alerts := make([]ProximityAlert, 0)
	for rows.Next() {
		var alert ProximityAlert
		if err := rows.Scan(&alert.ID, &alert.Label, &alert.Latitude, &alert.Longitude, &alert.DistanceMeters); err != nil {
			return nil, err
		}
		alerts = append(alerts, alert)
	}
	return alerts, rows.Err()
}

func (p *PostGISIndex) QueryNearbyEntities(ctx context.Context, longitude, latitude, radiusMeters float64) ([]ProximityAlert, error) {
	return QueryNearbyEntities(ctx, p.db, longitude, latitude, radiusMeters)
}
