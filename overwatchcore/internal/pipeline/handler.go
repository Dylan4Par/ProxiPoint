package pipeline

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type boundaryRequest struct {
	Latitude           float64  `json:"latitude"`
	Longitude          float64  `json:"longitude"`
	PlaceType          string   `json:"place_type"`
	CustomRadiusMeters *float64 `json:"custom_radius_meters"`
}

type dropBody struct {
	HostID                 string   `json:"host_id"`
	Label                  string   `json:"label"`
	Channels               []string `json:"channels"`
	Latitude               float64  `json:"latitude"`
	Longitude              float64  `json:"longitude"`
	PlaceType              string   `json:"place_type"`
	CustomRadiusMeters     *float64 `json:"custom_radius_meters"`
	StartsAt               string   `json:"starts_at"`
	ExpiresAt              string   `json:"expires_at"`
	TrackedTags            []string `json:"tracked_tags"`
	MaxReceiveRadiusMeters float64  `json:"max_receive_radius_meters"`
	PushToken              string   `json:"push_token"`
}

type configBody struct {
	UserID                 string   `json:"user_id"`
	TrackedTags            []string `json:"tracked_tags"`
	MaxReceiveRadiusMeters float64  `json:"max_receive_radius_meters"`
	PushToken              string   `json:"push_token"`
	Latitude               float64  `json:"latitude"`
	Longitude              float64  `json:"longitude"`
}

type telemetryBody struct {
	UserID    string  `json:"user_id"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// Handle serves the pipeline routes under /api/v1/pipeline/.
func Handle(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		switch r.URL.Path {
		case "/api/v1/pipeline/boundary":
			handleBoundary(w, r)
		case "/api/v1/pipeline/beacons":
			handleDrop(w, r, svc)
		case "/api/v1/pipeline/alerts/config":
			handleConfig(w, r, svc)
		case "/api/v1/pipeline/telemetry":
			handleTelemetry(w, r, svc)
		default:
			http.NotFound(w, r)
		}
	}
}

func handleBoundary(w http.ResponseWriter, r *http.Request) {
	var body boundaryRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	boundary, err := ResolveBoundary(body.Latitude, body.Longitude, body.PlaceType, body.CustomRadiusMeters)
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	writeJSON(w, boundary)
}

func handleDrop(w http.ResponseWriter, r *http.Request, svc *Service) {
	var body dropBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	beacon, boundary, deliveries, err := svc.Drop(ctx, DropRequest{
		HostID:             body.HostID,
		Label:              body.Label,
		Channels:           body.Channels,
		Latitude:           body.Latitude,
		Longitude:          body.Longitude,
		PlaceType:          body.PlaceType,
		CustomRadiusMeters: body.CustomRadiusMeters,
		StartsAt:           parseTime(body.StartsAt),
		ExpiresAt:          parseTime(body.ExpiresAt),
		TrackedTags:        body.TrackedTags,
		MaxReceiveRadius:   body.MaxReceiveRadiusMeters,
		PushToken:          body.PushToken,
	})
	if err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if deliveries == nil {
		deliveries = []Delivery{}
	}
	writeJSON(w, map[string]any{"beacon": beacon, "boundary": boundary, "alerts": deliveries})
}

func handleConfig(w http.ResponseWriter, r *http.Request, svc *Service) {
	var body configBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if body.UserID == "" {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	err := svc.Store.SaveConfig(ctx, AlertConfig{
		UserID:                 body.UserID,
		TrackedTags:            cleanTags(body.TrackedTags),
		MaxReceiveRadiusMeters: body.MaxReceiveRadiusMeters,
		PushToken:              body.PushToken,
		Latitude:               body.Latitude,
		Longitude:              body.Longitude,
		HasLocation:            validCoordinate(body.Latitude, body.Longitude),
	})
	if err != nil {
		log.Printf("save alert config: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

func handleTelemetry(w http.ResponseWriter, r *http.Request, svc *Service) {
	var body telemetryBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	if body.UserID == "" || !validCoordinate(body.Latitude, body.Longitude) {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	deliveries, err := svc.IngestLocation(ctx, body.UserID, body.Latitude, body.Longitude)
	if err != nil {
		log.Printf("pipeline telemetry: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	if deliveries == nil {
		deliveries = []Delivery{}
	}
	writeJSON(w, map[string]any{"alerts": deliveries})
}

func parseTime(value string) time.Time {
	if value == "" {
		return time.Time{}
	}
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}
	}
	return parsed
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("encode pipeline response: %v", err)
	}
}
