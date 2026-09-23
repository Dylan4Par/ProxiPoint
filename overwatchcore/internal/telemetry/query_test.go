package telemetry

import (
	"context"
	"strings"
	"testing"
)

func TestNearbySQLUsesPayloadRadius(t *testing.T) {
	if !strings.Contains(nearbyEntitiesSQL, "ST_DWithin") {
		t.Fatal("query must filter with ST_DWithin")
	}
	if !strings.Contains(nearbyEntitiesSQL, "$3") {
		t.Fatal("radiusMeters must be bound as $3")
	}
	if strings.Contains(nearbyEntitiesSQL, "100") {
		t.Fatal("geofence radius must come from the ping, not a hardcoded 100m")
	}
}

func TestMemoryIndexRespectsRadiusPresets(t *testing.T) {
	index := NewDemoIndex()
	cases := []struct {
		radius float64
		want   int
	}{
		{radius: 50, want: 1},
		{radius: 100, want: 2},
		{radius: 250, want: 3},
		{radius: 500, want: 4},
	}
	for _, tc := range cases {
		alerts, err := index.QueryNearbyEntities(context.Background(), -122.42, 37.77, tc.radius)
		if err != nil {
			t.Fatal(err)
		}
		if len(alerts) != tc.want {
			t.Fatalf("radius %v returned %d alerts, want %d", tc.radius, len(alerts), tc.want)
		}
		for _, alert := range alerts {
			if alert.DistanceMeters > tc.radius {
				t.Fatalf("alert %s distance %v exceeds radius %v", alert.ID, alert.DistanceMeters, tc.radius)
			}
		}
	}
}
