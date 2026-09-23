package ingest

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

func TestIngestEriePing(t *testing.T) {
	var logs bytes.Buffer
	logger := log.New(&logs, "", 0)
	server := httptest.NewServer(NewMux(logger))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/telemetry"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	payload := `{"kind":"ping","latitude":40.0503,"longitude":-105.0497,"label":"Erie"}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(payload)); err != nil {
		t.Fatalf("write: %v", err)
	}

	assertProximityAlert(t, conn)

	logged := logs.String()
	if !strings.Contains(logged, "ingested telemetry struct") {
		t.Fatalf("log missing ingest line: %s", logged)
	}
	if !strings.Contains(logged, "40.0503") || !strings.Contains(logged, "-105.0497") {
		t.Fatalf("log missing Erie coordinates: %s", logged)
	}
}

func TestIngestLocationPingEnvelope(t *testing.T) {
	server := httptest.NewServer(NewMux(log.New(&bytes.Buffer{}, "", 0)))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/telemetry"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	payload := `{"type":"location_ping","payload":{"userId":"dev-device-01","latitude":40.0503,"longitude":-105.0497,"accuracy":5}}`
	if err := conn.WriteMessage(websocket.TextMessage, []byte(payload)); err != nil {
		t.Fatalf("write: %v", err)
	}
	assertProximityAlert(t, conn)
}

func TestRejectsMalformedFrame(t *testing.T) {
	server := httptest.NewServer(NewMux(log.New(&bytes.Buffer{}, "", 0)))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/telemetry"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{`)); err != nil {
		t.Fatalf("write: %v", err)
	}
	var ack map[string]string
	if err := conn.ReadJSON(&ack); err != nil {
		t.Fatalf("read ack: %v", err)
	}
	if ack["status"] != "rejected" {
		t.Fatalf("unexpected ack: %+v", ack)
	}
}

func assertProximityAlert(t *testing.T, conn *websocket.Conn) {
	t.Helper()
	var msg struct {
		Type    string                          `json:"type"`
		Payload telemetry.ProximityAlertPayload `json:"payload"`
	}
	if err := conn.ReadJSON(&msg); err != nil {
		t.Fatalf("read alert: %v", err)
	}
	if msg.Type != "proximity_alert" {
		t.Fatalf("type %q", msg.Type)
	}
	payload := msg.Payload
	if payload.AlertID != "alert-test-001" ||
		payload.TargetEntityID != "node-erie-north" ||
		payload.TargetName != "Erie Community Center" ||
		payload.DistanceMeters != 42.5 ||
		payload.ThresholdMeters != 100 ||
		payload.Latitude != 40.0512 ||
		payload.Longitude != -105.0485 ||
		payload.Message != "Target within 50m proximity radius" {
		t.Fatalf("unexpected alert payload: %+v", payload)
	}
	triggered, err := time.Parse(time.RFC3339, payload.TriggeredAt)
	if err != nil {
		t.Fatalf("triggeredAt %q: %v", payload.TriggeredAt, err)
	}
	if time.Since(triggered) > time.Minute || time.Until(triggered) > time.Minute {
		t.Fatalf("triggeredAt not current: %s", payload.TriggeredAt)
	}
}

func TestHealthz(t *testing.T) {
	server := httptest.NewServer(NewMux(log.New(&bytes.Buffer{}, "", 0)))
	defer server.Close()

	resp, err := http.Get(server.URL + "/healthz")
	if err != nil {
		t.Fatalf("get healthz: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status %d", resp.StatusCode)
	}
}
