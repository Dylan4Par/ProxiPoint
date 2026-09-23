package spatial

import (
	"database/sql"
	"fmt"
)

// WithTestLock serializes tests that share the entities table.
// The pool is pinned to one connection so the session advisory lock
// covers every statement in the test.
func WithTestLock(db *sql.DB) (func(), error) {
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`SELECT pg_advisory_lock(424242)`); err != nil {
		return nil, fmt.Errorf("lock entities tests: %w", err)
	}
	return func() {
		_, _ = db.Exec(`SELECT pg_advisory_unlock(424242)`)
	}, nil
}
