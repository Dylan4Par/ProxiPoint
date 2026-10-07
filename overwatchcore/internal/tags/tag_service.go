package tags

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

var (
	ErrTooManyTags     = errors.New("maximum of 3 tags allowed per event")
	ErrTagNotFound     = errors.New("tag not found")
	nonAlphanumericReg = regexp.MustCompile(`[^a-z0-9\s-]`)
	multipleHyphensReg = regexp.MustCompile(`-+`)
)

const (
	maxTagsPerEvent   = 3
	maxSlugLen        = 50
	AutocompleteLimit = 10
)

type Tag struct {
	ID          int    `json:"id"`
	Slug        string `json:"slug"`
	DisplayName string `json:"display_name"`
	UsageCount  int    `json:"usage_count"`
	IsCurated   bool   `json:"is_curated"`
}

type TagService struct {
	db *sql.DB
}

func NewTagService(db *sql.DB) *TagService {
	return &TagService{db: db}
}

// Available reports whether the service has a database to query.
func (s *TagService) Available() bool {
	return s != nil && s.db != nil
}

// NormalizeSlug converts strings like "#Food-Trucks!" or "Food Trucks" into "food-trucks".
func NormalizeSlug(input string) string {
	s := strings.ToLower(strings.TrimSpace(input))
	s = strings.TrimPrefix(s, "#")
	s = nonAlphanumericReg.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, " ", "-")
	s = multipleHyphensReg.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// AutocompleteSuggestions returns top tags matching prefix or fuzzy similarity.
