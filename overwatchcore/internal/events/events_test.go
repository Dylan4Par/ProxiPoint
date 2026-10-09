package events

import (
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

func TestMemoryStoreMatchesTagAndRadius(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	fix := TrackerFix{
		UserID:      "tracker-1",
		Latitude:    40.0197,
		Longitude:   -105.2789,
		TrackedTags: []string{"TechMeetup"},
	}
	if err := store.UpsertTracker(ctx, mustFix(t, fix)); err != nil {
		t.Fatal(err)
	}

	near := sampleBeacon(300)
	users, err := store.UsersInside(ctx, mustBeacon(t, near))
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0] != "tracker-1" {
		t.Fatalf("users = %#v", users)
	}

	far := sampleBeacon(300)
	far.Latitude = 40.04
	users, err = store.UsersInside(ctx, mustBeacon(t, far))
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 0 {
		t.Fatalf("distant users = %#v", users)
	}

	other := sampleBeacon(1500)
	other.Channels = []string{"#PostGIS"}
	users, err = store.UsersInside(ctx, mustBeacon(t, other))
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 0 {
		t.Fatalf("untagged users = %#v", users)
	}
}

func TestCreateBeaconFansOutOnceAndSkipsPrivate(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	dedupe := NewMemoryDeduper()
	hub := NewHub()
	svc := NewService(store, dedupe, hub)
	client := startHubClient(t, hub)

	if err := store.UpsertTracker(ctx, mustFix(t, TrackerFix{
		UserID:      "tracker-1",
		Latitude:    40.0179,
		Longitude:   -105.2789,
		TrackedTags: []string{"#TechMeetup"},
	})); err != nil {
		t.Fatal(err)
	}

	privateBeacon := sampleBeacon(1500)
	privateBeacon.Visibility = "private"
	saved, notified, err := svc.CreateBeacon(ctx, privateBeacon)
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == "" || len(notified) != 0 {
		t.Fatalf("private saved=%s notified=%#v", saved.ID, notified)
	}

	first, notified, err := svc.CreateBeacon(ctx, sampleBeacon(1500))
	if err != nil {
		t.Fatal(err)
	}
	if len(notified) != 1 || notified[0] != "tracker-1" {
		t.Fatalf("notified = %#v", notified)
	}
	alert := readAlert(t, client)
	if alert.Type != "proximity_alert" || alert.BeaconID != first.ID || alert.UserIDs[0] != "tracker-1" {
		t.Fatalf("alert = %#v", alert)
	}

	again := sampleBeacon(1500)
	again.ID = first.ID
	_, notified, err = svc.CreateBeacon(ctx, again)
	if err != nil {
		t.Fatal(err)
	}
	if len(notified) != 0 {
		t.Fatalf("second notified = %#v", notified)
	}
}

func TestMemoryDeduperExpiresAfterSixHours(t *testing.T) {
	dedupe := NewMemoryDeduper()
	start := time.Date(2026, 10, 9, 12, 0, 0, 0, time.UTC)
	dedupe.now = func() time.Time { return start }

	claimed, err := dedupe.Claim(context.Background(), "user-1", "beacon-1")
	if err != nil || !claimed {
		t.Fatalf("first claim = %v %v", claimed, err)
	}
	claimed, err = dedupe.Claim(context.Background(), "user-1", "beacon-1")
	if err != nil || claimed {
		t.Fatalf("second claim = %v %v", claimed, err)
	}
	dedupe.now = func() time.Time { return start.Add(alertTTL + time.Second) }
	claimed, err = dedupe.Claim(context.Background(), "user-1", "beacon-1")
	if err != nil || !claimed {
		t.Fatalf("expired claim = %v %v", claimed, err)
	}
	if AlertSentKey("user-1", "beacon-1") != "alert_sent:user-1:beacon-1" {
		t.Fatal(AlertSentKey("user-1", "beacon-1"))
	}
}

