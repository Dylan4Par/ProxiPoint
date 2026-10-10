package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/beacons"
)

func main() {
	addr := getenv("ADDR", ":8081")
	store := openStore()
	hub := beacons.NewHub()

	server := &http.Server{
		Addr:              addr,
		Handler:           beacons.Routes(store, hub),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("events-api listening on %s", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func openStore() beacons.Store {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Printf("DATABASE_URL unset; using in-memory beacon reputation")
		return beacons.NewDemoStore()
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
	if err := beacons.EnsureSchema(ctx, db); err != nil {
		log.Fatalf("migrate beacon schema: %v", err)
	}
	log.Printf("connected beacon store")
	return beacons.NewPostgresStore(db)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
