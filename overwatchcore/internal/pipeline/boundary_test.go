package pipeline

import "testing"

func TestResolveBoundaryUsesSemanticTier(t *testing.T) {
	cases := []struct {
		placeType string
		tier      string
		radius    float64
	}{
		{"poi", "poi", 300},
		{"address", "address", 300},
		{"house", "address", 300},
		{"neighborhood", "neighborhood", 1500},
		{"neighbourhood", "neighborhood", 1500},
		{"locality", "locality", 8000},
		{"city", "city", 8000},
		{"place", "place", 1000},
		{"", "place", 1000},
	}
	for _, tc := range cases {
		boundary, err := ResolveBoundary(40.017, -105.279, tc.placeType, nil)
		if err != nil {
			t.Fatal(err)
		}
		if boundary.SourceTier != tc.tier || boundary.RadiusMeters != tc.radius {
			t.Fatalf("%s -> %+v, want tier %s radius %v", tc.placeType, boundary, tc.tier, tc.radius)
		}
		if boundary.CenterLat != 40.017 || boundary.CenterLon != -105.279 {
			t.Fatalf("center = %v,%v", boundary.CenterLat, boundary.CenterLon)
		}
	}
}

func TestCustomRadiusReplacesTheTier(t *testing.T) {
	custom := 500.0
	boundary, err := ResolveBoundary(40.017, -105.279, "city", &custom)
	if err != nil {
		t.Fatal(err)
	}
	if boundary.RadiusMeters != 500 || boundary.SourceTier != "city" {
		t.Fatalf("boundary = %+v", boundary)
	}
	if _, err := ResolveBoundary(120, 0, "poi", nil); err == nil {
		t.Fatal("expected invalid coordinates")
	}
}
