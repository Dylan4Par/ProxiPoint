package regions

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"
)

// Querier resolves the named regions that contain a coordinate.
type Querier interface {
	Lookup(ctx context.Context, longitude, latitude, toleranceMeters float64) ([]Hit, error)
}

type lookupRequest struct {
	Longitude       *float64 `json:"longitude"`
	Latitude        *float64 `json:"latitude"`
	ToleranceMeters *float64 `json:"toleranceMeters"`
}

type lookupResponse struct {
	Longitude       float64 `json:"longitude"`
	Latitude        float64 `json:"latitude"`
	ToleranceMeters float64 `json:"toleranceMeters"`
	Regions         []Hit   `json:"regions"`
}

// HandleLookup serves POST /api/v1/regions/lookup.
func HandleLookup(q Querier) http.HandlerFunc {
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

		var body lookupRequest
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}
		longitude, latitude, tolerance, err := normalizeLookup(body)
		if err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		hits, err := q.Lookup(ctx, longitude, latitude, tolerance)
		if err != nil {
			log.Printf("region lookup error: %v", err)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		if hits == nil {
			hits = []Hit{}
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(lookupResponse{
			Longitude:       longitude,
			Latitude:        latitude,
			ToleranceMeters: tolerance,
			Regions:         hits,
		}); err != nil {
			log.Printf("encode region lookup: %v", err)
		}
	}
}

func normalizeLookup(body lookupRequest) (float64, float64, float64, error) {
	if body.Longitude == nil || body.Latitude == nil {
		return 0, 0, 0, errors.New("longitude and latitude are required")
	}
	longitude := *body.Longitude
	latitude := *body.Latitude
	if longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90 {
		return 0, 0, 0, errors.New("coordinates are out of range")
	}
	tolerance := DefaultToleranceMeters
	if body.ToleranceMeters != nil {
		tolerance = *body.ToleranceMeters
	}
	if tolerance < 0 || tolerance > MaxToleranceMeters {
		return 0, 0, 0, errors.New("toleranceMeters is out of range")
	}
	return longitude, latitude, tolerance, nil
}
