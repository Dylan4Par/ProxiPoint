package telemetry

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type fakeQuerier struct {
	longitude float64
	latitude  float64
	radius    float64
	alerts    []ProximityAlert
	err       error
}

func (f *fakeQuerier) QueryNearbyEntities(_ context.Context, longitude, latitude, radiusMeters float64) ([]ProximityAlert, error) {
	f.longitude = longitude
	f.latitude = latitude
	f.radius = radiusMeters
	if f.err != nil {
		return nil, f.err
	}
	return f.alerts, nil
}

func TestHTTPPingUsesPayloadRadius(t *testing.T) {
	q := &fakeQuerier{
		alerts: []ProximityAlert{{
			ID: "depot", Label: "Depot", Latitude: 37.78, Longitude: -122.41, DistanceMeters: 42,
		}},
	}
	body := `{
		"userId":"dev-device-01",
		"latitude":37.77,
		"longitude":-122.42,
		"accuracy":5,
		"speed":1.2,
		"heading":90,
		"radiusMeters":250,
		"timestamp":"2026-09-23T11:00:00Z"
	}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/telemetry/ping", strings.NewReader(body))
	rec := httptest.NewRecorder()

	HandleTelemetryHTTP(q).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if q.radius != 250 || q.latitude != 37.77 || q.longitude != -122.42 {
		t.Fatalf("query args = lat %v lon %v radius %v", q.latitude, q.longitude, q.radius)
	}
	if rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("content type = %q", rec.Header().Get("Content-Type"))
	}

	var alerts []ProximityAlert
	if err := json.Unmarshal(rec.Body.Bytes(), &alerts); err != nil {
		t.Fatal(err)
	}
	if len(alerts) != 1 || alerts[0].ID != "depot" {
		t.Fatalf("alerts = %#v", alerts)
	}
}

func TestHTTPPingDefaultsRadius(t *testing.T) {
	q := &fakeQuerier{}
	body := `{"userId":"dev-device-01","latitude":1,"longitude":2,"radiusMeters":0}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/telemetry/ping", strings.NewReader(body))
	rec := httptest.NewRecorder()

	HandleTelemetryHTTP(q).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	if q.radius != defaultRadiusMeters {
		t.Fatalf("radius = %v", q.radius)
	}
	if strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestHTTPPingRejectsBadRequests(t *testing.T) {
	q := &fakeQuerier{}
	handler := HandleTelemetryHTTP(q)

	cases := []struct {
		name   string
		method string
		body   string
		status int
	}{
		{name: "get", method: http.MethodGet, body: "", status: http.StatusMethodNotAllowed},
		{name: "json", method: http.MethodPost, body: "{", status: http.StatusBadRequest},
		{name: "user", method: http.MethodPost, body: `{"latitude":1,"longitude":2,"radiusMeters":100}`, status: http.StatusBadRequest},
		{name: "lat", method: http.MethodPost, body: `{"userId":"a","latitude":99,"longitude":2,"radiusMeters":100}`, status: http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/api/v1/telemetry/ping", strings.NewReader(tc.body))
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("status = %d, want %d", rec.Code, tc.status)
			}
		})
	}
}

func TestHTTPPingQueryError(t *testing.T) {
	q := &fakeQuerier{err: errors.New("postgis down")}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/telemetry/ping", strings.NewReader(
		`{"userId":"dev-device-01","latitude":1,"longitude":2,"radiusMeters":100}`,
	))
	rec := httptest.NewRecorder()
	HandleTelemetryHTTP(q).ServeHTTP(rec, req)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestWebSocketLocationPing(t *testing.T) {
	q := &fakeQuerier{alerts: []ProximityAlert{{ID: "alpha", Label: "Alpha", Latitude: 1, Longitude: 2, DistanceMeters: 30}}}
	server := httptest.NewServer(HandleTelemetryWS(q))
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/api/v1/telemetry/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if err := conn.WriteJSON(LocationPingPacket{
		Type: "location_ping",
		Payload: LocationPing{
			UserID: "dev-device-01", Latitude: 10, Longitude: 20, RadiusMeters: 500,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		},
	}); err != nil {
		t.Fatal(err)
	}

	var packet proximityAlertPacket
	if err := conn.ReadJSON(&packet); err != nil {
		t.Fatal(err)
	}
	if packet.Type != "proximity_alerts" || len(packet.Alerts) != 1 || packet.Alerts[0].ID != "alpha" {
		t.Fatalf("packet = %#v", packet)
	}
	if q.radius != 500 || q.latitude != 10 || q.longitude != 20 {
		t.Fatalf("query args = lat %v lon %v radius %v", q.latitude, q.longitude, q.radius)
	}
}
