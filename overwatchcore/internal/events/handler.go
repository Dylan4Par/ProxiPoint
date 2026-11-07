package events

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(*http.Request) bool { return true },
}

type createBeaconResponse struct {
	Beacon          Beacon   `json:"beacon"`
	NotifiedUserIDs []string `json:"notified_user_ids"`
}

type locationResponse struct {
	Alerts []ProximityAlertMessage `json:"alerts"`
}

type locationEnvelope struct {
	Type    string     `json:"type"`
	Payload TrackerFix `json:"payload"`
}

// HandleCreateBeacon serves POST /api/v1/beacons.
func HandleCreateBeacon(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		allowCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}

		var beacon Beacon
		if err := decodeJSON(w, r, &beacon); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		saved, notified, err := svc.CreateBeacon(r.Context(), beacon)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		if notified == nil {
			notified = []string{}
		}
		writeJSON(w, http.StatusCreated, createBeaconResponse{
			Beacon:          saved,
			NotifiedUserIDs: notified,
		})
	}
}

// HandleLocationHTTP serves POST /api/v1/telemetry/location.
func HandleLocationHTTP(svc *Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		allowCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}

		var fix TrackerFix
		if err := decodeJSON(w, r, &fix); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		alerts, err := svc.IngestLocation(r.Context(), fix)
		if err != nil {
			writeServiceError(w, err)
			return
		}
		if alerts == nil {
			alerts = []ProximityAlertMessage{}
		}
		writeJSON(w, http.StatusOK, locationResponse{Alerts: alerts})
	}
}

// HandleWS upgrades /ws and /api/v1/telemetry/ws and reads location_ping frames.
func HandleWS(svc *Service, hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		conn, err := wsUpgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("ws upgrade: %v", err)
			return
		}
		hub.Register(conn)
		defer func() {
			hub.Unregister(conn)
			_ = conn.Close()
		}()

		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Minute))
		conn.SetPongHandler(func(string) error {
			return conn.SetReadDeadline(time.Now().Add(2 * time.Minute))
		})

		for {
			var envelope locationEnvelope
			if err := conn.ReadJSON(&envelope); err != nil {
				return
			}
			_ = conn.SetReadDeadline(time.Now().Add(2 * time.Minute))
			if envelope.Type != "location_ping" {
				continue
			}
			if _, err := svc.IngestLocation(r.Context(), envelope.Payload); err != nil {
				log.Printf("ws location: %v", err)
			}
		}
	}
}

func allowCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dest any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(dest)
}

func writeServiceError(w http.ResponseWriter, err error) {
	var bad *validationError
	if errors.As(err, &bad) {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	log.Printf("events: %v", err)
	http.Error(w, "Internal Server Error", http.StatusInternalServerError)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("encode events response: %v", err)
	}
}
