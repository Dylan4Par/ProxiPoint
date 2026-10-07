package tags_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/tags"
)

func TestFindDuplicateCandidatesPrefersCuratedTag(t *testing.T) {
	db := openTagDB(t)
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO tags (slug, display_name, usage_count, is_curated)
		VALUES ('night-market', 'Night Market', 5, TRUE)
		ON CONFLICT (slug) DO UPDATE SET usage_count = 5, is_curated = TRUE
	`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `
		INSERT INTO tags (slug, display_name, usage_count, is_curated)
		VALUES ('night-markets', 'Night Markets', 100, FALSE)
		ON CONFLICT (slug) DO UPDATE SET usage_count = 100, is_curated = FALSE
	`); err != nil {
		t.Fatal(err)
	}

	var curatedID int
	if err := db.QueryRowContext(ctx, `SELECT id FROM tags WHERE slug = 'night-market'`).Scan(&curatedID); err != nil {
		t.Fatal(err)
	}

	svc := tags.NewTagService(db)
	pairs, err := svc.FindDuplicateCandidates(ctx, 0.65, 100)
	if err != nil {
		t.Fatal(err)
	}
	var found *tags.DuplicatePair
	for i := range pairs {
		p := &pairs[i]
		slugs := map[string]bool{p.Tag1Slug: true, p.Tag2Slug: true}
		if slugs["night-market"] && slugs["night-markets"] {
			found = p
			break
		}
	}
	if found == nil {
		t.Fatalf("night-market pair missing from %#v", pairs)
	}
	if found.SimilarityScore < 0.65 {
		t.Fatalf("similarity = %v", found.SimilarityScore)
	}
	if found.SuggestedCanonicalID != curatedID {
		t.Fatalf("suggested canonical = %d, want curated %d", found.SuggestedCanonicalID, curatedID)
	}
}

func TestMergeTagsDropsCollisionsThenReassigns(t *testing.T) {
	db := openTagDB(t)
	ctx := context.Background()
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:10]
	canonicalSlug := "canon-" + suffix
	duplicateSlug := "dup-" + suffix
	legacyAlias := "old-" + suffix

	var canonicalID, duplicateID int
	if err := db.QueryRowContext(ctx, `
		INSERT INTO tags (slug, display_name, usage_count, is_curated)
		VALUES ($1, 'Canonical', 7, TRUE)
		RETURNING id
	`, canonicalSlug).Scan(&canonicalID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `
		INSERT INTO tags (slug, display_name, usage_count, is_curated)
		VALUES ($1, 'Duplicate', 4, FALSE)
		RETURNING id
	`, duplicateSlug).Scan(&duplicateID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO tag_aliases (alias, tag_id) VALUES ($1, $2)`, legacyAlias, duplicateID); err != nil {
		t.Fatal(err)
	}

	eventBoth := uuid.New()
	eventLoser := uuid.New()
	eventWinner := uuid.New()
	if _, err := db.ExecContext(ctx, `
		INSERT INTO event_tags (event_id, tag_id) VALUES
			($1, $3), ($1, $4),
			($2, $4),
			($5, $3)
	`, eventBoth, eventLoser, canonicalID, duplicateID, eventWinner); err != nil {
		t.Fatal(err)
	}

	svc := tags.NewTagService(db)
	if err := svc.MergeTags(ctx, canonicalID, canonicalID); err == nil || !strings.Contains(err.Error(), "itself") {
		t.Fatalf("self-merge err = %v", err)
	}
	if err := svc.MergeTags(ctx, canonicalID, duplicateID); err != nil {
		t.Fatal(err)
	}

	assertEventTags(t, db, eventBoth, []int{canonicalID})
	assertEventTags(t, db, eventLoser, []int{canonicalID})
	assertEventTags(t, db, eventWinner, []int{canonicalID})

	var usage int
	if err := db.QueryRowContext(ctx, `SELECT usage_count FROM tags WHERE id = $1`, canonicalID).Scan(&usage); err != nil {
		t.Fatal(err)
	}
	if usage != 11 {
		t.Fatalf("usage = %d, want 11", usage)
	}
	var dupCount int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM tags WHERE id = $1`, duplicateID).Scan(&dupCount); err != nil {
		t.Fatal(err)
	}
	if dupCount != 0 {
		t.Fatalf("duplicate tag still present")
	}
	for _, alias := range []string{duplicateSlug, legacyAlias} {
		var target int
		if err := db.QueryRowContext(ctx, `SELECT tag_id FROM tag_aliases WHERE alias = $1`, alias).Scan(&target); err != nil {
			t.Fatalf("alias %s: %v", alias, err)
		}
		if target != canonicalID {
			t.Fatalf("alias %s points at %d, want %d", alias, target, canonicalID)
		}
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	resolved, err := svc.ResolveOrCreateTag(ctx, tx, duplicateSlug)
	if err != nil {
		t.Fatal(err)
	}
	if resolved.ID != canonicalID || resolved.Slug != canonicalSlug {
		t.Fatalf("resolved = %#v", resolved)
	}
}

func TestAdminDuplicateAndMergeRoutes(t *testing.T) {
	db := openTagDB(t)
	ctx := context.Background()
	suffix := strings.ReplaceAll(uuid.NewString(), "-", "")[:10]
	var canonicalID, duplicateID int
	if err := db.QueryRowContext(ctx, `
		INSERT INTO tags (slug, display_name, usage_count) VALUES ($1, 'Win', 2) RETURNING id
	`, "win-"+suffix).Scan(&canonicalID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, `
		INSERT INTO tags (slug, display_name, usage_count) VALUES ($1, 'Lose', 3) RETURNING id
	`, "lose-"+suffix).Scan(&duplicateID); err != nil {
		t.Fatal(err)
	}

	admin := tags.NewAdminTagHandler(tags.NewTagService(db))
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/admin/tags/duplicates", admin.DetectDuplicates)
	mux.HandleFunc("/api/v1/admin/tags/merge", admin.Merge)

	detectReq := httptest.NewRequest(http.MethodGet, "/api/v1/admin/tags/duplicates?threshold=0.65&limit=50", nil)
	detectRec := httptest.NewRecorder()
	mux.ServeHTTP(detectRec, detectReq)
	if detectRec.Code != http.StatusOK {
		t.Fatalf("detect status = %d body = %s", detectRec.Code, detectRec.Body.String())
	}
	var detected struct {
		Duplicates []tags.DuplicatePair `json:"duplicates"`
		Count      int                  `json:"count"`
	}
	if err := json.Unmarshal(detectRec.Body.Bytes(), &detected); err != nil {
		t.Fatal(err)
	}
	if detected.Count != len(detected.Duplicates) {
		t.Fatalf("count = %d, len = %d", detected.Count, len(detected.Duplicates))
	}

	body := `{"canonical_tag_id":` + itoa(canonicalID) + `,"duplicate_tag_id":` + itoa(duplicateID) + `}`
	mergeReq := httptest.NewRequest(http.MethodPost, "/api/v1/admin/tags/merge", strings.NewReader(body))
	mergeRec := httptest.NewRecorder()
	mux.ServeHTTP(mergeRec, mergeReq)
	if mergeRec.Code != http.StatusOK || !strings.Contains(mergeRec.Body.String(), "success") {
		t.Fatalf("merge status = %d body = %s", mergeRec.Code, mergeRec.Body.String())
	}

	var aliasTarget int
	if err := db.QueryRowContext(ctx, `SELECT tag_id FROM tag_aliases WHERE alias = $1`, "lose-"+suffix).Scan(&aliasTarget); err != nil {
		t.Fatal(err)
	}
	if aliasTarget != canonicalID {
		t.Fatalf("alias target = %d, want %d", aliasTarget, canonicalID)
	}

	bad := httptest.NewRequest(http.MethodPost, "/api/v1/admin/tags/merge", strings.NewReader(`{}`))
	badRec := httptest.NewRecorder()
	mux.ServeHTTP(badRec, bad)
	if badRec.Code != http.StatusBadRequest {
		t.Fatalf("missing ids status = %d", badRec.Code)
	}

	same := `{"canonical_tag_id":` + itoa(canonicalID) + `,"duplicate_tag_id":` + itoa(canonicalID) + `}`
	sameRec := httptest.NewRecorder()
	mux.ServeHTTP(sameRec, httptest.NewRequest(http.MethodPost, "/api/v1/admin/tags/merge", strings.NewReader(same)))
	if sameRec.Code != http.StatusBadRequest || !strings.Contains(sameRec.Body.String(), "itself") {
		t.Fatalf("self-merge status = %d body = %s", sameRec.Code, sameRec.Body.String())
	}
}

func TestAdminHandlersRejectBadRequests(t *testing.T) {
	admin := tags.NewAdminTagHandler(nil)
	rec := httptest.NewRecorder()
	admin.DetectDuplicates(rec, httptest.NewRequest(http.MethodGet, "/api/v1/admin/tags/duplicates", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", rec.Code)
	}

	rec = httptest.NewRecorder()
	admin.Merge(rec, httptest.NewRequest(http.MethodPost, "/api/v1/admin/tags/merge", strings.NewReader(`{"canonical_tag_id":1,"duplicate_tag_id":1}`)))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("self-merge without db status = %d", rec.Code)
	}
}

func assertEventTags(t *testing.T, db *sql.DB, eventID uuid.UUID, want []int) {
	t.Helper()
	rows, err := db.QueryContext(context.Background(), `SELECT tag_id FROM event_tags WHERE event_id = $1 ORDER BY tag_id`, eventID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		got = append(got, id)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if len(got) != len(want) {
		t.Fatalf("event %s tags = %v, want %v", eventID, got, want)
	}
	seen := map[int]int{}
	for _, id := range got {
		seen[id]++
	}
	for _, id := range want {
		seen[id]--
		if seen[id] < 0 {
			t.Fatalf("event %s tags = %v, want %v", eventID, got, want)
		}
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var digits [12]byte
	i := len(digits)
	for n > 0 {
		i--
		digits[i] = byte('0' + n%10)
		n /= 10
	}
	return string(digits[i:])
}
