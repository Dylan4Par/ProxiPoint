package spatial

import (
	"context"
	"database/sql"
	"math"
	"os"
	"strings"
	"testing"
	"time"
)

func TestQueryNearbyEntitiesPostGIS(t *testing.T) {
	db := openTestDB(t)
	unlock, err := WithTestLock(db)
	if err != nil {
		t.Fatalf("lock: %v", err)
	}
	t.Cleanup(unlock)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := Migrate(ctx, db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if _, err := db.ExecContext(ctx, `TRUNCATE entities`); err != nil {
		t.Fatalf("truncate: %v", err)
	}

	if _, err := db.ExecContext(ctx, `
		INSERT INTO entities (id, name, geom) VALUES
		(
			'6f1c2a40-7b3e-4d1a-9c55-000000000001',
			'Erie Community Center',
			ST_Project(ST_SetSRID(ST_MakePoint(-105.0497, 40.0503), 4326)::geography, 42.5, 0)
		),
		(
			'6f1c2a40-7b3e-4d1a-9c55-000000000010',
			'Closer Node',
			ST_Project(ST_SetSRID(ST_MakePoint(-105.0497, 40.0503), 4326)::geography, 10, 0)
		),
		(
			'6f1c2a40-7b3e-4d1a-9c55-000000000002',
			'Outside Radius',
			ST_SetSRID(ST_MakePoint(-105.0485, 40.0512), 4326)::geography
		)
	`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	var indexDef string
	if err := db.QueryRowContext(ctx, `
		SELECT indexdef FROM pg_indexes WHERE indexname = 'entities_geom_gix'
	`).Scan(&indexDef); err != nil {
		t.Fatalf("index lookup: %v", err)
	}
	if !strings.Contains(strings.ToLower(indexDef), "using gist") {
		t.Fatalf("expected GiST index, got %s", indexDef)
	}

	alerts, err := QueryNearbyEntities(ctx, db, -105.0497, 40.0503, 100)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	if len(alerts) != 2 {
		t.Fatalf("alerts: %+v", alerts)
	}
	if alerts[0].TargetName != "Closer Node" || alerts[1].TargetName != "Erie Community Center" {
		t.Fatalf("order: %+v", alerts)
	}
	if math.Abs(alerts[0].DistanceMeters-10) > 0.5 {
		t.Fatalf("closer distance %v", alerts[0].DistanceMeters)
	}
	if math.Abs(alerts[1].DistanceMeters-42.5) > 0.5 {
		t.Fatalf("erie distance %v", alerts[1].DistanceMeters)
	}
	for _, alert := range alerts {
		if alert.AlertID != "alert-"+alert.TargetEntityID {
			t.Fatalf("alert id: %+v", alert)
		}
		if alert.ThresholdMeters != 100 {
			t.Fatalf("threshold: %+v", alert)
		}
		if alert.Message != "Target detected within radius" {
			t.Fatalf("message: %+v", alert)
		}
		if _, err := time.Parse(time.RFC3339, alert.TriggeredAt); err != nil {
			t.Fatalf("triggeredAt: %v", err)
		}
	}

	var outside float64
	if err := db.QueryRowContext(ctx, `
		SELECT ST_Distance(
			ST_SetSRID(ST_MakePoint(-105.0485, 40.0512), 4326)::geography,
			ST_SetSRID(ST_MakePoint(-105.0497, 40.0503), 4326)::geography
		)
	`).Scan(&outside); err != nil {
		t.Fatalf("outside distance: %v", err)
	}
	if outside <= 100 {
		t.Fatalf("example point should sit outside 100m, got %v", outside)
	}
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	db, err := Open(dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}
