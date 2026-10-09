package pipeline

import (
	"context"
	"errors"
	"strings"
	"time"
)

// Store persists beacons and alert preferences and runs the spatial tag match.
type Store interface {
	SaveBeacon(ctx context.Context, beacon Beacon) (Beacon, error)
	SaveConfig(ctx context.Context, cfg AlertConfig) error
	UpdateLocation(ctx context.Context, userID string, latitude, longitude float64) error
	MatchBeacon(ctx context.Context, beaconID string) ([]AlertMatch, error)
	MatchUser(ctx context.Context, userID string) ([]AlertMatch, error)
}

// Service is the four-stage pipeline: resolve, store, match, dispatch.
type Service struct {
	Store  Store
	Dedupe Dedupe
	Push   PushSender
}

func NewService(store Store) *Service {
	return &Service{Store: store, Dedupe: NewMemoryDedupe(), Push: NewMemoryPush()}
}

// DropRequest is a verified place plus the channels to broadcast.
type DropRequest struct {
	HostID             string
	Label              string
	Channels           []string
	Latitude           float64
	Longitude          float64
	PlaceType          string
	CustomRadiusMeters *float64
	StartsAt           time.Time
	ExpiresAt          time.Time
	TrackedTags        []string
	MaxReceiveRadius   float64
	PushToken          string
}

// Drop resolves the boundary, stores the beacon, and fans out to matching people.
func (s *Service) Drop(ctx context.Context, req DropRequest) (Beacon, SpatialBoundary, []Delivery, error) {
	if s == nil || s.Store == nil {
		return Beacon{}, SpatialBoundary{}, nil, errors.New("pipeline store is not configured")
	}
	boundary, err := ResolveBoundary(req.Latitude, req.Longitude, req.PlaceType, req.CustomRadiusMeters)
	if err != nil {
		return Beacon{}, SpatialBoundary{}, nil, err
	}
	channels := cleanTags(req.Channels)
	if req.HostID == "" || len(channels) == 0 {
		return Beacon{}, SpatialBoundary{}, nil, errors.New("host and channels are required")
	}
	now := time.Now()
	starts := req.StartsAt
	if starts.IsZero() {
		starts = now
	}
	expires := req.ExpiresAt
	if !expires.After(starts) {
		expires = starts.Add(time.Hour)
	}
	beacon, err := s.Store.SaveBeacon(ctx, Beacon{
		HostID:       req.HostID,
		Label:        strings.TrimSpace(req.Label),
		Channels:     channels,
		Latitude:     boundary.CenterLat,
		Longitude:    boundary.CenterLon,
		RadiusMeters: boundary.RadiusMeters,
		SourceTier:   boundary.SourceTier,
		IsLive:       true,
		StartsAt:     starts,
		ExpiresAt:    expires,
	})
	if err != nil {
		return Beacon{}, boundary, nil, err
	}
	if len(req.TrackedTags) > 0 {
		_ = s.Store.SaveConfig(ctx, AlertConfig{
			UserID:                 req.HostID,
			TrackedTags:            cleanTags(req.TrackedTags),
			MaxReceiveRadiusMeters: req.MaxReceiveRadius,
			PushToken:              req.PushToken,
			Latitude:               boundary.CenterLat,
			Longitude:              boundary.CenterLon,
			HasLocation:            true,
		})
	}
	matches, err := s.Store.MatchBeacon(ctx, beacon.ID)
	if err != nil {
		return beacon, boundary, nil, err
	}
	return beacon, boundary, s.dispatch(ctx, matches), nil
}

// IngestLocation is one telemetry fix. It moves the user, then alerts for beacons they just entered.
func (s *Service) IngestLocation(ctx context.Context, userID string, latitude, longitude float64) ([]Delivery, error) {
	if err := s.Store.UpdateLocation(ctx, userID, latitude, longitude); err != nil {
		return nil, err
	}
	matches, err := s.Store.MatchUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	return s.dispatch(ctx, matches), nil
}

func (s *Service) dispatch(ctx context.Context, matches []AlertMatch) []Delivery {
	out := make([]Delivery, 0, len(matches))
	for _, match := range matches {
		payload, err := HandleProximityMatch(ctx, s.Dedupe, s.Push, match)
		delivery := Delivery{Match: match, Payload: payload, Delivered: err == nil}
		switch {
		case err == nil:
			delivery.Reason = "sent"
		case errors.Is(err, ErrAlreadyDelivered):
			delivery.Reason = "deduped"
		default:
			delivery.Reason = err.Error()
		}
		out = append(out, delivery)
	}
	return out
}

func cleanTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	seen := map[string]struct{}{}
	for _, tag := range tags {
		clean := strings.TrimSpace(tag)
		if clean == "" || clean == "All" {
			continue
		}
		if !strings.HasPrefix(clean, "#") {
			clean = "#" + clean
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		out = append(out, clean)
	}
	return out
}
