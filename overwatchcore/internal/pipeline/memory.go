package pipeline

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

// MemoryStore is the PostGIS stand-in used when DATABASE_URL is unset.
// Matching follows the same tag intersection and radius rules as ST_DWithin.
type MemoryStore struct {
	mu      sync.Mutex
	beacons map[string]Beacon
	configs map[string]AlertConfig
	now     func() time.Time
}

func NewMemoryStore() *MemoryStore {
	store := newMemoryStore()
	// A downtown watcher so a Pearl Street drop can fan out without Postgres.
	_ = store.SaveConfig(context.Background(), AlertConfig{
		UserID:                 "maya_chen",
		TrackedTags:            []string{"#ArtWalk", "#LiveMusic", "#FoodTrucks"},
		MaxReceiveRadiusMeters: 10000,
		PushToken:              "demo-maya",
		Latitude:               40.0175,
		Longitude:              -105.2792,
		HasLocation:            true,
	})
	return store
}

func NewEmptyMemoryStore() *MemoryStore {
	return newMemoryStore()
}

func newMemoryStore() *MemoryStore {
	return &MemoryStore{
		beacons: map[string]Beacon{},
		configs: map[string]AlertConfig{},
		now:     time.Now,
	}
}

func (s *MemoryStore) SaveBeacon(_ context.Context, beacon Beacon) (Beacon, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if beacon.ID == "" {
		beacon.ID = newID()
	}
	if beacon.Channels == nil {
		beacon.Channels = []string{}
	}
	s.beacons[beacon.ID] = beacon
	return beacon, nil
}

func (s *MemoryStore) SaveConfig(_ context.Context, cfg AlertConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if cfg.TrackedTags == nil {
		cfg.TrackedTags = []string{}
	}
	if cfg.MaxReceiveRadiusMeters <= 0 {
		cfg.MaxReceiveRadiusMeters = 10000
	}
	s.configs[cfg.UserID] = cfg
	return nil
}

func (s *MemoryStore) UpdateLocation(_ context.Context, userID string, latitude, longitude float64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, ok := s.configs[userID]
	if !ok {
		return nil
	}
	cfg.Latitude = latitude
	cfg.Longitude = longitude
	cfg.HasLocation = true
	s.configs[userID] = cfg
	return nil
}

func (s *MemoryStore) MatchBeacon(_ context.Context, beaconID string) ([]AlertMatch, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	beacon, ok := s.beacons[beaconID]
	if !ok || !s.active(beacon) {
		return []AlertMatch{}, nil
	}
	return s.matches(beacon, s.configs), nil
}

func (s *MemoryStore) MatchUser(_ context.Context, userID string) ([]AlertMatch, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cfg, ok := s.configs[userID]
	if !ok || !cfg.HasLocation {
		return []AlertMatch{}, nil
	}
	found := make([]AlertMatch, 0)
	for _, beacon := range s.beacons {
		if !s.active(beacon) || beacon.HostID == cfg.UserID {
			continue
		}
		if match, ok := pair(beacon, cfg); ok {
			found = append(found, match)
		}
	}
	return found, nil
}

func (s *MemoryStore) active(beacon Beacon) bool {
	now := s.now()
	return beacon.IsLive && !now.Before(beacon.StartsAt) && now.Before(beacon.ExpiresAt)
}

func (s *MemoryStore) matches(beacon Beacon, configs map[string]AlertConfig) []AlertMatch {
	found := make([]AlertMatch, 0)
	for _, cfg := range configs {
		if match, ok := pair(beacon, cfg); ok {
			found = append(found, match)
		}
	}
	return found
}

func pair(beacon Beacon, cfg AlertConfig) (AlertMatch, bool) {
	if !cfg.HasLocation || cfg.UserID == beacon.HostID {
		return AlertMatch{}, false
	}
	tags := intersectTags(beacon.Channels, cfg.TrackedTags)
	if len(tags) == 0 {
		return AlertMatch{}, false
	}
	distance := DistanceMeters(cfg.Latitude, cfg.Longitude, beacon.Latitude, beacon.Longitude)
	if !within(distance, beacon.RadiusMeters) || !within(distance, cfg.MaxReceiveRadiusMeters) {
		return AlertMatch{}, false
	}
	return AlertMatch{
		UserID:         cfg.UserID,
		PushToken:      cfg.PushToken,
		BeaconID:       beacon.ID,
		BeaconLabel:    beacon.Label,
		MatchedTags:    tags,
		DistanceMeters: distance,
	}, true
}

func newID() string {
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format("150405.000")))
	}
	return hex.EncodeToString(buf[:])
}
