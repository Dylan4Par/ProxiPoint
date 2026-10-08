package pipeline

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

const alertCooldown = 6 * time.Hour

// ErrAlreadyDelivered means this user already received the beacon.
var ErrAlreadyDelivered = errors.New("alert already delivered")

// PushSender delivers one payload. The memory sender records it for the in-app feed.
type PushSender interface {
	SendPush(token string, payload PushPayload) error
}

// MemoryPush records deliveries. It stands in for APNs and FCM.
type MemoryPush struct {
	mu       sync.Mutex
	payloads []PushPayload
}

func NewMemoryPush() *MemoryPush {
	return &MemoryPush{}
}

func (p *MemoryPush) SendPush(_ string, payload PushPayload) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.payloads = append(p.payloads, payload)
	return nil
}

func (p *MemoryPush) Payloads() []PushPayload {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]PushPayload, len(p.payloads))
	copy(out, p.payloads)
	return out
}

// HandleProximityMatch claims the receipt, then sends one push.
func HandleProximityMatch(ctx context.Context, dedupe Dedupe, sender PushSender, match AlertMatch) (PushPayload, error) {
	if dedupe == nil || sender == nil {
		return PushPayload{}, errors.New("dispatch is not configured")
	}
	key := fmt.Sprintf("alert_sent:%s:%s", match.UserID, match.BeaconID)
	fresh, err := dedupe.SetNX(ctx, key, alertCooldown)
	if err != nil {
		return PushPayload{}, err
	}
	if !fresh {
		return PushPayload{}, ErrAlreadyDelivered
	}
	payload := PushPayload{
		Title: fmt.Sprintf("Nearby: %s", strings.Join(match.MatchedTags, " ")),
		Body:  fmt.Sprintf("A live drop point was established %dm away from you.", int(match.DistanceMeters)),
		Data: map[string]string{
			"beacon_id": match.BeaconID,
			"type":      "PROXIMITY_BEACON_MATCH",
		},
	}
	if err := sender.SendPush(match.PushToken, payload); err != nil {
		return PushPayload{}, err
	}
	return payload, nil
}
