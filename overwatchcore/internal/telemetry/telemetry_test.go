package telemetry

import "testing"

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
