package ingest

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gorilla/websocket"
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

	var ack map[string]string
	if err := conn.ReadJSON(&ack); err != nil {
		t.Fatalf("read ack: %v", err)
	}
	if ack["status"] != "ingested" || ack["label"] != "Erie" {
		t.Fatalf("unexpected ack: %+v", ack)
	}

	logged := logs.String()
	if !strings.Contains(logged, "ingested telemetry struct") {
		t.Fatalf("log missing ingest line: %s", logged)
	}
	if !strings.Contains(logged, "40.0503") || !strings.Contains(logged, "-105.0497") {
		t.Fatalf("log missing Erie coordinates: %s", logged)
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
