package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/ingest"
	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/spatial"
)

// listenAddr binds every interface so phones on the same LAN can reach the ingest socket.
const listenAddr = "0.0.0.0:8080"

func main() {
	logger := log.Default()
	var finder ingest.NearbyFinder
	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		db, err := spatial.Open(dsn)
		if err != nil {
			log.Fatalf("database: %v", err)
		}
		defer db.Close()

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err = spatial.Migrate(ctx, db)
		cancel()
		if err != nil {
			log.Fatalf("database migrate: %v", err)
		}
		finder = spatial.NewStore(db)
		logger.Printf("postgis proximity engine enabled, radius %.0fm", ingest.ProximityRadiusMeters)
	} else {
		logger.Printf("DATABASE_URL unset; location pings use the simulated Erie alert")
	}

	logger.Printf("overwatchcore telemetry service listening on %s", listenAddr)
	if err := http.ListenAndServe(listenAddr, ingest.NewMuxWithFinder(logger, finder)); err != nil {
		log.Fatalf("server fatal error: %v", err)
	}
}
