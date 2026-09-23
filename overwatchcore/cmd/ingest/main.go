package main

import (
	"log"
	"net/http"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/ingest"
)

func main() {
	addr := ":8080"
	log.Printf("telemetry ingest listening on %s (ws://127.0.0.1:8080/ws/telemetry)", addr)
	if err := http.ListenAndServe(addr, ingest.NewMux(nil)); err != nil {
		log.Fatal(err)
	}
}
