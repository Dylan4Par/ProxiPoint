package beacons

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestUpvoteIncrementsViperAndIsIdempotent(t *testing.T) {
	store := NewDemoStore()
	hub := NewHub()
	server := httptest.NewServer(Routes(store, hub))
	defer server.Close()

	first := postUpvote(t, server.URL, "event-1", "ranger-1")
	if first.AlreadyVoted || first.UpvoteCount != 2 || first.HostUpvotes != 46 || first.TotalDrops != 48 {
		t.Fatalf("first stats = %+v", first)
	}
	if first.Type != "beacon_stats" || first.HostCallsign != "Viper-2" || !first.IsVerifiedCoordinator {
		t.Fatalf("first stats = %+v", first)
	}
	if first.PositivePercent != 96 {
		t.Fatalf("percent = %d", first.PositivePercent)
	}

	second := postUpvote(t, server.URL, "event-1", "ranger-1")
	if !second.AlreadyVoted || second.HostUpvotes != 46 || second.UpvoteCount != 2 {
		t.Fatalf("repeat stats = %+v", second)
	}

	other := postUpvote(t, server.URL, "event-1", "ranger-2")
	if other.AlreadyVoted || other.HostUpvotes != 47 {
		t.Fatalf("second voter stats = %+v", other)
	}
}

func TestUpvoteRejectsMissingVoterAndUnknownBeacon(t *testing.T) {
	server := httptest.NewServer(Routes(NewDemoStore(), NewHub()))
	defer server.Close()

	cases := []struct {
		name   string
		method string
		path   string
		body   string
		status int
	}{
		{name: "get", method: http.MethodGet, path: "/api/v1/beacons/event-1/upvote", body: `{"voterId":"a"}`, status: http.StatusMethodNotAllowed},
		{name: "json", method: http.MethodPost, path: "/api/v1/beacons/event-1/upvote", body: "{", status: http.StatusBadRequest},
		{name: "voter", method: http.MethodPost, path: "/api/v1/beacons/event-1/upvote", body: `{}`, status: http.StatusBadRequest},
		{name: "missing", method: http.MethodPost, path: "/api/v1/beacons/nope/upvote", body: `{"voterId":"a"}`, status: http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, server.URL+tc.path, strings.NewReader(tc.body))
			if err != nil {
				t.Fatal(err)
			}
			req.Header.Set("Content-Type", "application/json")
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatal(err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != tc.status {
				body, _ := io.ReadAll(resp.Body)
				t.Fatalf("status = %d, want %d, body = %s", resp.StatusCode, tc.status, body)
			}
		})
	}

	req, err := http.NewRequest(http.MethodOptions, server.URL+"/api/v1/beacons/event-1/upvote", nil)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("options status = %d", resp.StatusCode)
	}
}

func TestStatsFanoutStaysUnderOneSecondAndSocketsDrain(t *testing.T) {
	store := NewDemoStore()
	hub := NewHub()
	server := httptest.NewServer(Routes(store, hub))
	defer server.Close()

	const clients = 24
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	conns := make([]*websocket.Conn, 0, clients)
	received := make(chan Stats, clients)
	for i := 0; i < clients; i++ {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			t.Fatal(err)
		}
		conns = append(conns, conn)
		go func(conn *websocket.Conn) {
			defer conn.Close()
			var stats Stats
			_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
			if err := conn.ReadJSON(&stats); err != nil {
				return
			}
			received <- stats
		}(conn)
	}
	t.Cleanup(func() {
		for _, conn := range conns {
			_ = conn.Close()
		}
	})

	deadline := time.Now().Add(time.Second)
	for hub.Len() != clients {
		if time.Now().After(deadline) {
			t.Fatalf("registered sockets = %d", hub.Len())
		}
		time.Sleep(5 * time.Millisecond)
	}

	started := time.Now()
	stats := postUpvote(t, server.URL, "event-1", "field-observer")
	if stats.HostUpvotes != 46 {
		t.Fatalf("stats = %+v", stats)
	}
	for i := 0; i < clients; i++ {
		select {
		case msg := <-received:
			if msg.Type != "beacon_stats" || msg.BeaconID != "event-1" || msg.HostUpvotes != 46 {
				t.Fatalf("socket stats = %+v", msg)
			}
		case <-time.After(time.Second):
			t.Fatalf("socket %d missed the stats event", i)
		}
	}
	if elapsed := time.Since(started); elapsed >= time.Second {
		t.Fatalf("fan-out took %s", elapsed)
	}

	for _, conn := range conns {
		_ = conn.Close()
	}
	deadline = time.Now().Add(time.Second)
	for hub.Len() != 0 {
		if time.Now().After(deadline) {
			t.Fatalf("sockets still registered = %d", hub.Len())
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func TestQuietHostsStayUnverified(t *testing.T) {
	server := httptest.NewServer(Routes(NewDemoStore(), NewHub()))
	defer server.Close()

	mesa := postUpvote(t, server.URL, "event-2", "ranger-1")
	if mesa.HostCallsign != "Mesa-4" || mesa.TotalDrops != 3 || mesa.HostUpvotes != 3 || mesa.IsVerifiedCoordinator {
		t.Fatalf("mesa = %+v", mesa)
	}
	pike := postUpvote(t, server.URL, "event-5", "ranger-1")
	if pike.TotalDrops != 5 || pike.HostUpvotes != 5 || !pike.IsVerifiedCoordinator {
		t.Fatalf("pike = %+v", pike)
	}
}

func postUpvote(t *testing.T, base, id, voter string) Stats {
	t.Helper()
	resp, err := http.Post(base+"/api/v1/beacons/"+id+"/upvote", "application/json", bytes.NewBufferString(`{"voterId":"`+voter+`"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d body = %s", resp.StatusCode, body)
	}
	var stats Stats
	if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
		t.Fatal(err)
	}
	return stats
}
