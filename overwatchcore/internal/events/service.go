package events

import (
	"context"
	"crypto/rand"
	"fmt"
	"log"
)

// Service creates beacons, ingests tracker fixes, and fans out new alerts.
type Service struct {
	store  Store
	dedupe Deduper
	hub    *Hub
}

func NewService(store Store, dedupe Deduper, hub *Hub) *Service {
	return &Service{store: store, dedupe: dedupe, hub: hub}
}

func (s *Service) CreateBeacon(ctx context.Context, beacon Beacon) (Beacon, []string, error) {
	if err := beacon.normalize(); err != nil {
		return Beacon{}, nil, err
	}
	if beacon.ID == "" {
		beacon.ID = newID()
	}
	if err := s.store.InsertBeacon(ctx, beacon); err != nil {
		return Beacon{}, nil, err
	}
	if beacon.Visibility == "private" {
		return beacon, []string{}, nil
	}
	users, err := s.store.UsersInside(ctx, beacon)
	if err != nil {
		return Beacon{}, nil, err
	}
	fresh := s.claimUsers(ctx, beacon.ID, users)
	if len(fresh) > 0 {
		s.hub.Broadcast(alertMessage(beacon, fresh))
	}
	return beacon, fresh, nil
}

func (s *Service) IngestLocation(ctx context.Context, fix TrackerFix) ([]ProximityAlertMessage, error) {
	if err := fix.normalize(); err != nil {
		return nil, err
	}
	if err := s.store.UpsertTracker(ctx, fix); err != nil {
		return nil, err
	}
	hits, err := s.store.BeaconsCovering(ctx, fix)
	if err != nil {
		return nil, err
	}
	alerts := make([]ProximityAlertMessage, 0)
	for _, beacon := range hits {
		fresh := s.claimUsers(ctx, beacon.ID, []string{fix.UserID})
		if len(fresh) == 0 {
			continue
		}
		message := alertMessage(beacon, fresh)
		s.hub.Broadcast(message)
		alerts = append(alerts, message)
	}
	return alerts, nil
}

func (s *Service) claimUsers(ctx context.Context, beaconID string, userIDs []string) []string {
	fresh := make([]string, 0, len(userIDs))
	for _, userID := range userIDs {
		claimed, err := s.dedupe.Claim(ctx, userID, beaconID)
		if err != nil {
			log.Printf("alert dedupe %s: %v", AlertSentKey(userID, beaconID), err)
			continue
		}
		if claimed {
			fresh = append(fresh, userID)
		}
	}
	return fresh
}

func alertMessage(beacon Beacon, userIDs []string) ProximityAlertMessage {
	return ProximityAlertMessage{
		Type:         "proximity_alert",
		BeaconID:     beacon.ID,
		Title:        beacon.Title,
		Venue:        beacon.Venue,
		Latitude:     beacon.Latitude,
		Longitude:    beacon.Longitude,
		RadiusMeters: beacon.RadiusMeters,
		UserIDs:      userIDs,
	}
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
