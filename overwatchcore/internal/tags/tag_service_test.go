package tags_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/events"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/tags"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/migrations"
)

func TestTagServiceAssignsAliasesAndEnforcesLimit(t *testing.T) {
	db := openTagDB(t)
	ctx := context.Background()
	svc := tags.NewTagService(db)

	eventID := uuid.New()
	raw := []string{"#Beer!", "pups", "Live Music"}
	if err := svc.AssignTagsToEvent(ctx, eventID, raw); err != nil {
		t.Fatal(err)
	}

	assigned, err := svc.ListEventTags(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	got := slugs(assigned)
	want := []string{"craft-beer", "dog-friendly", "live-music"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("assigned = %v, want %v", got, want)
	}
	for _, tag := range assigned {
		if !tag.IsCurated {
			t.Fatalf("tag %s should stay curated", tag.Slug)
		}
		if tag.UsageCount < 101 {
			t.Fatalf("usage for %s = %d, want increment", tag.Slug, tag.UsageCount)
		}
	}

	if err := svc.AssignTagsToEvent(ctx, eventID, []string{"a", "b", "c", "d"}); !errors.Is(err, tags.ErrTooManyTags) {
		t.Fatalf("err = %v, want ErrTooManyTags", err)
	}
	assigned, err = svc.ListEventTags(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(slugs(assigned), ",") != strings.Join(want, ",") {
		t.Fatalf("tags changed after rejected assign: %v", slugs(assigned))
	}

	custom := "open-mic-" + strings.ReplaceAll(uuid.NewString(), "-", "")[:12]
	if err := svc.AssignTagsToEvent(ctx, eventID, []string{custom, custom, "foodtrucks"}); err != nil {
		t.Fatal(err)
	}
	assigned, err = svc.ListEventTags(ctx, eventID)
	if err != nil {
		t.Fatal(err)
	}
	if len(assigned) != 2 {
		t.Fatalf("duplicate inputs should collapse, got %#v", assigned)
	}

	// Fill to the database cap, then prove the trigger rejects another row.
	if err := svc.AssignTagsToEvent(ctx, eventID, []string{custom, "foodtrucks", "trivia"}); err != nil {
		t.Fatal(err)
	}
	var extraID int
	if err := db.QueryRowContext(ctx, `SELECT id FROM tags WHERE slug = 'networking'`).Scan(&extraID); err != nil {
		t.Fatal(err)
	}
	_, err = db.ExecContext(ctx, `INSERT INTO event_tags (event_id, tag_id) VALUES ($1, $2)`, eventID, extraID)
	if err == nil || !strings.Contains(err.Error(), "more than 3") {
		t.Fatalf("trigger err = %v", err)
	}
}

func TestAutocompleteEndpointCapsAtTen(t *testing.T) {
	db := openTagDB(t)
	ctx := context.Background()
	for i := 0; i < 12; i++ {
		slug := "auto-" + strings.ReplaceAll(uuid.NewString(), "-", "")[:8]
		if _, err := db.ExecContext(ctx, `INSERT INTO tags (slug, display_name) VALUES ($1, $2)`, slug, slug); err != nil {
			t.Fatal(err)
		}
	}

	svc := tags.NewTagService(db)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/tags/autocomplete?q=auto", nil)
	rec := httptest.NewRecorder()
	tags.HandleAutocomplete(svc).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var suggestions []tags.Tag
	if err := json.Unmarshal(rec.Body.Bytes(), &suggestions); err != nil {
		t.Fatal(err)
	}
	if len(suggestions) != tags.AutocompleteLimit {
		t.Fatalf("suggestions = %d, want %d", len(suggestions), tags.AutocompleteLimit)
	}
	for _, tag := range suggestions {
		if !strings.HasPrefix(tag.Slug, "auto-") && !strings.Contains(tag.Slug, "auto") {
			t.Fatalf("unexpected suggestion %s", tag.Slug)
		}
	}

	req = httptest.NewRequest(http.MethodGet, "/api/v1/tags/autocomplete?q=", nil)
	rec = httptest.NewRecorder()
	tags.HandleAutocomplete(svc).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("empty query status=%d body=%s", rec.Code, rec.Body.String())
	}
}

func TestEventHTTPRoundTrip(t *testing.T) {
	db := openTagDB(t)
	svc := tags.NewTagService(db)
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/events", events.HandleCreate(svc))
	mux.HandleFunc("/api/v1/events/{id}", events.HandleByID(svc))

	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/events", strings.NewReader(`{"tags":["#FoodTrucks","music","boardgames"]}`))
	createRec := httptest.NewRecorder()
	mux.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body = %s", createRec.Code, createRec.Body.String())
	}
	var created struct {
		ID   string     `json:"id"`
		Tags []tags.Tag `json:"tags"`
	}
	if err := json.Unmarshal(createRec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if strings.Join(slugs(created.Tags), ",") != "board-games,food-truck,live-music" && !sameSet(slugs(created.Tags), []string{"board-games", "food-truck", "live-music"}) {
		t.Fatalf("created tags = %#v", created.Tags)
	}

	updateReq := httptest.NewRequest(http.MethodPut, "/api/v1/events/"+created.ID, strings.NewReader(`{"tags":["trivia"]}`))
	updateReq.SetPathValue("id", created.ID)
	updateRec := httptest.NewRecorder()
	mux.ServeHTTP(updateRec, updateReq)
	if updateRec.Code != http.StatusOK {
		t.Fatalf("update status = %d, body = %s", updateRec.Code, updateRec.Body.String())
	}
	var updated struct {
		Tags []tags.Tag `json:"tags"`
	}
	if err := json.Unmarshal(updateRec.Body.Bytes(), &updated); err != nil {
		t.Fatal(err)
	}
	if len(updated.Tags) != 1 || updated.Tags[0].Slug != "trivia" {
		t.Fatalf("updated tags = %#v", updated.Tags)
	}

	fuzzyRec := httptest.NewRecorder()
	tags.HandleAutocomplete(svc).ServeHTTP(fuzzyRec, httptest.NewRequest(http.MethodGet, "/api/v1/tags/autocomplete?q=live", nil))
	if fuzzyRec.Code != http.StatusOK || !strings.Contains(fuzzyRec.Body.String(), "live-music") {
		t.Fatalf("autocomplete body = %s", fuzzyRec.Body.String())
	}

	typoRec := httptest.NewRecorder()
	tags.HandleAutocomplete(svc).ServeHTTP(typoRec, httptest.NewRequest(http.MethodGet, "/api/v1/tags/autocomplete?q=bord-game", nil))
	if typoRec.Code != http.StatusOK || !strings.Contains(typoRec.Body.String(), "board-games") {
		t.Fatalf("fuzzy autocomplete body = %s", typoRec.Body.String())
	}
}

func openTagDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	return db
}

func slugs(list []tags.Tag) []string {
	out := make([]string, len(list))
	for i, tag := range list {
		out[i] = tag.Slug
	}
	return out
}

func sameSet(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	seen := map[string]int{}
	for _, slug := range got {
		seen[slug]++
	}
	for _, slug := range want {
		seen[slug]--
		if seen[slug] < 0 {
			return false
		}
	}
	for _, n := range seen {
		if n != 0 {
			return false
		}
	}
	return true
}
