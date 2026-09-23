package main

import "testing"

func TestListenAddrBindsAllInterfaces(t *testing.T) {
	if listenAddr != "0.0.0.0:8080" {
		t.Fatalf("ingest server must bind 0.0.0.0:8080 for LAN devices, got %s", listenAddr)
	}
}
