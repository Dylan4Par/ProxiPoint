package ingest

import (
	"context"
	"math"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/spatial"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

func TestSocketReturnsSeededPostGISEntity(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	db, err := spatial.Open(dsn)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer db.Close()
	unlock, err := spatial.WithTestLock(db)
	if err != nil {
		t.Fatalf("lock: %v", err)
	}
	defer unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := spatial.Migrate(ctx, db); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if _, err := db.ExecContext(ctx, `TRUNCATE entities`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO entities (id, name, geom) VALUES (
			'6f1c2a40-7b3e-4d1a-9c55-000000000001',
			'Erie Community Center',
			ST_Project(ST_SetSRID(ST_MakePoint(-105.0497, 40.0503), 4326)::geography, 42.5, 0)
		)
	`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	server := httptest.NewServer(NewMuxWithFinder(nil, spatial.NewStore(db)))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/telemetry"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	payload := `{"type":"location_ping","payload":{"userId":"dev-device-01","latitude":40.0503,"longitude":-105.0497}}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(payload)); err != nil {
		t.Fatalf("write: %v", err)
	}

	var msg struct {
		Type    string                          `json:"type"`
		Payload telemetry.ProximityAlertPayload `json:"payload"`
	}
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("read: %v", err)
	}
	alert := msg.Payload
	if msg.Type != "proximity_alert" || alert.TargetName != "Erie Community Center" {
		t.Fatalf("alert: %+v", msg)
	}
	if alert.TargetEntityID != "6f1c2a40-7b3e-4d1a-9c55-000000000001" || alert.AlertID != "alert-"+alert.TargetEntityID {
		t.Fatalf("ids: %+v", alert)
	}
	if math.Abs(alert.DistanceMeters-42.5) > 0.5 || alert.ThresholdMeters != 100 {
		t.Fatalf("distance: %+v", alert)
	}
	if alert.Message != "Target detected within radius" {
		t.Fatalf("message: %+v", alert)
	}

	_ = conn.SetReadDeadline(time.Now().Add(200 * time.Millisecond))
	if err := conn.ReadJSON(&msg); err == nil {
		t.Fatalf("unexpected extra frame: %+v", msg)
	}
}
