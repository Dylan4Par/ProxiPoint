package events

import (
	"sync"

	"github.com/gorilla/websocket"
)

type clientConn struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

// Hub is the active /ws connection set that receives proximity_alert fan-out.
type Hub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]*clientConn
}

func NewHub() *Hub {
	return &Hub{clients: map[*websocket.Conn]*clientConn{}}
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.mu.Lock()
	h.clients[conn] = &clientConn{conn: conn}
	h.mu.Unlock()
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
}

func (h *Hub) Broadcast(message any) {
	h.mu.Lock()
	clients := make([]*clientConn, 0, len(h.clients))
	for _, client := range h.clients {
		clients = append(clients, client)
	}
	h.mu.Unlock()

	for _, client := range clients {
		client.mu.Lock()
		err := client.conn.WriteJSON(message)
		client.mu.Unlock()
		if err != nil {
			h.Unregister(client.conn)
		}
	}
}

func (h *Hub) Len() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.clients)
}
