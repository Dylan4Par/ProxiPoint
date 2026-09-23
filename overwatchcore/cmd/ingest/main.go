package main

import (
	"log"
	"net/http"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/ingest"
)

// listenAddr binds every interface so phones on the same LAN can reach the ingest socket.
const listenAddr = "0.0.0.0:8080"

func main() {
	log.Printf("overwatchcore telemetry service listening on %s", listenAddr)
	if err := http.ListenAndServe(listenAddr, ingest.NewMux(nil)); err != nil {
		log.Fatalf("server fatal error: %v", err)
	}
}
