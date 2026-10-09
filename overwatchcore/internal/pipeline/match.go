package pipeline

import "math"

func intersectTags(left, right []string) []string {
	seen := make(map[string]struct{}, len(right))
	for _, tag := range right {
		if tag == "" {
			continue
		}
		seen[tag] = struct{}{}
	}
	matched := make([]string, 0)
	used := make(map[string]struct{})
	for _, tag := range left {
		if _, ok := seen[tag]; !ok {
			continue
		}
		if _, already := used[tag]; already {
			continue
		}
		used[tag] = struct{}{}
		matched = append(matched, tag)
	}
	return matched
}

// DistanceMeters is the haversine stand-in for ST_Distance on geography.
func DistanceMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earth = 6371000.0
	r1 := lat1 * math.Pi / 180
	r2 := lat2 * math.Pi / 180
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(r1)*math.Cos(r2)*math.Sin(dLon/2)*math.Sin(dLon/2)
	return 2 * earth * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

func within(distance, radius float64) bool {
	return radius > 0 && distance <= radius
}
