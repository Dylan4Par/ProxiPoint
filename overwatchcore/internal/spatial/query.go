package spatial

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

// nearbyEntitiesSQL reads the GiST index on entities.geom (geography, SRID 4326).
// $1 is longitude, $2 is latitude, and $3 is the radius in meters.
const nearbyEntitiesSQL = `
	SELECT
		id::text,
		name,
		ST_Y(geom::geometry) AS lat,
		ST_X(geom::geometry) AS lon,
		ST_Distance(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_meters
	FROM entities
	WHERE ST_DWithin(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
	ORDER BY distance_meters ASC;
`

// QueryNearbyEntities returns one proximity alert per entity inside radiusMeters.
func QueryNearbyEntities(ctx context.Context, db *sql.DB, lon, lat float64, radiusMeters float64) ([]telemetry.ProximityAlertPayload, error) {
	if db == nil {
		return nil, fmt.Errorf("spatial query: nil database")
	}

	rows, err := db.QueryContext(ctx, nearbyEntitiesSQL, lon, lat, radiusMeters)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := time.Now().UTC().Format(time.RFC3339)
	var alerts []telemetry.ProximityAlertPayload
	for rows.Next() {
		var alert telemetry.ProximityAlertPayload
		if err := rows.Scan(
			&alert.TargetEntityID,
			&alert.TargetName,
			&alert.Latitude,
			&alert.Longitude,
			&alert.DistanceMeters,
		); err != nil {
			return nil, err
		}
		alert.AlertID = "alert-" + alert.TargetEntityID
		alert.ThresholdMeters = radiusMeters
		alert.TriggeredAt = now
		alert.Message = "Target detected within radius"
		alerts = append(alerts, alert)
	}
	return alerts, rows.Err()
}
