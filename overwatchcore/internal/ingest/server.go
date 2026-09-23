package ingest

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"

	"github.com/Dylan4Par/ProxiPoint/overwatchcore/internal/telemetry"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewMux(logger *log.Logger) http.Handler {
	if logger == nil {
		logger = log.Default()
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws/telemetry", func(w http.ResponseWriter, r *http.Request) {
		handleTelemetry(logger, w, r)
	})
	return mux
}

func handleTelemetry(logger *log.Logger, w http.ResponseWriter, r *http.Request) {
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

		logger.Printf(
			"ingested telemetry struct: %+v latitude=%.4f longitude=%.4f",
			ping,
			ping.Latitude,
			ping.Longitude,
		)
		_ = conn.WriteJSON(map[string]string{
			"status": "ingested",
			"label":  ping.Label,
		})
	}
}
