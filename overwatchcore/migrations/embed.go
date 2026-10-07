package migrations

import (
	"context"
	"database/sql"
	_ "embed"
)

//go:embed 001_create_tag_system.sql
var tagSystemSQL string

// Apply runs the canonical tag-system migration. The script is idempotent.
func Apply(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, tagSystemSQL)
	return err
}