func TestLocationIngestAlertsCoveringBeacon(t *testing.T) {
	ctx := context.Background()
	store := NewMemoryStore()
	svc := NewService(store, NewMemoryDeduper(), NewHub())
	beacon := sampleBeacon(8000)
	if _, _, err := svc.CreateBeacon(ctx, beacon); err != nil {
		t.Fatal(err)
	}

	alerts, err := svc.IngestLocation(ctx, TrackerFix{
		UserID:      "walker",
		Latitude:    40.02,
		Longitude:   -105.2789,
		TrackedTags: []string{"#TechMeetup"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(alerts) != 1 || alerts[0].Type != "proximity_alert" {
		t.Fatalf("alerts = %#v", alerts)
	}

	alerts, err = svc.IngestLocation(ctx, TrackerFix{
		UserID:    "walker",
		Latitude:  40.02,
		Longitude: -105.2789,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(alerts) != 0 {
		t.Fatalf("repeat alerts = %#v", alerts)
	}

	stored := store.trackers["walker"]
	if len(stored.tags) != 1 || stored.tags[0] != "#TechMeetup" {
		t.Fatalf("tags wiped: %#v", stored.tags)
	}
}

func TestRedisClaimWritesSixHourKey(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	got := make(chan string, 1)
	go func() {
		conn, acceptErr := ln.Accept()
		if acceptErr != nil {
			return
		}
		defer conn.Close()
		buf := make([]byte, 1024)
		n, _ := conn.Read(buf)
		got <- string(buf[:n])
		_, _ = conn.Write([]byte("+OK\r\n"))
	}()

	dedupe := NewRedisDeduper(ln.Addr().String())
	claimed, err := dedupe.Claim(context.Background(), "user-1", "beacon-1")
	if err != nil || !claimed {
		t.Fatalf("claim = %v %v", claimed, err)
	}
	payload := <-got
	for _, part := range []string{"SET", "alert_sent:user-1:beacon-1", "NX", "EX", "21600"} {
		if !strings.Contains(payload, part) {
			t.Fatalf("resp missing %s:\n%s", part, payload)
		}
	}

	host, password := parseRedisURL("redis://:secret@127.0.0.1/0")
	if host != "127.0.0.1:6379" || password != "secret" {
		t.Fatalf("parsed redis url host=%s password=%s", host, password)
	}
}

func TestCandidateQueryMatchesPrompt(t *testing.T) {
	compact := strings.Join(strings.Fields(candidateUsersSQL), " ")
	want := "SELECT user_id FROM user_alert_configs WHERE tracked_tags && $1 AND ST_DWithin(last_known_location::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)"
	if compact != want {
		t.Fatalf("sql = %s", compact)
	}
	if !strings.Contains(insertBeaconSQL, "ST_SetSRID(ST_MakePoint($5, $6), 4326)") {
		t.Fatal(insertBeaconSQL)
	}
}

func TestCreateBeaconHTTP(t *testing.T) {
	svc := NewService(NewMemoryStore(), NewMemoryDeduper(), NewHub())
	handler := HandleCreateBeacon(svc)

	bad := httptest.NewRequest(http.MethodPost, "/api/v1/beacons", strings.NewReader(`{"title":""}`))
	badRec := httptest.NewRecorder()
	handler.ServeHTTP(badRec, bad)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("bad status = %d body = %s", badRec.Code, badRec.Body.String())
	}

	body := `{
		"title":"Boulder Tech & GIS Meetup",
		"venue":"Pearl St Mall",
		"channels":["#TechMeetup","#PostGIS"],
		"latitude":40.0179,
		"longitude":-105.2789,
		"radius_meters":1500,
		"visibility":"tag_network",
		"duration_hours":2
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/beacons", strings.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	var response createBeaconResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Beacon.ID == "" || response.Beacon.RadiusMeters != 1500 || len(response.NotifiedUserIDs) != 0 {
		t.Fatalf("response = %#v", response)
	}
}

func TestLocationHTTPAndWebsocket(t *testing.T) {
	store := NewMemoryStore()
	hub := NewHub()
	svc := NewService(store, NewMemoryDeduper(), hub)
	if _, _, err := svc.CreateBeacon(context.Background(), sampleBeacon(1500)); err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/telemetry/location", HandleLocationHTTP(svc))
	mux.HandleFunc("/ws", HandleWS(svc, hub))
	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	waitForClients(t, hub, 1)

	resp, err := http.Post(server.URL+"/api/v1/telemetry/location", "application/json", strings.NewReader(`{
		"userId":"walker",
		"latitude":40.0179,
		"longitude":-105.2789,
		"trackedTags":["#TechMeetup"]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("location status = %d body = %s", resp.StatusCode, payload)
	}
	var body locationResponse
	if err := json.Unmarshal(payload, &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Alerts) != 1 {
		t.Fatalf("alerts = %#v", body.Alerts)
	}
	alert := readAlert(t, conn)
	if alert.BeaconID == "" || alert.UserIDs[0] != "walker" {
		t.Fatalf("ws alert = %#v", alert)
	}

	if err := conn.WriteJSON(locationEnvelope{
		Type: "location_ping",
		Payload: TrackerFix{
			UserID:      "walker-2",
			Latitude:    40.0179,
			Longitude:   -105.2789,
			TrackedTags: []string{"#PostGIS"},
		},
	}); err != nil {
		t.Fatal(err)
	}
	second := readAlert(t, conn)
	if second.UserIDs[0] != "walker-2" {
		t.Fatalf("second alert = %#v", second)
	}
}

func sampleBeacon(radius float64) Beacon {
	return Beacon{
		Title:         "Boulder Tech & GIS Meetup",
		Venue:         "Pearl St Mall",
		Channels:      []string{"#TechMeetup", "#PostGIS"},
		Latitude:      40.0179,
		Longitude:     -105.2789,
		RadiusMeters:  radius,
		Visibility:    "tag_network",
		DurationHours: 2,
	}
}

func mustBeacon(t *testing.T, beacon Beacon) Beacon {
	t.Helper()
	if err := beacon.normalize(); err != nil {
		t.Fatal(err)
	}
	return beacon
}

func mustFix(t *testing.T, fix TrackerFix) TrackerFix {
	t.Helper()
	if err := fix.normalize(); err != nil {
		t.Fatal(err)
	}
	return fix
}

func startHubClient(t *testing.T, hub *Hub) *websocket.Conn {
	t.Helper()
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		hub.Register(conn)
		defer hub.Unregister(conn)
		defer conn.Close()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}))
	t.Cleanup(server.Close)

	conn, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(server.URL, "http"), nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	waitForClients(t, hub, 1)
	return conn
}

func waitForClients(t *testing.T, hub *Hub, want int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if hub.Len() >= want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("hub len = %d, want %d", hub.Len(), want)
}

func readAlert(t *testing.T, conn *websocket.Conn) ProximityAlertMessage {
	t.Helper()
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var alert ProximityAlertMessage
	if err := conn.ReadJSON(&alert); err != nil {
		t.Fatal(err)
	}
	return alert
}
