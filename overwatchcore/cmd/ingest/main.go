package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

func main() {
	addr := getenv("ADDR", ":8080")
	index := openIndex()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/api/v1/telemetry/ping", telemetry.HandleTelemetryHTTP(index))
	mux.HandleFunc("/api/v1/telemetry/ws", telemetry.HandleTelemetryWS(index))

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

func openIndex() telemetry.NearbyQuerier {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Printf("DATABASE_URL unset; using in-memory geofence index")
		return telemetry.NewDemoIndex()
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
	log.Printf("connected to PostGIS")
	return telemetry.NewPostGISIndex(db)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
