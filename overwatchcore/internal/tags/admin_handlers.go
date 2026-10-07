package tags

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
)

type AdminTagHandler struct {
	service *TagService
}

func NewAdminTagHandler(service *TagService) *AdminTagHandler {
	return &AdminTagHandler{service: service}
}

// DetectDuplicates serves GET /api/v1/admin/tags/duplicates?threshold=0.65&limit=50.
func (h *AdminTagHandler) DetectDuplicates(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	if h == nil || h.service == nil || !h.service.Available() {
		http.Error(w, "tag service unavailable", http.StatusServiceUnavailable)
		return
	}

	threshold := 0.65
	limit := 50
	if q := r.URL.Query().Get("threshold"); q != "" {
		if val, err := strconv.ParseFloat(q, 64); err == nil {
			threshold = val
		}
	}
	if q := r.URL.Query().Get("limit"); q != "" {
		if val, err := strconv.Atoi(q); err == nil {
			limit = val
		}
	}

	duplicates, err := h.service.FindDuplicateCandidates(r.Context(), threshold, limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if duplicates == nil {
		duplicates = []DuplicatePair{}
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"duplicates": duplicates,
		"count":      len(duplicates),
	})
}

type MergeRequest struct {
	CanonicalTagID int `json:"canonical_tag_id"`
	DuplicateTagID int `json:"duplicate_tag_id"`
}

// Merge serves POST /api/v1/admin/tags/merge.
func (h *AdminTagHandler) Merge(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	if h == nil || h.service == nil || !h.service.Available() {
		http.Error(w, "tag service unavailable", http.StatusServiceUnavailable)
		return
	}

	var req MergeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.CanonicalTagID == 0 || req.DuplicateTagID == 0 {
		http.Error(w, "canonical_tag_id and duplicate_tag_id are required", http.StatusBadRequest)
		return
	}
	if req.CanonicalTagID == req.DuplicateTagID {
		http.Error(w, "cannot merge a tag into itself", http.StatusBadRequest)
		return
	}
	if err := h.service.MergeTags(r.Context(), req.CanonicalTagID, req.DuplicateTagID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  "success",
		"message": fmt.Sprintf("Tag %d successfully merged into canonical tag %d", req.DuplicateTagID, req.CanonicalTagID),
	})
}
