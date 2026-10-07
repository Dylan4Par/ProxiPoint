package tags

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAutocompleteUnavailableWithoutDatabase(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tags/autocomplete?q=live", nil)
	rec := httptest.NewRecorder()
	HandleAutocomplete(NewTagService(nil)).ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestAutocompleteRejectsNonGET(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tags/autocomplete?q=live", nil)
	rec := httptest.NewRecorder()
	HandleAutocomplete(NewTagService(nil)).ServeHTTP(rec, req)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d", rec.Code)
	}
}
