package regions

import (
	"context"
	"strings"
	"testing"
)

func TestSeedHierarchyAndMallContainment(t *testing.T) {
	index := NewMemoryIndex()
	if len(index.regions) != 4 {
		t.Fatalf("seed regions = %d, want 4", len(index.regions))
	}

	// The documented Pearl Street coordinate sits on the street frontage,
	// about 11m outside the OSM retail polygon. Strict containment misses
	// the mall; the 15m buffer includes it and the enclosing districts.
	frontage, err := index.Lookup(context.Background(), -105.2785, 40.0176, DefaultToleranceMeters)
	if err != nil {
		t.Fatal(err)
	}
	assertNames(t, frontage, []string{
		"Pearl Street Mall",
		"Downtown Boulder",
		"Boulder",
		"Boulder County",
	})
	if frontage[0].RegionType != "pedestrian_mall" {
		t.Fatalf("mall type = %s", frontage[0].RegionType)
	}
	if frontage[0].ParentRegionID == nil {
		t.Fatal("mall should reference its parent district")
	}

	strict, err := index.Lookup(context.Background(), -105.2785, 40.0176, 0)
	if err != nil {
		t.Fatal(err)
	}
	assertNames(t, strict, []string{"Downtown Boulder", "Boulder", "Boulder County"})

	interior, err := index.Lookup(context.Background(), -105.2800, 40.0179, 0)
	if err != nil {
		t.Fatal(err)
	}
	assertNames(t, interior, []string{
		"Pearl Street Mall",
		"Downtown Boulder",
		"Boulder",
		"Boulder County",
	})

	outside, err := index.Lookup(context.Background(), -77.6, 39.0, DefaultToleranceMeters)
	if err != nil {
		t.Fatal(err)
	}
	if len(outside) != 0 {
		t.Fatalf("virginia point matched %#v", outside)
	}

	cityOnly, err := index.Lookup(context.Background(), -105.30, 40.02, 0)
	if err != nil {
		t.Fatal(err)
	}
	assertNames(t, cityOnly, []string{"Boulder", "Boulder County"})
}

func TestLookupSQLUsesContainmentAndHierarchy(t *testing.T) {
	required := []string{
		"ST_Contains",
		"ST_SetSRID(ST_Point($1, $2), 4326)",
		"ST_DWithin",
		"::geography",
		"$3",
		"parent_region_id",
		"ORDER BY area_square_meters ASC",
	}
	for _, snippet := range required {
		if !strings.Contains(lookupSQL, snippet) {
			t.Fatalf("lookup SQL missing %s", snippet)
		}
	}
	if !strings.Contains(schemaSQL, "GEOMETRY(MultiPolygon, 4326)") {
		t.Fatal("regions.geom must be a MultiPolygon in SRID 4326")
	}
	if !strings.Contains(schemaSQL, "idx_regions_geom") || !strings.Contains(schemaSQL, "USING GIST (geom)") {
		t.Fatal("regions.geom needs GiST index idx_regions_geom")
	}
	if !strings.Contains(insertRegionSQL, "ST_Multi") || !strings.Contains(insertRegionSQL, "ST_GeomFromGeoJSON") {
		t.Fatal("seed insert must store a MultiPolygon")
	}
}

func assertNames(t *testing.T, hits []Hit, want []string) {
	t.Helper()
	if len(hits) != len(want) {
		t.Fatalf("names = %v, want %v", namesOf(hits), want)
	}
	for i, name := range want {
		if hits[i].Name != name {
			t.Fatalf("names = %v, want %v", namesOf(hits), want)
		}
		if i > 0 && hits[i].AreaSquareMeters < hits[i-1].AreaSquareMeters {
			t.Fatalf("areas not ascending: %v then %v", hits[i-1], hits[i])
		}
	}
}

func namesOf(hits []Hit) []string {
	names := make([]string, len(hits))
	for i, hit := range hits {
		names[i] = hit.Name
	}
	return names
}
