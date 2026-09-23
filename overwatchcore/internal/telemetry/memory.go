package telemetry

import (
	"context"
	"math"
)

const metersPerDegreeLatitude = 111320.0

// demoTarget is a virtual entity placed due north of the querying device.
type demoTarget struct {
	id          string
	label       string
	northMeters float64
}

// Demo targets sit inside the HUD radius presets so 50m, 100m, 250m, and
// 500m each reveal a larger set.
var demoTargets = []demoTarget{
	{id: "alpha", label: "Alpha", northMeters: 30},
	{id: "bravo", label: "Bravo", northMeters: 80},
	{id: "charlie", label: "Charlie", northMeters: 200},
	{id: "delta", label: "Delta", northMeters: 420},
}

// MemoryIndex is a PostGIS stand-in for local runs without DATABASE_URL.
// It keeps entities whose haversine distance is within radiusMeters, matching
// ST_DWithin(..., radiusMeters) on a geography column.
type MemoryIndex struct {
	targets []demoTarget
}

func NewMemoryIndex(targets []demoTarget) *MemoryIndex {
	copied := make([]demoTarget, len(targets))
	copy(copied, targets)
	return &MemoryIndex{targets: copied}
}

func NewDemoIndex() *MemoryIndex {
	return NewMemoryIndex(demoTargets)
}

func (m *MemoryIndex) QueryNearbyEntities(_ context.Context, longitude, latitude, radiusMeters float64) ([]ProximityAlert, error) {
	alerts := make([]ProximityAlert, 0)
	for _, target := range m.targets {
		alertLat := latitude + target.northMeters/metersPerDegreeLatitude
		distance := haversineMeters(latitude, longitude, alertLat, longitude)
		if distance > radiusMeters {
			continue
		}
		alerts = append(alerts, ProximityAlert{
			ID:             target.id,
			Label:          target.label,
			Latitude:       alertLat,
			Longitude:      longitude,
			DistanceMeters: distance,
		})
	}
	return alerts, nil
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371e3
	phi1 := degreesToRadians(lat1)
	phi2 := degreesToRadians(lat2)
	dPhi := degreesToRadians(lat2 - lat1)
	dLambda := degreesToRadians(lon2 - lon1)

	a := math.Pow(math.Sin(dPhi/2), 2) + math.Cos(phi1)*math.Cos(phi2)*math.Pow(math.Sin(dLambda/2), 2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return earthRadius * c
}

func degreesToRadians(degrees float64) float64 {
	return degrees * math.Pi / 180
}
