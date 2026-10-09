package events

import (
	"context"
	"math"
	"strings"
	"sync"
	"time"
)

const alertTTL = 6 * time.Hour

// Beacon is a persisted broadcast perimeter.
type Beacon struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	Venue         string   `json:"venue"`
	Channels      []string `json:"channels"`
	Latitude      float64  `json:"latitude"`
	Longitude     float64  `json:"longitude"`
	RadiusMeters  float64  `json:"radius_meters"`
	Visibility    string   `json:"visibility"`
	DurationHours float64  `json:"duration_hours"`
}

// TrackerFix is a mobile location update.
type TrackerFix struct {
	UserID      string   `json:"userId"`
	Latitude    float64  `json:"latitude"`
	Longitude   float64  `json:"longitude"`
	TrackedTags []string `json:"trackedTags"`
}

// ProximityAlertMessage is fanned out to connected WebSocket clients.
type ProximityAlertMessage struct {
	Type         string   `json:"type"`
	BeaconID     string   `json:"beacon_id"`
	Title        string   `json:"title"`
	Venue        string   `json:"venue"`
	Latitude     float64  `json:"latitude"`
	Longitude    float64  `json:"longitude"`
	RadiusMeters float64  `json:"radius_meters"`
	UserIDs      []string `json:"user_ids"`
}

// Store persists beacons and evaluates ST_DWithin candidates.
type Store interface {
	InsertBeacon(ctx context.Context, beacon Beacon) error
	UsersInside(ctx context.Context, beacon Beacon) ([]string, error)
	UpsertTracker(ctx context.Context, fix TrackerFix) error
	BeaconsCovering(ctx context.Context, fix TrackerFix) ([]Beacon, error)
}

// Deduper claims alert_sent:<user_id>:<beacon_id> for the Redis TTL window.
type Deduper interface {
	Claim(ctx context.Context, userID, beaconID string) (bool, error)
}

func AlertSentKey(userID, beaconID string) string {
	return "alert_sent:" + userID + ":" + beaconID
}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }

func invalid(msg string) error { return &validationError{msg: msg} }

func (b *Beacon) normalize() error {
	b.Title = strings.TrimSpace(b.Title)
	b.Venue = strings.TrimSpace(b.Venue)
	if b.Title == "" || b.Venue == "" {
		return invalid("title and venue are required")
	}
	switch b.Visibility {
	case "private", "tag_network", "public":
	default:
		return invalid("invalid visibility")
	}
	if !validCoordinate(b.Latitude, b.Longitude) || b.RadiusMeters <= 0 || math.IsNaN(b.RadiusMeters) || b.DurationHours <= 0 {
		return invalid("invalid coordinates, radius, or duration")
	}
	b.Channels = normalizeTags(b.Channels)
	return nil
}

func (f *TrackerFix) normalize() error {
	f.UserID = strings.TrimSpace(f.UserID)
	if f.UserID == "" {
		return invalid("userId is required")
	}
	if !validCoordinate(f.Latitude, f.Longitude) {
		return invalid("invalid coordinates")
	}
	f.TrackedTags = normalizeTags(f.TrackedTags)
	return nil
}

func normalizeTags(tags []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(tags))
	for _, tag := range tags {
		clean := strings.TrimSpace(tag)
		if clean == "" {
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

func validCoordinate(latitude, longitude float64) bool {
	if math.IsNaN(latitude) || math.IsNaN(longitude) || math.IsInf(latitude, 0) || math.IsInf(longitude, 0) {
		return false
	}
	return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}

func tagsOverlap(left, right []string) bool {
	if len(left) == 0 || len(right) == 0 {
		return false
	}
	set := make(map[string]struct{}, len(left))
	for _, tag := range left {
		set[tag] = struct{}{}
	}
	for _, tag := range right {
		if _, ok := set[tag]; ok {
			return true
		}
	}
	return false
}

func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371e3
	phi1 := lat1 * math.Pi / 180
	phi2 := lat2 * math.Pi / 180
	dPhi := (lat2 - lat1) * math.Pi / 180
	dLambda := (lon2 - lon1) * math.Pi / 180
	a := math.Pow(math.Sin(dPhi/2), 2) + math.Cos(phi1)*math.Cos(phi2)*math.Pow(math.Sin(dLambda/2), 2)
	return earthRadius * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}

type tracker struct {
	tags      []string
	latitude  float64
	longitude float64
	hasFix    bool
}

// MemoryStore is the PostGIS stand-in used when DATABASE_URL is unset.
type MemoryStore struct {
	mu       sync.Mutex
	beacons  []Beacon
	trackers map[string]tracker
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{trackers: map[string]tracker{}}
}

func (m *MemoryStore) InsertBeacon(_ context.Context, beacon Beacon) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.beacons = append(m.beacons, beacon)
	return nil
}

func (m *MemoryStore) UsersInside(_ context.Context, beacon Beacon) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	users := make([]string, 0)
	for userID, tracker := range m.trackers {
		if !tracker.hasFix || !tagsOverlap(tracker.tags, beacon.Channels) {
			continue
		}
		distance := haversineMeters(tracker.latitude, tracker.longitude, beacon.Latitude, beacon.Longitude)
		if distance <= beacon.RadiusMeters {
			users = append(users, userID)
		}
	}
	return users, nil
}

func (m *MemoryStore) UpsertTracker(_ context.Context, fix TrackerFix) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	current := m.trackers[fix.UserID]
	current.latitude = fix.Latitude
	current.longitude = fix.Longitude
	current.hasFix = true
	if len(fix.TrackedTags) > 0 {
		current.tags = append([]string(nil), fix.TrackedTags...)
	}
	m.trackers[fix.UserID] = current
	return nil
}

func (m *MemoryStore) BeaconsCovering(_ context.Context, fix TrackerFix) ([]Beacon, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	tags := fix.TrackedTags
	if len(tags) == 0 {
		tags = m.trackers[fix.UserID].tags
	}
	hits := make([]Beacon, 0)
	for _, beacon := range m.beacons {
		if beacon.Visibility == "private" || !tagsOverlap(tags, beacon.Channels) {
			continue
		}
		distance := haversineMeters(fix.Latitude, fix.Longitude, beacon.Latitude, beacon.Longitude)
		if distance <= beacon.RadiusMeters {
			hits = append(hits, beacon)
		}
	}
	return hits, nil
}

// MemoryDeduper keeps alert_sent keys in process for the same 6 hour window.
type MemoryDeduper struct {
	now   func() time.Time
	ttl   time.Duration
	mu    sync.Mutex
	until map[string]time.Time
}

func NewMemoryDeduper() *MemoryDeduper {
	return &MemoryDeduper{
		now:   time.Now,
		ttl:   alertTTL,
		until: map[string]time.Time{},
	}
}

func (d *MemoryDeduper) Claim(_ context.Context, userID, beaconID string) (bool, error) {
	key := AlertSentKey(userID, beaconID)
	now := d.now()
	d.mu.Lock()
	defer d.mu.Unlock()
	if exp, ok := d.until[key]; ok && now.Before(exp) {
		return false, nil
	}
	d.until[key] = now.Add(d.ttl)
	return true, nil
}
