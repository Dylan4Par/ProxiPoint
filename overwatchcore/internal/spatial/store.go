package spatial

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	_ "github.com/lib/pq"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

// Store runs proximity lookups against PostGIS.
type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Open connects to PostgreSQL. The DSN is a standard postgres URL, for example
// postgres://proxipoint@127.0.0.1:5432/proxipoint?sslmode=disable.
func Open(dsn string) (*sql.DB, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(8)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return db, nil
}

// Migrate creates the PostGIS extension, the entities table, and its GiST index.
func Migrate(ctx context.Context, db *sql.DB) error {
	for _, stmt := range splitSQL(schemaSQL) {
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
	}
	return nil
}

func (s *Store) QueryNearbyEntities(ctx context.Context, lon, lat, radiusMeters float64) ([]telemetry.ProximityAlertPayload, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("spatial query: nil store")
	}
	return QueryNearbyEntities(ctx, s.db, lon, lat, radiusMeters)
}

func splitSQL(script string) []string {
	parts := strings.Split(script, ";")
	statements := make([]string, 0, len(parts))
	for _, part := range parts {
		stmt := strings.TrimSpace(part)
		if stmt == "" {
			continue
		}
		statements = append(statements, stmt)
	}
	return statements
}