func (s *TagService) AutocompleteSuggestions(ctx context.Context, query string, limit int) ([]Tag, error) {
	norm := NormalizeSlug(query)
	if norm == "" {
		return nil, nil
	}
	if limit <= 0 || limit > AutocompleteLimit {
		limit = AutocompleteLimit
	}
	sqlQuery := `
		SELECT id, slug, display_name, usage_count, is_curated
		FROM tags
		WHERE slug LIKE $1 || '%' OR similarity(slug, $1) > 0.3
		ORDER BY (slug LIKE $1 || '%') DESC, similarity(slug, $1) DESC, usage_count DESC
		LIMIT $2;
	`
	rows, err := s.db.QueryContext(ctx, sqlQuery, norm, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []Tag
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Slug, &t.DisplayName, &t.UsageCount, &t.IsCurated); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

// ResolveOrCreateTag resolves an alias, matches an existing canonical slug,
// or creates a new tag if no close match is found.
func (s *TagService) ResolveOrCreateTag(ctx context.Context, tx *sql.Tx, rawInput string) (*Tag, error) {
	slug := NormalizeSlug(rawInput)
	if slug == "" {
		return nil, errors.New("tag cannot be empty")
	}
	if len(slug) > maxSlugLen {
		return nil, errors.New("tag cannot exceed 50 characters")
	}

	// 1. Check if it matches an alias
	var tagID int
	aliasQuery := `SELECT tag_id FROM tag_aliases WHERE alias = $1;`
	err := tx.QueryRowContext(ctx, aliasQuery, slug).Scan(&tagID)
	if err == nil {
		return s.getTagByID(ctx, tx, tagID)
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// 2. Check direct match on canonical tags
	var t Tag
	canonicalQuery := `SELECT id, slug, display_name, usage_count, is_curated FROM tags WHERE slug = $1;`
	err = tx.QueryRowContext(ctx, canonicalQuery, slug).Scan(&t.ID, &t.Slug, &t.DisplayName, &t.UsageCount, &t.IsCurated)
	if err == nil {
		return &t, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}

	// 3. Fallback: Create new custom tag if none exists
	displayName := formatTitleCase(slug)
	insertQuery := `
		INSERT INTO tags (slug, display_name, usage_count, is_curated)
		VALUES ($1, $2, 0, FALSE)
		RETURNING id, slug, display_name, usage_count, is_curated;
	`
	err = tx.QueryRowContext(ctx, insertQuery, slug, displayName).Scan(&t.ID, &t.Slug, &t.DisplayName, &t.UsageCount, &t.IsCurated)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// AssignTagsToEvent synchronizes at most 3 tags to an event in an atomic transaction.
func (s *TagService) AssignTagsToEvent(ctx context.Context, eventID uuid.UUID, rawTags []string) error {
	if len(rawTags) > maxTagsPerEvent {
		return ErrTooManyTags
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Clear existing event_tags association
	if _, err := tx.ExecContext(ctx, `DELETE FROM event_tags WHERE event_id = $1;`, eventID); err != nil {
		return err
	}

	resolvedIDs := make(map[int]bool)
	for _, raw := range rawTags {
		tag, err := s.ResolveOrCreateTag(ctx, tx, raw)
		if err != nil {
			return err
		}
		if resolvedIDs[tag.ID] {
			continue // skip intra-request duplicates
		}
		resolvedIDs[tag.ID] = true
		if len(resolvedIDs) > maxTagsPerEvent {
			return ErrTooManyTags
		}

		// Insert junction row
		_, err = tx.ExecContext(ctx, `INSERT INTO event_tags (event_id, tag_id) VALUES ($1, $2);`, eventID, tag.ID)
		if err != nil {
			return err
		}

		// Increment usage counter
		_, err = tx.ExecContext(ctx, `UPDATE tags SET usage_count = usage_count + 1 WHERE id = $1;`, tag.ID)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// ListEventTags returns the canonical tags currently assigned to an event.
func (s *TagService) ListEventTags(ctx context.Context, eventID uuid.UUID) ([]Tag, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT t.id, t.slug, t.display_name, t.usage_count, t.is_curated
		FROM event_tags et
		JOIN tags t ON t.id = et.tag_id
		WHERE et.event_id = $1
		ORDER BY et.created_at ASC, t.slug ASC;
	`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tags := make([]Tag, 0)
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.Slug, &t.DisplayName, &t.UsageCount, &t.IsCurated); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

func (s *TagService) getTagByID(ctx context.Context, tx *sql.Tx, id int) (*Tag, error) {
	var t Tag
	err := tx.QueryRowContext(ctx, `SELECT id, slug, display_name, usage_count, is_curated FROM tags WHERE id = $1;`, id).
		Scan(&t.ID, &t.Slug, &t.DisplayName, &t.UsageCount, &t.IsCurated)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrTagNotFound
		}
		return nil, err
	}
	return &t, nil
}

func formatTitleCase(slug string) string {
	parts := strings.Split(slug, "-")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, " ")
}

// DuplicatePair is two tags whose slugs are similar enough to review for a merge.
type DuplicatePair struct {
	Tag1ID               int     `json:"tag1_id"`
	Tag1Slug             string  `json:"tag1_slug"`
	Tag1Usage            int     `json:"tag1_usage"`
	Tag1Curated          bool    `json:"tag1_curated"`
	Tag2ID               int     `json:"tag2_id"`
	Tag2Slug             string  `json:"tag2_slug"`
	Tag2Usage            int     `json:"tag2_usage"`
	Tag2Curated          bool    `json:"tag2_curated"`
	SimilarityScore      float64 `json:"similarity_score"`
	SuggestedCanonicalID int     `json:"suggested_canonical_id"`
}

// FindDuplicateCandidates returns pairs of tags whose slug similarity meets or exceeds threshold.
func (s *TagService) FindDuplicateCandidates(ctx context.Context, threshold float64, limit int) ([]DuplicatePair, error) {
	if threshold <= 0 {
		threshold = 0.65
	}
	if limit <= 0 {
		limit = 50
	}
	query := `
		SELECT 
			t1.id, t1.slug, t1.usage_count, t1.is_curated,
			t2.id, t2.slug, t2.usage_count, t2.is_curated,
			ROUND(similarity(t1.slug, t2.slug)::numeric, 3) AS sim,
			CASE 
				WHEN t1.is_curated AND NOT t2.is_curated THEN t1.id
				WHEN t2.is_curated AND NOT t1.is_curated THEN t2.id
				WHEN t1.usage_count >= t2.usage_count THEN t1.id
				ELSE t2.id
			END AS suggested_canonical_id
		FROM tags t1
		JOIN tags t2 ON t1.id < t2.id
		WHERE similarity(t1.slug, t2.slug) >= $1
		ORDER BY sim DESC, (t1.usage_count + t2.usage_count) DESC
		LIMIT $2;
	`
	rows, err := s.db.QueryContext(ctx, query, threshold, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to query duplicate tags: %w", err)
	}
	defer rows.Close()

	var pairs []DuplicatePair
	for rows.Next() {
		var p DuplicatePair
		if err := rows.Scan(
			&p.Tag1ID, &p.Tag1Slug, &p.Tag1Usage, &p.Tag1Curated,
			&p.Tag2ID, &p.Tag2Slug, &p.Tag2Usage, &p.Tag2Curated,
			&p.SimilarityScore, &p.SuggestedCanonicalID,
		); err != nil {
			return nil, err
		}
		pairs = append(pairs, p)
	}
	return pairs, rows.Err()
}

// MergeTags merges duplicateTagID into canonicalTagID atomically.
// It migrates event associations, registers an alias, sums usages, and deletes the duplicate.
func (s *TagService) MergeTags(ctx context.Context, canonicalTagID, duplicateTagID int) error {
	if canonicalTagID == duplicateTagID {
		return errors.New("cannot merge a tag into itself")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// 1. Verify existence of both tags
	var canonicalSlug string
	var duplicateSlug string
	var dupUsage int
	err = tx.QueryRowContext(ctx, `SELECT slug FROM tags WHERE id = $1;`, canonicalTagID).Scan(&canonicalSlug)
	if err != nil {
		return fmt.Errorf("canonical tag %d not found: %w", canonicalTagID, err)
	}
	if canonicalSlug == "" {
		return fmt.Errorf("canonical tag %d has an empty slug", canonicalTagID)
	}
	err = tx.QueryRowContext(ctx, `SELECT slug, usage_count FROM tags WHERE id = $1;`, duplicateTagID).
		Scan(&duplicateSlug, &dupUsage)
	if err != nil {
		return fmt.Errorf("duplicate tag %d not found: %w", duplicateTagID, err)
	}

	// 2. Prevent primary key conflicts in event_tags:
	// If an event is tagged with BOTH canonical and duplicate, drop the duplicate row first.
	dropConflictingSQL := `
		DELETE FROM event_tags et_dup
		WHERE et_dup.tag_id = $1
		  AND EXISTS (
			  SELECT 1 FROM event_tags et_can
			  WHERE et_can.event_id = et_dup.event_id
			    AND et_can.tag_id = $2
		  );
	`
	if _, err := tx.ExecContext(ctx, dropConflictingSQL, duplicateTagID, canonicalTagID); err != nil {
		return fmt.Errorf("failed resolving event_tags collision: %w", err)
	}

	// 3. Reassign remaining event associations to canonical tag
	reassignSQL := `UPDATE event_tags SET tag_id = $1 WHERE tag_id = $2;`
	if _, err := tx.ExecContext(ctx, reassignSQL, canonicalTagID, duplicateTagID); err != nil {
		return fmt.Errorf("failed reassigning event tags: %w", err)
	}

	// 4. Repoint existing aliases belonging to duplicate tag over to canonical tag
	repointAliasesSQL := `UPDATE tag_aliases SET tag_id = $1 WHERE tag_id = $2;`
	if _, err := tx.ExecContext(ctx, repointAliasesSQL, canonicalTagID, duplicateTagID); err != nil {
		return fmt.Errorf("failed repointing existing aliases: %w", err)
	}

	// 5. Register the duplicate's slug as a new alias pointing to the canonical tag
	aliasInsertSQL := `
		INSERT INTO tag_aliases (alias, tag_id)
		VALUES ($1, $2)
		ON CONFLICT (alias) DO UPDATE SET tag_id = EXCLUDED.tag_id;
	`
	if _, err := tx.ExecContext(ctx, aliasInsertSQL, duplicateSlug, canonicalTagID); err != nil {
		return fmt.Errorf("failed creating alias for duplicate: %w", err)
	}

	// 6. Delete the duplicate tag from tags
	if _, err := tx.ExecContext(ctx, `DELETE FROM tags WHERE id = $1;`, duplicateTagID); err != nil {
		return fmt.Errorf("failed deleting duplicate tag: %w", err)
	}

	// 7. Consolidate usage count on the canonical tag
	updateUsageSQL := `UPDATE tags SET usage_count = usage_count + $1 WHERE id = $2;`
	if _, err := tx.ExecContext(ctx, updateUsageSQL, dupUsage, canonicalTagID); err != nil {
		return fmt.Errorf("failed updating usage count: %w", err)
	}

	return tx.Commit()
}
