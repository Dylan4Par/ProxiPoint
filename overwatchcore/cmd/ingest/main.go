package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/events"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/tags"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/migrations"
)

func main() {
	addr := getenv("ADDR", ":8080")
	db, index := openStore()
	var tagSvc *tags.TagService
	var assigner events.TagAssigner
	if db != nil {
		tagSvc = tags.NewTagService(db)
		assigner = tagSvc
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/api/v1/telemetry/ping", telemetry.HandleTelemetryHTTP(index))
	mux.HandleFunc("/api/v1/telemetry/ws", telemetry.HandleTelemetryWS(index))
	mux.HandleFunc("/api/v1/tags/autocomplete", tags.HandleAutocomplete(tagSvc))
	mux.HandleFunc("/api/v1/events", events.HandleCreate(assigner))
	mux.HandleFunc("/api/v1/events/{id}", events.HandleByID(assigner))
	adminTags := tags.NewAdminTagHandler(tagSvc)
	mux.HandleFunc("/api/v1/admin/tags/duplicates", adminTags.DetectDuplicates)
	mux.HandleFunc("/api/v1/admin/tags/merge", adminTags.Merge)

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("overwatchcore ingest listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func openStore() (*sql.DB, telemetry.NearbyQuerier) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Printf("DATABASE_URL unset; using in-memory geofence index")
		return nil, telemetry.NewDemoIndex()
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	db.SetMaxOpenConns(10)
	db.SetConnMaxLifetime(30 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		log.Fatalf("ping database: %v", err)
	}
	if err := telemetry.EnsureSchema(ctx, db); err != nil {
		log.Fatalf("migrate schema: %v", err)
	}
	if err := migrations.Apply(ctx, db); err != nil {
		log.Fatalf("migrate tag schema: %v", err)
	}
	log.Printf("connected to PostGIS")
	return db, telemetry.NewPostGISIndex(db)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
