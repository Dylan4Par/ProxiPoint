package beacons

import (
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Hub fans beacon_stats events out to connected dashboard sockets.
type Hub struct {
	mu    sync.Mutex
	conns map[*websocket.Conn]struct{}
}

func NewHub() *Hub {
	return &Hub{conns: map[*websocket.Conn]struct{}{}}
}

func (h *Hub) Len() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.conns)
}

func (h *Hub) register(conn *websocket.Conn) {
	h.mu.Lock()
	h.conns[conn] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) unregister(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.conns, conn)
	h.mu.Unlock()
}

// Broadcast writes one stats event to every open socket. A failed write drops that socket.
func (h *Hub) Broadcast(stats Stats) {
	h.mu.Lock()
	defer h.mu.Unlock()
	deadline := time.Now().Add(time.Second)
	for conn := range h.conns {
		_ = conn.SetWriteDeadline(deadline)
		if err := conn.WriteJSON(stats); err != nil {
			_ = conn.Close()
			delete(h.conns, conn)
		}
	}
}

// HandleStatsWS keeps a socket open so upvote broadcasts can reach it.
func HandleStatsWS(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := wsUpgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("stats websocket upgrade: %v", err)
			return
		}
		hub.register(conn)
		defer hub.unregister(conn)
		defer conn.Close()

		conn.SetReadLimit(1024)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}
}
