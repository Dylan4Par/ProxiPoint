package telemetry

import (
	"errors"
	"math"
)

const defaultRadiusMeters = 100.0

// LocationPing is the location_ping packet payload shared by the WebSocket
// ingest path and POST /api/v1/telemetry/ping.
type LocationPing struct {
	UserID       string   `json:"userId"`
	Latitude     float64  `json:"latitude"`
	Longitude    float64  `json:"longitude"`
	Accuracy     *float64 `json:"accuracy"`
	Speed        *float64 `json:"speed"`
	Heading      *float64 `json:"heading"`
	RadiusMeters float64  `json:"radiusMeters"`
	Timestamp    string   `json:"timestamp"`
}

// ProximityAlert is one entity inside the ping's geofence.
type ProximityAlert struct {
	ID             string  `json:"id"`
	Label          string  `json:"label"`
	Latitude       float64 `json:"latitude"`
	Longitude      float64 `json:"longitude"`
	DistanceMeters float64 `json:"distanceMeters"`
}

// Normalize validates a ping and fills the default geofence radius.
func (p *LocationPing) Normalize() error {
	if p.UserID == "" {
		return errors.New("userId is required")
	}
	if !validCoordinate(p.Latitude, p.Longitude) || math.IsNaN(p.RadiusMeters) || math.IsInf(p.RadiusMeters, 0) {
		return errors.New("invalid coordinates")
	}
	if p.RadiusMeters <= 0 {
		p.RadiusMeters = defaultRadiusMeters
	}
	return nil
}

func validCoordinate(latitude, longitude float64) bool {
	if math.IsNaN(latitude) || math.IsNaN(longitude) || math.IsInf(latitude, 0) || math.IsInf(longitude, 0) {
		return false
	}
	return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}
