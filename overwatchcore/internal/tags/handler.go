package tags

import (
	"encoding/json"
	"log"
	"net/http"
)

// HandleAutocomplete serves GET /api/v1/tags/autocomplete?q=
// Results are capped at AutocompleteLimit.
func HandleAutocomplete(svc *TagService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		if svc == nil || !svc.Available() {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "tag service unavailable"})
			return
		}

		suggestions, err := svc.AutocompleteSuggestions(r.Context(), r.URL.Query().Get("q"), AutocompleteLimit)
		if err != nil {
			log.Printf("tag autocomplete: %v", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			return
		}
		if suggestions == nil {
			suggestions = []Tag{}
		}
		writeJSON(w, http.StatusOK, suggestions)
	}
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("encode json: %v", err)
	}
}
