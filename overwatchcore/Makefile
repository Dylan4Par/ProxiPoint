.PHONY: run test migrate seed

run:
	go run ./cmd/ingest

test:
	go test ./...

migrate:
	psql "$$DATABASE_URL" -f internal/spatial/schema.sql

seed:
	psql "$$DATABASE_URL" -f scripts/seed_erie.sql
