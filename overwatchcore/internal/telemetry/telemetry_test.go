package telemetry

import (
	"testing"
	"time"
)

func TestDecodeEriePing(t *testing.T) {
	raw := []byte(`{"kind":"ping","latitude":40.0503,"longitude":-105.0497,"label":"Erie"}`)
	ping, err := Decode(raw)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if ping.Kind != "ping" || ping.Label != "Erie" {
		t.Fatalf("unexpected ping: %+v", ping)
	}
	if ping.Latitude != 40.0503 || ping.Longitude != -105.0497 {
		t.Fatalf("unexpected coordinates: %+v", ping)
	}
}

func TestDecodeRejectsInvalidJSON(t *testing.T) {
	if _, err := Decode([]byte(`{`)); err == nil {
		t.Fatal("expected invalid JSON to fail")
	}
}

func TestDecodeLocationPingEnvelope(t *testing.T) {
	raw := []byte(`{"type":"location_ping","payload":{"userId":"dev-device-01","latitude":40.0503,"longitude":-105.0497}}`)
	ping, err := Decode(raw)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if ping.Kind != "ping" || ping.Label != "dev-device-01" {
		t.Fatalf("unexpected ping: %+v", ping)
	}
	if ping.Latitude != 40.0503 || ping.Longitude != -105.0497 {
		t.Fatalf("unexpected coordinates: %+v", ping)
	}
}

func TestSimulatedProximityAlert(t *testing.T) {
	now := time.Date(2026, 9, 23, 2, 18, 0, 0, time.UTC)
	msg := SimulatedProximityAlert(now)
	if msg.Type != "proximity_alert" {
		t.Fatalf("type %q", msg.Type)
	}
	payload, ok := msg.Payload.(ProximityAlertPayload)
	if !ok {
		t.Fatalf("payload type %T", msg.Payload)
	}
	if payload.TargetName != "Erie Community Center" || payload.TriggeredAt != "2026-09-23T02:18:00Z" {
		t.Fatalf("unexpected payload: %+v", payload)
	}
}
