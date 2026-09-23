package telemetry

import (
	"encoding/json"
	"fmt"
	"time"
)

// Ping is the telemetry struct ingested from proxipoint-mobile.
// The diagnostic mock ping uses Erie, Colorado: 40.0503, -105.0497.
type Ping struct {
	Kind      string  `json:"kind"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Label     string  `json:"label"`
}

// ProximityAlertPayload is the simulated alert pushed back to a client
// immediately after a location ping is ingested.
type ProximityAlertPayload struct {
	AlertID         string  `json:"alertId"`
	TargetEntityID  string  `json:"targetEntityId"`
	TargetName      string  `json:"targetName"`
	DistanceMeters  float64 `json:"distanceMeters"`
	ThresholdMeters float64 `json:"thresholdMeters"`
	Latitude        float64 `json:"latitude"`
	Longitude       float64 `json:"longitude"`
	TriggeredAt     string  `json:"triggeredAt"`
	Message         string  `json:"message"`
}

// ServerMessage is the envelope written back over the telemetry socket.
type ServerMessage struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

// SimulatedProximityAlert builds the LAN-test alert for Erie Community Center.
func SimulatedProximityAlert(now time.Time) ServerMessage {
	return ServerMessage{
		Type: "proximity_alert",
		Payload: ProximityAlertPayload{
			AlertID:         "alert-test-001",
			TargetEntityID:  "node-erie-north",
			TargetName:      "Erie Community Center",
			DistanceMeters:  42.5,
			ThresholdMeters: 100.0,
			Latitude:        40.0512,
			Longitude:       -105.0485,
			TriggeredAt:     now.UTC().Format(time.RFC3339),
			Message:         "Target within 50m proximity radius",
		},
	}
}

func Decode(raw []byte) (Ping, error) {
	var ping Ping
	if err := json.Unmarshal(raw, &ping); err != nil {
		return Ping{}, fmt.Errorf("decode telemetry: %w", err)
	}
	if ping.Kind == "" {
		var envelope struct {
			Type    string `json:"type"`
			Payload struct {
				Latitude  float64 `json:"latitude"`
				Longitude float64 `json:"longitude"`
				UserID    string  `json:"userId"`
			} `json:"payload"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			return Ping{}, fmt.Errorf("decode telemetry: %w", err)
		}
		if envelope.Type == "location_ping" {
			ping.Kind = "ping"
			ping.Latitude = envelope.Payload.Latitude
			ping.Longitude = envelope.Payload.Longitude
			if ping.Label == "" {
				ping.Label = envelope.Payload.UserID
			}
		}
	}
	if ping.Kind == "" {
		return Ping{}, fmt.Errorf("decode telemetry: missing kind")
	}
	return ping, nil
}
