package ingest

import (
	"bytes"
	"context"
	"log"
	"math"
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

type stubFinder struct {
	alerts []telemetry.ProximityAlertPayload
	err    error
	lon    float64
	lat    float64
	radius float64
	calls  int
}

func (s *stubFinder) QueryNearbyEntities(_ context.Context, lon, lat, radius float64) ([]telemetry.ProximityAlertPayload, error) {
	s.calls++
	s.lon = lon
	s.lat = lat
	s.radius = radius
	if s.err != nil {
		return nil, s.err
	}
	return s.alerts, nil
}

func TestIngestEmitsEachPostGISRow(t *testing.T) {
	finder := &stubFinder{
		alerts: []telemetry.ProximityAlertPayload{
			{
				AlertID:         "alert-near",
				TargetEntityID:  "near",
				TargetName:      "Closer Node",
				DistanceMeters:  10,
				ThresholdMeters: ProximityRadiusMeters,
				Latitude:        40.0504,
				Longitude:       -105.0497,
				TriggeredAt:     time.Now().UTC().Format(time.RFC3339),
				Message:         "Target detected within radius",
			},
			{
				AlertID:         "alert-erie",
				TargetEntityID:  "erie",
				TargetName:      "Erie Community Center",
				DistanceMeters:  42.5,
				ThresholdMeters: ProximityRadiusMeters,
				Latitude:        40.0507,
				Longitude:       -105.0497,
				TriggeredAt:     time.Now().UTC().Format(time.RFC3339),
				Message:         "Target detected within radius",
			},
		},
	}
	server := httptest.NewServer(NewMuxWithFinder(log.New(&bytes.Buffer{}, "", 0), finder))
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

	var names []string
	for i := 0; i < len(finder.alerts); i++ {
		var msg struct {
			Type    string                          `json:"type"`
			Payload telemetry.ProximityAlertPayload `json:"payload"`
		}
		if err := conn.ReadJSON(&msg); err != nil {
			t.Fatalf("read alert %d: %v", i, err)
		}
		if msg.Type != "proximity_alert" {
			t.Fatalf("type %q", msg.Type)
		}
		names = append(names, msg.Payload.TargetName)
	}
	if strings.Join(names, ",") != "Closer Node,Erie Community Center" {
		t.Fatalf("names %v", names)
	}
	if finder.calls != 1 || finder.radius != ProximityRadiusMeters {
		t.Fatalf("finder call: %+v", finder)
	}
	if math.Abs(finder.lon-(-105.0497)) > 1e-6 || math.Abs(finder.lat-40.0503) > 1e-6 {
		t.Fatalf("finder coordinates lon=%v lat=%v", finder.lon, finder.lat)
	}
}

func TestSpatialQueryErrorKeepsSocketOpen(t *testing.T) {
	finder := &stubFinder{err: context.DeadlineExceeded}
	var logs bytes.Buffer
	server := httptest.NewServer(NewMuxWithFinder(log.New(&logs, "", 0), finder))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/telemetry"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"kind":"ping","latitude":1,"longitude":2,"label":"x"}`)); err != nil {
		t.Fatalf("write ping: %v", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, []byte(`{"kind":"status","latitude":0,"longitude":0,"label":"still-open"}`)); err != nil {
		t.Fatalf("write status: %v", err)
	}

	var ack map[string]string
	if err := conn.ReadJSON(&ack); err != nil {
		t.Fatalf("read ack: %v", err)
	}
	if ack["status"] != "ingested" || ack["label"] != "still-open" {
		t.Fatalf("ack %+v", ack)
	}
	if !strings.Contains(logs.String(), "spatial query error") {
		t.Fatalf("log: %s", logs.String())
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
