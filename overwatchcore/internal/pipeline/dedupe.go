package pipeline

import (
	"context"
	"sync"
	"time"
)

// Dedupe is the Redis SetNX receipt cache. A key is claimed once until it expires.
type Dedupe interface {
	SetNX(ctx context.Context, key string, ttl time.Duration) (bool, error)
}

// MemoryDedupe is the in-process stand-in for Redis when REDIS_URL is unset.
type MemoryDedupe struct {
	mu    sync.Mutex
	until map[string]time.Time
	now   func() time.Time
}

func NewMemoryDedupe() *MemoryDedupe {
	return &MemoryDedupe{until: map[string]time.Time{}, now: time.Now}
}

func (d *MemoryDedupe) SetNX(_ context.Context, key string, ttl time.Duration) (bool, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	now := d.now()
	if expiry, ok := d.until[key]; ok && now.Before(expiry) {
		return false, nil
	}
	if ttl <= 0 {
		ttl = 6 * time.Hour
	}
	d.until[key] = now.Add(ttl)
	return true, nil
}
