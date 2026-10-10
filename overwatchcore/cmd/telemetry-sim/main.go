package main

import (
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/sim"
)

func main() {
	clients := flag.Int("clients", 32, "concurrent coordinate publishers")
	updates := flag.Int("updates", 40, "pings published by each client")
	flag.Parse()

	report := sim.Fanout(*clients, *updates)
	fmt.Printf("subject=%s clients=%d updates=%d delivered=%d elapsed=%s max_latency=%s\n",
		report.Subject, report.Clients, report.Updates, report.Delivered, report.Elapsed, report.MaxLatency)
	if report.MaxLatency >= time.Second || report.Elapsed >= time.Second {
		os.Exit(1)
	}
}
