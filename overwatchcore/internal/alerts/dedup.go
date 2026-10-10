package alerts

import (
	"sync"
	"time"
)

const (
	// DefaultAlertCooldown is how long a user/beacon pair stays quiet after an alert.
	DefaultAlertCooldown = 6 * time.Hour
	// BoundaryHysteresisMeters is the extra distance past a radius required
	// before a departed contact can trigger again.
	BoundaryHysteresisMeters = 50
)

// AlertSentKey is the Redis key alert_sent:<user_id>:<beacon_id>.
func AlertSentKey(userID, beaconID string) string {
	return "alert_sent:" + userID + ":" + beaconID
}

// CooldownStore records alert claims. A claim refreshes the key's expiry
// whether or not a new alert is allowed, which is the sliding window.
type CooldownStore interface {
	Claim(key string, now time.Time, ttl time.Duration) bool
}

// MemoryCooldown is the in-process stand-in for Redis SET with a sliding PX.
type MemoryCooldown struct {
	mu    sync.Mutex
	until map[string]time.Time
}

func NewMemoryCooldown() *MemoryCooldown {
	return &MemoryCooldown{until: map[string]time.Time{}}
}

// Claim reports whether an alert may be sent. An active key suppresses the
// alert and slides its expiry forward by ttl. An expired or missing key allows
// the alert and starts a new window.
func (m *MemoryCooldown) Claim(key string, now time.Time, ttl time.Duration) bool {
	if ttl <= 0 {
		ttl = DefaultAlertCooldown
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if exp, ok := m.until[key]; ok && now.Before(exp) {
		m.until[key] = now.Add(ttl)
		return false
	}
	m.until[key] = now.Add(ttl)
	return true
}

// FenceState latches after a contact enters a radius until they travel
// hysteresis meters beyond it.
type FenceState struct {
	Latched bool
}

// ObserveFence returns whether this sample is a fresh entry. Contacts that
// hover inside radius+hysteresis stay latched and do not re-alert.
func ObserveFence(state FenceState, distanceMeters, radiusMeters, hysteresisMeters float64) (bool, FenceState) {
	if radiusMeters < 0 {
		radiusMeters = 0
	}
	if hysteresisMeters < 0 {
		hysteresisMeters = 0
	}
	if !state.Latched {
		if distanceMeters <= radiusMeters {
			return true, FenceState{Latched: true}
		}
		return false, state
	}
	if distanceMeters > radiusMeters+hysteresisMeters {
		return false, FenceState{Latched: false}
	}
	return false, state
}

// AllowAlert combines the fence latch with the sliding alert_sent key.
func AllowAlert(store CooldownStore, state FenceState, userID, beaconID string, distanceMeters, radiusMeters float64, now time.Time, cooldown time.Duration, hysteresisMeters float64) (bool, FenceState) {
	send, next := ObserveFence(state, distanceMeters, radiusMeters, hysteresisMeters)
	if !send {
		return false, next
	}
	if !store.Claim(AlertSentKey(userID, beaconID), now, cooldown) {
		return false, next
	}
	return true, next
}
