package beacons

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
)

type upvoteRequest struct {
	VoterID string `json:"voterId"`
}

// HandleUpvote serves POST /api/v1/beacons/{id}/upvote.
// A new vote increments upvote_count and broadcasts beacon_stats on the hub.
// The same voter receives the current stats again without a second increment.
func HandleUpvote(store Store, hub *Hub) http.HandlerFunc {
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

		var body upvoteRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "Bad Request", http.StatusBadRequest)
			return
		}

		stats, err := store.Upvote(r.Context(), r.PathValue("id"), body.VoterID)
		if err != nil {
			switch {
			case errors.Is(err, ErrMissingVoter):
				http.Error(w, "Bad Request", http.StatusBadRequest)
			case errors.Is(err, ErrNotFound):
				http.Error(w, "Not Found", http.StatusNotFound)
			default:
				log.Printf("upvote: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
			return
		}
		if hub != nil && !stats.AlreadyVoted {
			hub.Broadcast(stats)
		}

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(stats); err != nil {
			log.Printf("encode upvote response: %v", err)
		}
	}
}

// Routes is the events-api mux: health, upvotes, and the stats socket.
func Routes(store Store, hub *Hub) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/api/v1/beacons/{id}/upvote", HandleUpvote(store, hub))
	mux.HandleFunc("/ws", HandleStatsWS(hub))
	return mux
}
