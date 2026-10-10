package alerts

import (
	"testing"
	"time"
)

func TestAlertSentKey(t *testing.T) {
	if got := AlertSentKey("Viper-2", "event-1"); got != "alert_sent:Viper-2:event-1" {
		t.Fatalf("key = %s", got)
	}
}

func TestSlidingCooldownRefreshesWhileActive(t *testing.T) {
	store := NewMemoryCooldown()
	start := time.Date(2026, 10, 9, 15, 0, 0, 0, time.UTC)
	cooldown := time.Hour

	if !store.Claim(AlertSentKey("u", "b"), start, cooldown) {
		t.Fatal("first claim should send")
	}
	if store.Claim(AlertSentKey("u", "b"), start.Add(30*time.Minute), cooldown) {
		t.Fatal("repeat inside the window should be suppressed")
	}
	// The suppressed claim slid the window, so the original expiry is no longer enough.
	if store.Claim(AlertSentKey("u", "b"), start.Add(cooldown), cooldown) {
		t.Fatal("sliding refresh should still suppress at the original expiry")
	}
	if !store.Claim(AlertSentKey("u", "b"), start.Add(time.Hour+cooldown), cooldown) {
		t.Fatal("a quiet cooldown after the last refresh should allow another alert")
	}
}

func TestCooldownIsConfigurablePerClaim(t *testing.T) {
	store := NewMemoryCooldown()
	now := time.Now()
	if !store.Claim("alert_sent:a:b", now, time.Minute) {
		t.Fatal("expected first claim")
	}
	if store.Claim("alert_sent:a:b", now.Add(59*time.Second), time.Minute) {
		t.Fatal("short cooldown should still suppress")
	}
	if !store.Claim("alert_sent:a:c", now, time.Minute) {
		t.Fatal("a different beacon should not share the key")
	}
}

func TestBoundaryHysteresisRequiresFiftyMetersPastTheRadius(t *testing.T) {
	var state FenceState
	var alert bool

	alert, state = ObserveFence(state, 40, 100, BoundaryHysteresisMeters)
	if !alert || !state.Latched {
		t.Fatalf("entry = alert %v state %+v", alert, state)
	}
	alert, state = ObserveFence(state, 90, 100, BoundaryHysteresisMeters)
	if alert || !state.Latched {
		t.Fatalf("still inside = alert %v state %+v", alert, state)
	}
	alert, state = ObserveFence(state, 149, 100, BoundaryHysteresisMeters)
	if alert || !state.Latched {
		t.Fatalf("within 50m of the border = alert %v state %+v", alert, state)
	}
	alert, state = ObserveFence(state, 151, 100, BoundaryHysteresisMeters)
	if alert || state.Latched {
		t.Fatalf("clear of the border = alert %v state %+v", alert, state)
	}
	alert, state = ObserveFence(state, 80, 100, BoundaryHysteresisMeters)
	if !alert || !state.Latched {
		t.Fatalf("re-entry = alert %v state %+v", alert, state)
	}
}

func TestDedupBlocksAReentryUntilTheCooldownElapses(t *testing.T) {
	store := NewMemoryCooldown()
	now := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	var state FenceState
	var alert bool

	alert, state = AllowAlert(store, state, "u", "b", 20, 100, now, time.Hour, BoundaryHysteresisMeters)
	if !alert {
		t.Fatal("first entry should alert")
	}
	_, state = AllowAlert(store, state, "u", "b", 160, 100, now.Add(time.Minute), time.Hour, BoundaryHysteresisMeters)
	alert, state = AllowAlert(store, state, "u", "b", 20, 100, now.Add(2*time.Minute), time.Hour, BoundaryHysteresisMeters)
	if alert {
		t.Fatal("re-entry inside the sliding cooldown should stay quiet")
	}
	alert, _ = AllowAlert(store, FenceState{}, "u", "b", 20, 100, now.Add(3*time.Hour), time.Hour, BoundaryHysteresisMeters)
	if !alert {
		t.Fatal("re-entry after the cooldown should alert")
	}
}
