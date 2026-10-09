package pipeline

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestDropFansOutToATrackedNeighbor(t *testing.T) {
	svc := NewService(NewEmptyMemoryStore())
	ctx := context.Background()
	if err := svc.Store.SaveConfig(ctx, AlertConfig{
		UserID:                 "jordan",
		TrackedTags:            []string{"#ArtWalk", "#FoodTrucks"},
		MaxReceiveRadiusMeters: 10000,
		PushToken:              "jordan-token",
		Latitude:               40.0176,
		Longitude:              -105.2784,
		HasLocation:            true,
	}); err != nil {
		t.Fatal(err)
	}
	radius := 500.0
	beacon, boundary, deliveries, err := svc.Drop(ctx, DropRequest{
		HostID:             "Ranger-F0A5ACCF",
		Label:              "Pearl Street Mall",
		Channels:           []string{"#ArtWalk", "#LiveMusic"},
		Latitude:           40.017,
		Longitude:          -105.279,
		PlaceType:          "poi",
		CustomRadiusMeters: &radius,
	})
	if err != nil {
		t.Fatal(err)
	}
	if boundary.SourceTier != "poi" || boundary.RadiusMeters != 500 {
		t.Fatalf("boundary = %+v", boundary)
	}
	if beacon.HostID != "Ranger-F0A5ACCF" || len(deliveries) != 1 || !deliveries[0].Delivered {
		t.Fatalf("beacon %+v deliveries %+v", beacon, deliveries)
	}
	if deliveries[0].Match.UserID != "jordan" || deliveries[0].Payload.Data["type"] != "PROXIMITY_BEACON_MATCH" {
		t.Fatalf("delivery = %+v", deliveries[0])
	}
	if !strings.Contains(deliveries[0].Payload.Title, "#ArtWalk") {
		t.Fatalf("title = %s", deliveries[0].Payload.Title)
	}

	again, err := svc.Store.MatchBeacon(ctx, beacon.ID)
	if err != nil || len(again) != 1 {
		t.Fatalf("second match = %+v %v", again, err)
	}
	repeat := svc.dispatch(ctx, again)
	if len(repeat) != 1 || repeat[0].Reason != "deduped" || repeat[0].Delivered {
		t.Fatalf("repeat = %+v", repeat)
	}
}

func TestDropSkipsPeopleOutsideTheRadiusOrTags(t *testing.T) {
	svc := NewService(NewEmptyMemoryStore())
	ctx := context.Background()
	_ = svc.Store.SaveConfig(ctx, AlertConfig{
		UserID: "far", TrackedTags: []string{"#ArtWalk"}, MaxReceiveRadiusMeters: 10000,
		Latitude: 40.2, Longitude: -105.5, HasLocation: true, PushToken: "far",
	})
	_ = svc.Store.SaveConfig(ctx, AlertConfig{
		UserID: "other-tags", TrackedTags: []string{"#Pickleball"}, MaxReceiveRadiusMeters: 10000,
		Latitude: 40.0176, Longitude: -105.2784, HasLocation: true, PushToken: "tags",
	})
	_ = svc.Store.SaveConfig(ctx, AlertConfig{
		UserID: "quiet", TrackedTags: []string{"#ArtWalk"}, MaxReceiveRadiusMeters: 50,
		Latitude: 40.0185, Longitude: -105.279, HasLocation: true, PushToken: "quiet",
	})
	radius := 300.0
	_, _, deliveries, err := svc.Drop(ctx, DropRequest{
		HostID: "host", Channels: []string{"ArtWalk"}, Latitude: 40.017, Longitude: -105.279,
		PlaceType: "address", CustomRadiusMeters: &radius,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(deliveries) != 0 {
		t.Fatalf("deliveries = %+v", deliveries)
	}
}

func TestMovingUserEntersALiveBeacon(t *testing.T) {
	store := NewEmptyMemoryStore()
	svc := NewService(store)
	ctx := context.Background()
	_ = store.SaveConfig(ctx, AlertConfig{
		UserID: "walker", TrackedTags: []string{"#LiveMusic"}, MaxReceiveRadiusMeters: 2000,
		PushToken: "walker-token", Latitude: 39.9, Longitude: -105.1, HasLocation: true,
	})
	saved, err := store.SaveBeacon(ctx, Beacon{
		HostID: "band", Label: "The Rusty Anchor", Channels: []string{"#LiveMusic"},
		Latitude: 40.017458, Longitude: -105.283779, RadiusMeters: 300, IsLive: true,
		StartsAt: time.Now().Add(-time.Minute), ExpiresAt: time.Now().Add(time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	far, err := svc.IngestLocation(ctx, "walker", 39.9, -105.1)
	if err != nil || len(far) != 0 {
		t.Fatalf("far alerts = %+v %v", far, err)
	}
	near, err := svc.IngestLocation(ctx, "walker", 40.0175, -105.2838)
	if err != nil || len(near) != 1 || near[0].Match.BeaconID != saved.ID || !near[0].Delivered {
		t.Fatalf("near alerts = %+v %v", near, err)
	}
}

func TestMatchSQLUsesTagIntersectionAndDistance(t *testing.T) {
	for _, query := range []string{DropMatchSQL, MoveMatchSQL, schemaSQL} {
		if !strings.Contains(query, "ST_DWithin") && query != schemaSQL {
			t.Fatalf("missing ST_DWithin: %s", query)
		}
	}
	if !strings.Contains(DropMatchSQL, "u.tracked_tags && b.channels") {
		t.Fatal("drop match must use the tag overlap operator")
	}
	if !strings.Contains(schemaSQL, "USING GIST") || !strings.Contains(schemaSQL, "USING GIN") {
		t.Fatal("schema must index location and tags")
	}
}
