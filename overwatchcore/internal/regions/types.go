package regions

// DefaultToleranceMeters is the street-frontage buffer. A coordinate just
// outside a drawn mall polygon still belongs to that district when it is
// within this distance. Zero means strict ST_Contains.
const DefaultToleranceMeters = 15.0

// MaxToleranceMeters keeps the buffer at frontage scale.
const MaxToleranceMeters = 1000.0

// Region is one named polygonal district.
type Region struct {
	ID               int
	Name             string
	RegionType       string
	ParentRegionID   int
	ParentName       string
	AreaSquareMeters float64
	Geom             MultiPolygon
}

// Hit is a region that contains a coordinate, smallest area first.
type Hit struct {
	ID               int     `json:"id"`
	Name             string  `json:"name"`
	RegionType       string  `json:"regionType"`
	ParentRegionID   *int    `json:"parentRegionId"`
	AreaSquareMeters float64 `json:"areaSquareMeters"`
}

func (r Region) hit() Hit {
	hit := Hit{
		ID:               r.ID,
		Name:             r.Name,
		RegionType:       r.RegionType,
		AreaSquareMeters: r.AreaSquareMeters,
	}
	if r.ParentRegionID != 0 {
		parent := r.ParentRegionID
		hit.ParentRegionID = &parent
	}
	return hit
}
