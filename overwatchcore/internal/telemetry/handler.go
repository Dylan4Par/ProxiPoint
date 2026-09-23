package telemetry

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"
)

// HandleTelemetryHTTP serves POST /api/v1/telemetry/ping.
// The body is a LocationPing. The response is the proximity alerts inside
// that ping's radiusMeters.
func HandleTelemetryHTTP(q NearbyQuerier) http.HandlerFunc {
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

		var ping LocationPing
		if err := json.NewDecoder(r.Body).Decode(&ping); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		alerts, err := alertsForPing(r.Context(), q, &ping)
		if err != nil {
			var bad *badRequestError
			if errors.As(err, &bad) {
				http.Error(w, "Bad Request", http.StatusBadRequest)
				return
			}
			log.Printf("http fallback spatial query error: %v", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(alerts); err != nil {
			log.Printf("encode telemetry response: %v", err)
		}
	}
}

type badRequestError struct{ err error }

func (e *badRequestError) Error() string { return e.err.Error() }
func (e *badRequestError) Unwrap() error { return e.err }

func alertsForPing(parent context.Context, q NearbyQuerier, ping *LocationPing) ([]ProximityAlert, error) {
	if err := ping.Normalize(); err != nil {
		return nil, &badRequestError{err: err}
	}

	ctx, cancel := context.WithTimeout(parent, 2*time.Second)
	defer cancel()

	alerts, err := q.QueryNearbyEntities(ctx, ping.Longitude, ping.Latitude, ping.RadiusMeters)
	if err != nil {
		return nil, err
	}
	if alerts == nil {
		alerts = []ProximityAlert{}
	}
	return alerts, nil
}
