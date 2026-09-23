package ingest

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

// ProximityRadiusMeters is the ST_DWithin radius applied to each location ping.
const ProximityRadiusMeters = 100.0

// NearbyFinder looks up entities around a WGS84 point. lon is passed before lat,
// matching ST_MakePoint(longitude, latitude).
type NearbyFinder interface {
	QueryNearbyEntities(ctx context.Context, lon, lat, radiusMeters float64) ([]telemetry.ProximityAlertPayload, error)
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewMux(logger *log.Logger) http.Handler {
	return NewMuxWithFinder(logger, nil)
}

func NewMuxWithFinder(logger *log.Logger, finder NearbyFinder) http.Handler {
	if logger == nil {
		logger = log.Default()
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws/telemetry", func(w http.ResponseWriter, r *http.Request) {
		handleTelemetry(logger, finder, w, r)
	})
	return mux
}

func handleTelemetry(logger *log.Logger, finder NearbyFinder, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Printf("telemetry upgrade failed: %v", err)
		return
	}
	defer conn.Close()
	conn.SetReadLimit(1 << 16)
	logger.Printf("telemetry client connected from %s", r.RemoteAddr)

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				logger.Printf("telemetry client closed")
				return
			}
			logger.Printf("telemetry read ended: %v", err)
			return
		}

		ping, err := telemetry.Decode(raw)
		if err != nil {
			logger.Printf("rejected telemetry payload: %v", err)
			_ = conn.WriteJSON(map[string]string{"status": "rejected"})
			continue
		}

		logger.Printf("raw frame received: %s", string(raw))
		logger.Printf(
			"ingested telemetry struct: %+v latitude=%.4f longitude=%.4f",
			ping,
			ping.Latitude,
			ping.Longitude,
		)

		if ping.Kind == "ping" {
			if finder != nil {
				ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
				alerts, err := finder.QueryNearbyEntities(ctx, ping.Longitude, ping.Latitude, ProximityRadiusMeters)
				cancel()
				if err != nil {
					logger.Printf("spatial query error: %v", err)
					continue
				}
				for _, alert := range alerts {
					out := telemetry.ServerMessage{
						Type:    "proximity_alert",
						Payload: alert,
					}
					if err := conn.WriteJSON(out); err != nil {
						logger.Printf("ws write error: %v", err)
						return
					}
				}
				continue
			}

			alert := telemetry.SimulatedProximityAlert(time.Now())
			if err := conn.WriteJSON(alert); err != nil {
				logger.Printf("ws write error: %v", err)
				return
			}
			continue
		}

		if err := conn.WriteJSON(map[string]string{
			"status": "ingested",
			"label":  ping.Label,
		}); err != nil {
			logger.Printf("ws write error: %v", err)
			return
		}
	}
}
