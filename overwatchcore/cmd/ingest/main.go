package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/profile"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/regions"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

func main() {
	addr := getenv("ADDR", ":8080")
	nearby, districts, profiles := openIndexes()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/api/v1/telemetry/ping", telemetry.HandleTelemetryHTTP(nearby))
	mux.HandleFunc("/api/v1/telemetry/ws", telemetry.HandleTelemetryWS(nearby))
	mux.HandleFunc("/api/v1/regions/lookup", regions.HandleLookup(districts))
	mux.HandleFunc("/api/v1/profiles/", profile.Handle(profiles))

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

func openIndexes() (telemetry.NearbyQuerier, regions.Querier, profile.Store) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Printf("DATABASE_URL unset; using in-memory geofence, region, and profile stores")
		return telemetry.NewDemoIndex(), regions.NewMemoryIndex(), profile.NewMemoryStore()
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
	if err := regions.EnsureSchema(ctx, db); err != nil {
		log.Fatalf("migrate regions: %v", err)
	}
	if err := profile.EnsureSchema(ctx, db); err != nil {
		log.Fatalf("migrate profiles: %v", err)
	}
	log.Printf("connected to PostGIS")
	return telemetry.NewPostGISIndex(db), regions.NewPostGISIndex(db), profile.NewPostGISStore(db)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
