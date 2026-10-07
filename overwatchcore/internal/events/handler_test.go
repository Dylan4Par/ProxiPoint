package events

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/tags"
)

type fakeAssigner struct {
	eventID  uuid.UUID
	assigned []string
	calls    int
	listed   []tags.Tag
	err      error
}

func (f *fakeAssigner) AssignTagsToEvent(_ context.Context, eventID uuid.UUID, rawTags []string) error {
	f.calls++
	f.eventID = eventID
	f.assigned = append([]string(nil), rawTags...)
	return f.err
}

func (f *fakeAssigner) ListEventTags(context.Context, uuid.UUID) ([]tags.Tag, error) {
	if f.listed == nil {
		return []tags.Tag{}, nil
	}
	return f.listed, nil
}

func TestCreateRejectsMoreThanThreeTags(t *testing.T) {
	assigner := &fakeAssigner{}
	body := `{"tags":["a","b","c","d"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(body))
	rec := httptest.NewRecorder()
	HandleCreate(assigner).ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if assigner.calls != 0 {
		t.Fatalf("assign calls = %d, want 0", assigner.calls)
	}
	if !strings.Contains(rec.Body.String(), tags.ErrTooManyTags.Error()) {
		t.Fatalf("body = %s", rec.Body.String())
	}
}

func TestCreateNormalizesAndAssignsTags(t *testing.T) {
	assigner := &fakeAssigner{
		listed: []tags.Tag{{
			ID: 2, Slug: "craft-beer", DisplayName: "Craft Beer", UsageCount: 101, IsCurated: true,
		}},
	}
	body := `{"tags":["#Beer!","  Pups  "]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(body))
	rec := httptest.NewRecorder()
	HandleCreate(assigner).ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if assigner.calls != 1 {
		t.Fatalf("assign calls = %d", assigner.calls)
	}
	if strings.Join(assigner.assigned, ",") != "beer,pups" {
		t.Fatalf("assigned = %#v", assigner.assigned)
	}

	var resp eventResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if _, err := uuid.Parse(resp.ID); err != nil {
		t.Fatalf("id %q: %v", resp.ID, err)
	}
	if len(resp.Tags) != 1 || resp.Tags[0].Slug != "craft-beer" {
		t.Fatalf("tags = %#v", resp.Tags)
	}
}

func TestCreateRejectsEmptyTag(t *testing.T) {
	assigner := &fakeAssigner{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(`{"tags":["###"]}`))
	rec := httptest.NewRecorder()
	HandleCreate(assigner).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if assigner.calls != 0 {
		t.Fatalf("assign calls = %d", assigner.calls)
	}
}

func TestUpdateReplacesTags(t *testing.T) {
	assigner := &fakeAssigner{}
	eventID := uuid.New()
	req := httptest.NewRequest(http.MethodPut, "/api/v1/events/"+eventID.String(), strings.NewReader(`{"tags":["Live Music"]}`))
	req.SetPathValue("id", eventID.String())
	rec := httptest.NewRecorder()
	HandleByID(assigner).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if assigner.eventID != eventID {
		t.Fatalf("event id = %s, want %s", assigner.eventID, eventID)
	}
	if strings.Join(assigner.assigned, ",") != "live-music" {
		t.Fatalf("assigned = %#v", assigner.assigned)
	}
}

func TestUpdateRejectsBadID(t *testing.T) {
	req := httptest.NewRequest(http.MethodPut, "/api/v1/events/not-a-uuid", strings.NewReader(`{"tags":["trivia"]}`))
	req.SetPathValue("id", "not-a-uuid")
	rec := httptest.NewRecorder()
	HandleByID(&fakeAssigner{}).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestCreateUnavailableWithoutAssigner(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(`{"tags":["trivia"]}`))
	rec := httptest.NewRecorder()
	HandleCreate(nil).ServeHTTP(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}

func TestCreateRequiresTagsField(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(`{}`))
	rec := httptest.NewRecorder()
	HandleCreate(&fakeAssigner{}).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
}
