package regions

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed seed.geojson
var seedGeoJSON []byte

//go:embed schema.sql
var schemaSQL string

type seedCollection struct {
	Features []seedFeature `json:"features"`
}

type seedFeature struct {
	Properties struct {
		Name       string `json:"name"`
		RegionType string `json:"region_type"`
		ParentName string `json:"parent_name"`
	} `json:"properties"`
	Geometry struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	} `json:"geometry"`
}

// LoadSeed reads the embedded district polygons. IDs follow feature order
// so a parent listed earlier resolves to a stable parent_region_id.
func LoadSeed() ([]Region, error) {
	var collection seedCollection
	if err := json.Unmarshal(seedGeoJSON, &collection); err != nil {
		return nil, err
	}
	if len(collection.Features) == 0 {
		return nil, fmt.Errorf("region seed has no features")
	}

	regions := make([]Region, 0, len(collection.Features))
	indexByName := make(map[string]int, len(collection.Features))
	for _, feature := range collection.Features {
		name := feature.Properties.Name
		if name == "" || feature.Properties.RegionType == "" {
			return nil, fmt.Errorf("region seed feature is missing name or region_type")
		}
		if _, exists := indexByName[name]; exists {
			return nil, fmt.Errorf("duplicate region name %q", name)
		}
		geom, err := decodeMultiPolygon(feature.Geometry.Type, feature.Geometry.Coordinates)
		if err != nil {
			return nil, fmt.Errorf("region %q: %w", name, err)
		}
		region := Region{
			ID:               len(regions) + 1,
			Name:             name,
			RegionType:       feature.Properties.RegionType,
			ParentName:       feature.Properties.ParentName,
			AreaSquareMeters: geom.AreaSquareMeters(),
			Geom:             geom,
		}
		indexByName[name] = len(regions)
		regions = append(regions, region)
	}
	for i := range regions {
		parentName := regions[i].ParentName
		if parentName == "" {
			continue
		}
		parentIndex, ok := indexByName[parentName]
		if !ok {
			return nil, fmt.Errorf("region %q parent %q is not in the seed", regions[i].Name, parentName)
		}
		if parentIndex >= i {
			return nil, fmt.Errorf("region %q parent %q must be declared first", regions[i].Name, parentName)
		}
		regions[i].ParentRegionID = regions[parentIndex].ID
	}
	return regions, nil
}

func decodeMultiPolygon(geomType string, raw json.RawMessage) (MultiPolygon, error) {
	switch geomType {
	case "Polygon":
		var rings [][][2]float64
		if err := json.Unmarshal(raw, &rings); err != nil {
			return nil, err
		}
		return MultiPolygon{rings}, nil
	case "MultiPolygon":
		var polygons [][][][2]float64
		if err := json.Unmarshal(raw, &polygons); err != nil {
			return nil, err
		}
		return polygons, nil
	default:
		return nil, fmt.Errorf("unsupported geometry %s", geomType)
	}
}
