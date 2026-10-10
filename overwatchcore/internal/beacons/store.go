package beacons

import (
	"context"
	"database/sql"
	_ "embed"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/trust"
)

//go:embed schema.sql
var schemaSQL string

var (
	// ErrNotFound is returned when the beacon id is unknown.
	ErrNotFound = errors.New("beacon not found")
	// ErrMissingVoter is returned when the upvote has no voter id.
	ErrMissingVoter = errors.New("voter id required")
)

// Beacon is one hosted drop.
type Beacon struct {
	ID           string
	HostID       string
	HostCallsign string
	UpvoteCount  int
}

// Stats is the host reputation snapshot broadcast after an upvote.
type Stats struct {
	Type                  string  `json:"type"`
	BeaconID              string  `json:"beaconId"`
	HostID                string  `json:"hostId"`
	HostCallsign          string  `json:"hostCallsign"`
	UpvoteCount           int     `json:"upvoteCount"`
	HostUpvotes           int     `json:"hostUpvotes"`
	TotalDrops            int     `json:"totalDrops"`
	PositiveRatio         float64 `json:"positiveRatio"`
	PositivePercent       int     `json:"positivePercent"`
	IsVerifiedCoordinator bool    `json:"isVerifiedCoordinator"`
	AlreadyVoted          bool    `json:"alreadyVoted"`
}

// Store increments a beacon upvote once per voter.
type Store interface {
	Upvote(ctx context.Context, beaconID, voterID string) (Stats, error)
}

// EnsureSchema creates beacons, beacon_votes, and the host_reputation view.
func EnsureSchema(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, schemaSQL)
	return err
}

func statsFor(beacon Beacon, hostUpvotes, totalDrops int, alreadyVoted bool) Stats {
	return Stats{
		Type:                  "beacon_stats",
		BeaconID:              beacon.ID,
		HostID:                beacon.HostID,
		HostCallsign:          beacon.HostCallsign,
		UpvoteCount:           beacon.UpvoteCount,
		HostUpvotes:           hostUpvotes,
		TotalDrops:            totalDrops,
		PositiveRatio:         trust.PositiveRatio(totalDrops, hostUpvotes),
		PositivePercent:       trust.PositivePercent(totalDrops, hostUpvotes),
		IsVerifiedCoordinator: trust.QualifiesAsVerifiedCoordinator(totalDrops, hostUpvotes),
		AlreadyVoted:          alreadyVoted,
	}
}

// MemoryStore is the demo index used when DATABASE_URL is unset.
type MemoryStore struct {
	mu      sync.Mutex
	beacons map[string]Beacon
	votes   map[string]struct{}
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		beacons: map[string]Beacon{},
		votes:   map[string]struct{}{},
	}
}

// NewDemoStore seeds the field hosts used by the mobile feed.
// Viper-2 has 48 drops and 45 upvotes, so one new vote moves the score to 46/48.
func NewDemoStore() *MemoryStore {
	store := NewMemoryStore()
	store.seedHost("event-1", "host-viper-2", "Viper-2", 48, 45)
	store.seedHost("event-2", "host-mesa-4", "Mesa-4", 3, 2)
	store.seedHost("event-3", "host-north-1", "North-1", 8, 6)
	store.seedHost("event-4", "host-lark-9", "Lark-9", 5, 5)
	store.seedHost("event-5", "host-pike-3", "Pike-3", 5, 4)
	return store
}

func (m *MemoryStore) seedHost(primaryID, hostID, callsign string, drops, upvoted int) {
	if drops < 1 {
		drops = 1
	}
	if upvoted > drops {
		upvoted = drops
	}
	for i := 0; i < drops; i++ {
		id := primaryID
		if i > 0 {
			id = fmt.Sprintf("%s-drop-%d", hostID, i)
		}
		count := 0
		if i < upvoted {
			count = 1
		}
		m.beacons[id] = Beacon{
			ID:           id,
			HostID:       hostID,
			HostCallsign: callsign,
			UpvoteCount:  count,
		}
	}
}

func (m *MemoryStore) Upvote(_ context.Context, beaconID, voterID string) (Stats, error) {
	voterID = strings.TrimSpace(voterID)
	if voterID == "" {
		return Stats{}, ErrMissingVoter
	}
	m.mu.Lock()
	defer m.mu.Unlock()

	beacon, ok := m.beacons[beaconID]
	if !ok {
		return Stats{}, ErrNotFound
	}
	key := beaconID + "\x00" + voterID
	_, already := m.votes[key]
	if !already {
		m.votes[key] = struct{}{}
		beacon.UpvoteCount++
		m.beacons[beaconID] = beacon
	}
	hostUpvotes, totalDrops := 0, 0
	for _, item := range m.beacons {
		if item.HostID != beacon.HostID {
			continue
		}
		totalDrops++
		hostUpvotes += item.UpvoteCount
	}
	return statsFor(beacon, hostUpvotes, totalDrops, already), nil
}

// PostgresStore increments upvote_count and reads host_reputation.
type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) *PostgresStore {
	return &PostgresStore{db: db}
}

func (p *PostgresStore) Upvote(ctx context.Context, beaconID, voterID string) (Stats, error) {
	voterID = strings.TrimSpace(voterID)
	if voterID == "" {
		return Stats{}, ErrMissingVoter
	}

	tx, err := p.db.BeginTx(ctx, nil)
	if err != nil {
		return Stats{}, err
	}
	defer tx.Rollback()

	var beacon Beacon
	err = tx.QueryRowContext(ctx, `
		SELECT id, host_id, host_callsign, upvote_count
		FROM beacons
		WHERE id = $1
		FOR UPDATE
	`, beaconID).Scan(&beacon.ID, &beacon.HostID, &beacon.HostCallsign, &beacon.UpvoteCount)
	if errors.Is(err, sql.ErrNoRows) {
		return Stats{}, ErrNotFound
	}
	if err != nil {
		return Stats{}, err
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO beacon_votes (beacon_id, voter_id)
		VALUES ($1, $2)
		ON CONFLICT (beacon_id, voter_id) DO NOTHING
	`, beaconID, voterID)
	if err != nil {
		return Stats{}, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return Stats{}, err
	}
	already := inserted == 0
	if !already {
		if _, err := tx.ExecContext(ctx, `
			UPDATE beacons SET upvote_count = upvote_count + 1 WHERE id = $1
		`, beaconID); err != nil {
			return Stats{}, err
		}
		beacon.UpvoteCount++
	}

	var hostUpvotes, totalDrops int
	err = tx.QueryRowContext(ctx, `
		SELECT upvote_count, total_drops
		FROM host_reputation
		WHERE host_id = $1
	`, beacon.HostID).Scan(&hostUpvotes, &totalDrops)
	if err != nil {
		return Stats{}, err
	}
	if err := tx.Commit(); err != nil {
		return Stats{}, err
	}
	return statsFor(beacon, hostUpvotes, totalDrops, already), nil
}
