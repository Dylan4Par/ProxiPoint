package events

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/tags"
)

// TagAssigner is the subset of the tag service used when creating or updating an event.
type TagAssigner interface {
	AssignTagsToEvent(ctx context.Context, eventID uuid.UUID, rawTags []string) error
	ListEventTags(ctx context.Context, eventID uuid.UUID) ([]tags.Tag, error)
}

type eventRequest struct {
	Tags *[]string `json:"tags"`
}

type eventResponse struct {
	ID   string     `json:"id"`
	Tags []tags.Tag `json:"tags"`
}

// HandleCreate serves POST /api/v1/events.
// The body accepts tags as an array of strings, at most 3.
func HandleCreate(assigner TagAssigner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		if assigner == nil {
			writeJSON(w, http.StatusServiceUnavailable, errorBody("tag service unavailable"))
			return
		}

		rawTags, ok := decodeTags(w, r)
		if !ok {
			return
		}
		normalized, ok := normalizeTags(w, rawTags)
		if !ok {
			return
		}

		eventID := uuid.New()
		saved, ok := assignAndList(w, r, assigner, eventID, normalized)
		if !ok {
			return
		}
		writeJSON(w, http.StatusCreated, eventResponse{ID: eventID.String(), Tags: saved})
	}
}

// HandleByID serves PUT /api/v1/events/{id}.
// The tag set is replaced by the supplied array, still capped at 3.
func HandleByID(assigner TagAssigner) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPut {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		if assigner == nil {
			writeJSON(w, http.StatusServiceUnavailable, errorBody("tag service unavailable"))
			return
		}

		eventID, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, errorBody("invalid event id"))
			return
		}

		rawTags, ok := decodeTags(w, r)
		if !ok {
			return
		}
		normalized, ok := normalizeTags(w, rawTags)
		if !ok {
			return
		}

		saved, ok := assignAndList(w, r, assigner, eventID, normalized)
		if !ok {
			return
		}
		writeJSON(w, http.StatusOK, eventResponse{ID: eventID.String(), Tags: saved})
	}
}

func decodeTags(w http.ResponseWriter, r *http.Request) ([]string, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var req eventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errorsIsEOF(err) {
		writeJSON(w, http.StatusBadRequest, errorBody("invalid json"))
		return nil, false
	}
	if req.Tags == nil {
		writeJSON(w, http.StatusBadRequest, errorBody("tags is required"))
		return nil, false
	}
	return *req.Tags, true
}

func normalizeTags(w http.ResponseWriter, raw []string) ([]string, bool) {
	if len(raw) > 3 {
		writeJSON(w, http.StatusBadRequest, errorBody(tags.ErrTooManyTags.Error()))
		return nil, false
	}
	normalized := make([]string, 0, len(raw))
	for _, item := range raw {
		slug := tags.NormalizeSlug(item)
		if slug == "" {
			writeJSON(w, http.StatusBadRequest, errorBody("tag cannot be empty"))
			return nil, false
		}
		if len(slug) > 50 {
			writeJSON(w, http.StatusBadRequest, errorBody("tag cannot exceed 50 characters"))
			return nil, false
		}
		normalized = append(normalized, slug)
	}
	return normalized, true
}

func assignAndList(w http.ResponseWriter, r *http.Request, assigner TagAssigner, eventID uuid.UUID, normalized []string) ([]tags.Tag, bool) {
	if err := assigner.AssignTagsToEvent(r.Context(), eventID, normalized); err != nil {
		if msg, ok := tagsClientMessage(err); ok {
			writeJSON(w, http.StatusBadRequest, errorBody(msg))
			return nil, false
		}
		log.Printf("assign event tags: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorBody("internal server error"))
		return nil, false
	}
	saved, err := assigner.ListEventTags(r.Context(), eventID)
	if err != nil {
		log.Printf("list event tags: %v", err)
		writeJSON(w, http.StatusInternalServerError, errorBody("internal server error"))
		return nil, false
	}
	if saved == nil {
		saved = []tags.Tag{}
	}
	return saved, true
}

func tagsClientMessage(err error) (string, bool) {
	msg := err.Error()
	switch {
	case err == tags.ErrTooManyTags || strings.Contains(msg, tags.ErrTooManyTags.Error()):
		return tags.ErrTooManyTags.Error(), true
	case strings.Contains(msg, "tag cannot be empty"),
		strings.Contains(msg, "tag cannot exceed 50"),
		strings.Contains(msg, "more than 3 tags"):
		return msg, true
	default:
		return "", false
	}
}

func errorsIsEOF(err error) bool {
	return err == io.EOF
}

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func errorBody(message string) map[string]string {
	return map[string]string{"error": message}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("encode json: %v", err)
	}
}
