package pipeline

import (
	"errors"
	"math"
	"strings"
)

// SpatialBoundary is the broadcast disk resolved from a place name.
type SpatialBoundary struct {
	CenterLat    float64 `json:"center_lat"`
	CenterLon    float64 `json:"center_lon"`
	RadiusMeters float64 `json:"radius_meters"`
	SourceTier   string  `json:"source_tier"`
}

// ResolveBoundary turns a geocoder place type into a broadcast radius.
// A positive custom radius replaces the tier default.
func ResolveBoundary(latitude, longitude float64, placeType string, customRadius *float64) (SpatialBoundary, error) {
	if !validCoordinate(latitude, longitude) {
		return SpatialBoundary{}, errors.New("invalid coordinates")
	}
	tier := NormalizePlaceType(placeType)
	radius := radiusForTier(tier)
	if customRadius != nil && *customRadius > 0 && !math.IsNaN(*customRadius) && !math.IsInf(*customRadius, 0) {
		radius = *customRadius
	}
	return SpatialBoundary{
		CenterLat:    latitude,
		CenterLon:    longitude,
		RadiusMeters: radius,
		SourceTier:   tier,
	}, nil
}

// NormalizePlaceType maps geocoder labels onto the boundary tiers.
func NormalizePlaceType(placeType string) string {
	switch strings.ToLower(strings.TrimSpace(placeType)) {
	case "poi", "amenity", "shop", "tourism":
		return "poi"
	case "address", "house", "street", "building":
		return "address"
	case "neighborhood", "neighbourhood", "suburb", "district", "quarter":
		return "neighborhood"
	case "locality", "town", "municipality":
		return "locality"
	case "city":
		return "city"
	default:
		return "place"
	}
}

func radiusForTier(tier string) float64 {
	switch tier {
	case "poi", "address":
		return 300
	case "neighborhood":
		return 1500
	case "locality", "city":
		return 8000
	default:
		return 1000
	}
}

func validCoordinate(latitude, longitude float64) bool {
	if math.IsNaN(latitude) || math.IsNaN(longitude) || math.IsInf(latitude, 0) || math.IsInf(longitude, 0) {
		return false
	}
	return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}
