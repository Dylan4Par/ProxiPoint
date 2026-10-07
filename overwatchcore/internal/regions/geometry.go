package regions

import "math"

const earthRadiusMeters = 6371000.0

// MultiPolygon is a GeoJSON MultiPolygon: polygons of rings of [lon, lat].
type MultiPolygon [][][][2]float64

func (g MultiPolygon) Contains(longitude, latitude float64) bool {
	for _, polygon := range g {
		if polygonContains(longitude, latitude, polygon) {
			return true
		}
	}
	return false
}

// DistanceMeters is 0 when the point is inside. Otherwise it is the
// equirectangular distance in meters to the nearest ring edge.
func (g MultiPolygon) DistanceMeters(longitude, latitude float64) float64 {
	if g.Contains(longitude, latitude) {
		return 0
	}
	best := math.Inf(1)
	for _, polygon := range g {
		for _, ring := range polygon {
			for i := 0; i < len(ring); i++ {
				next := ring[(i+1)%len(ring)]
				distance := distancePointToSegmentMeters(longitude, latitude, ring[i], next)
				if distance < best {
					best = distance
				}
			}
		}
	}
	return best
}

func (g MultiPolygon) AreaSquareMeters() float64 {
	total := 0.0
	for _, polygon := range g {
		if len(polygon) == 0 {
			continue
		}
		area := ringAreaSquareMeters(polygon[0])
		for _, hole := range polygon[1:] {
			area -= ringAreaSquareMeters(hole)
		}
		if area > 0 {
			total += area
		}
	}
	return total
}

func polygonContains(longitude, latitude float64, rings [][][2]float64) bool {
	if len(rings) == 0 || !pointInRing(longitude, latitude, rings[0]) {
		return false
	}
	for _, hole := range rings[1:] {
		if pointInRing(longitude, latitude, hole) {
			return false
		}
	}
	return true
}

func pointInRing(longitude, latitude float64, ring [][2]float64) bool {
	inside := false
	j := len(ring) - 1
	for i := 0; i < len(ring); i++ {
		xi, yi := ring[i][0], ring[i][1]
		xj, yj := ring[j][0], ring[j][1]
		if (yi > latitude) != (yj > latitude) &&
			longitude < (xj-xi)*(latitude-yi)/(yj-yi)+xi {
			inside = !inside
		}
		j = i
	}
	return inside
}

func ringAreaSquareMeters(ring [][2]float64) float64 {
	if len(ring) < 3 {
		return 0
	}
	lon0, lat0 := ring[0][0], ring[0][1]
	sum := 0.0
	for i := 0; i < len(ring); i++ {
		next := ring[(i+1)%len(ring)]
		x1, y1 := projectMeters(ring[i][0], ring[i][1], lon0, lat0)
		x2, y2 := projectMeters(next[0], next[1], lon0, lat0)
		sum += x1*y2 - x2*y1
	}
	return math.Abs(sum) / 2
}

func distancePointToSegmentMeters(longitude, latitude float64, a, b [2]float64) float64 {
	ax, ay := projectMeters(a[0], a[1], longitude, latitude)
	bx, by := projectMeters(b[0], b[1], longitude, latitude)
	dx, dy := bx-ax, by-ay
	denom := dx*dx + dy*dy
	t := 0.0
	if denom > 0 {
		t = (-ax*dx - ay*dy) / denom
		if t < 0 {
			t = 0
		} else if t > 1 {
			t = 1
		}
	}
	return math.Hypot(ax+t*dx, ay+t*dy)
}

func projectMeters(longitude, latitude, originLon, originLat float64) (float64, float64) {
	cosLat := math.Cos(originLat * math.Pi / 180)
	x := (longitude - originLon) * math.Pi / 180 * cosLat * earthRadiusMeters
	y := (latitude - originLat) * math.Pi / 180 * earthRadiusMeters
	return x, y
}
