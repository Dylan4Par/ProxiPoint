package telemetry

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

// LocationPingPacket is the WebSocket envelope sent by proxipoint-mobile.
type LocationPingPacket struct {
	Type    string       `json:"type"`
	Payload LocationPing `json:"payload"`
}

type proximityAlertPacket struct {
	Type   string           `json:"type"`
	Alerts []ProximityAlert `json:"alerts"`
}

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// HandleTelemetryWS reads location_ping packets and writes proximity alerts.
func HandleTelemetryWS(q NearbyQuerier) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := wsUpgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("websocket upgrade: %v", err)
			return
		}
		defer conn.Close()

		for {
			var packet LocationPingPacket
			if err := conn.ReadJSON(&packet); err != nil {
				if !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
					log.Printf("websocket read: %v", err)
				}
				return
			}
			if packet.Type != "location_ping" {
				continue
			}

			alerts, err := alertsForPing(r.Context(), q, &packet.Payload)
			if err != nil {
				log.Printf("websocket spatial query error: %v", err)
				continue
			}
			response := proximityAlertPacket{Type: "proximity_alerts", Alerts: alerts}
			if err := conn.WriteJSON(response); err != nil {
				log.Printf("websocket write: %v", err)
				return
			}
		}
	}
}
