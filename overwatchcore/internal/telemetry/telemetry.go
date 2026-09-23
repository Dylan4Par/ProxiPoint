package telemetry

import (
	"encoding/json"
	"fmt"
)

// Ping is the telemetry struct ingested from proxipoint-mobile.
// The diagnostic mock ping uses Erie, Colorado: 40.0503, -105.0497.
type Ping struct {
	Kind      string  `json:"kind"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Label     string  `json:"label"`
}

func Decode(raw []byte) (Ping, error) {
	var ping Ping
	if err := json.Unmarshal(raw, &ping); err != nil {
		return Ping{}, fmt.Errorf("decode telemetry: %w", err)
	}
	if ping.Kind == "" {
		return Ping{}, fmt.Errorf("decode telemetry: missing kind")
	}
	return ping, nil
}
