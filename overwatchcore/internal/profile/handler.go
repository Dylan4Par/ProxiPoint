package profile

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
)

type reactRequest struct {
	Actor string `json:"actor"`
	Emoji string `json:"emoji"`
}

func Handle(store Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/profiles/"), "/")
		parts := strings.Split(path, "/")
		if len(parts) == 0 || parts[0] == "" {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()

		if len(parts) == 1 && r.Method == http.MethodGet {
			profile, err := store.Profile(ctx, parts[0])
			if errors.Is(err, errNotFound) {
				http.Error(w, "Not Found", http.StatusNotFound)
				return
			}
			if err != nil {
				log.Printf("profile read: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, profile)
			return
		}

		if len(parts) == 4 && parts[1] == "photos" && parts[3] == "react" && r.Method == http.MethodPost {
			var body reactRequest
			if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&body); err != nil || strings.TrimSpace(body.Actor) == "" {
				http.Error(w, "Bad Request", http.StatusBadRequest)
				return
			}
			photo, err := store.React(ctx, parts[0], parts[2], body.Actor, body.Emoji)
			if errors.Is(err, errEmojiOnly) {
				http.Error(w, "Emoji only", http.StatusBadRequest)
				return
			}
			if errors.Is(err, errNotFound) {
				http.Error(w, "Not Found", http.StatusNotFound)
				return
			}
			if err != nil {
				log.Printf("profile react: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}
			writeJSON(w, photo)
			return
		}

		http.Error(w, "Not Found", http.StatusNotFound)
	}
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Printf("encode profile: %v", err)
	}
}
