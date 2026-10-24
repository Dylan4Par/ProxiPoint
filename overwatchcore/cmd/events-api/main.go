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
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

func main() {
	addr := getenv("ADDR", ":8090")
	svc, hub := openService()

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	mux.HandleFunc("/api/v1/beacons", events.HandleCreateBeacon(svc))
	mux.HandleFunc("/api/v1/telemetry/location", events.HandleLocationHTTP(svc))
	mux.HandleFunc("/ws", events.HandleWS(svc, hub))
	mux.HandleFunc("/api/v1/telemetry/ws", events.HandleWS(svc, hub))

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("events-api listening on %s", addr)
	log.Printf("beacon create URL http://127.0.0.1%s/api/v1/beacons", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func openService() (*events.Service, *events.Hub) {
	hub := events.NewHub()
	return events.NewService(openStore(), openDeduper(), hub), hub
}

func openStore() events.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Printf("DATABASE_URL unset; using in-memory beacon index")
		return events.NewMemoryStore()
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
	return events.NewPostGISStore(db)
}

func openDeduper() events.Deduper {
	raw := os.Getenv("REDIS_URL")
	if raw == "" {
		log.Printf("REDIS_URL unset; using in-memory 6h alert dedupe")
		return events.NewMemoryDeduper()
	}
	dedupe := events.NewRedisDeduper(raw)
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if err := dedupe.Ping(ctx); err != nil {
		log.Printf("REDIS_URL unreachable (%v); using in-memory 6h alert dedupe", err)
		return events.NewMemoryDeduper()
	}
	log.Printf("alert dedupe using redis")
	return dedupe
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
