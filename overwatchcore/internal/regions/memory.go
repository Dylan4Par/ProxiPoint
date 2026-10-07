package regions

import (
	"context"
	"sort"
)

// MemoryIndex answers containment from the embedded polygons. It is the
// stand-in for ST_Contains / ST_DWithin when DATABASE_URL is unset.
type MemoryIndex struct {
	regions []Region
	byID    map[int]Region
}

func NewMemoryIndex() *MemoryIndex {
	loaded, err := LoadSeed()
	if err != nil {
		panic(err)
	}
	return NewMemoryIndexFrom(loaded)
}

func NewMemoryIndexFrom(regions []Region) *MemoryIndex {
	copied := make([]Region, len(regions))
	copy(copied, regions)
	byID := make(map[int]Region, len(copied))
	for _, region := range copied {
		byID[region.ID] = region
	}
	return &MemoryIndex{regions: copied, byID: byID}
}

// Lookup returns every region containing the point, plus ancestors, ordered
// by area so the most specific district is first.
func (m *MemoryIndex) Lookup(_ context.Context, longitude, latitude, toleranceMeters float64) ([]Hit, error) {
	matched := make([]Region, 0)
	for _, region := range m.regions {
		if !containsWithTolerance(region.Geom, longitude, latitude, toleranceMeters) {
			continue
		}
		matched = append(matched, region)
	}
	sort.SliceStable(matched, func(i, j int) bool {
		if matched[i].AreaSquareMeters == matched[j].AreaSquareMeters {
			return matched[i].Name < matched[j].Name
		}
		return matched[i].AreaSquareMeters < matched[j].AreaSquareMeters
	})

	seen := make(map[int]bool, len(matched))
	hits := make([]Hit, 0, len(matched))
	for _, region := range matched {
		seen[region.ID] = true
		hits = append(hits, region.hit())
	}
	for _, region := range matched {
		parentID := region.ParentRegionID
		for parentID != 0 {
			parent, ok := m.byID[parentID]
			if !ok || seen[parent.ID] {
				break
			}
			seen[parent.ID] = true
			hits = append(hits, parent.hit())
			parentID = parent.ParentRegionID
		}
	}
	if hits == nil {
		hits = []Hit{}
	}
	return hits, nil
}

func containsWithTolerance(geom MultiPolygon, longitude, latitude, toleranceMeters float64) bool {
	if geom.Contains(longitude, latitude) {
		return true
	}
	if toleranceMeters <= 0 {
		return false
	}
	return geom.DistanceMeters(longitude, latitude) <= toleranceMeters
}
