package sim

import (
	"strconv"
	"sync"
	"time"
)

// TelemetrySubject is the JetStream subject a broker deployment would bind.
// The simulator fans that subject out in-process so a field check does not
// require a live NATS server.
const TelemetrySubject = "telemetry.pings"

// Ping is one concurrent coordinate update.
type Ping struct {
	ClientID  string
	Seq       int
	Latitude  float64
	Longitude float64
	SentAt    time.Time
}

// Bus is a small subject bus with the same publish shape as a JetStream subject.
type Bus struct {
	mu   sync.RWMutex
	subs map[string][]chan Ping
}

func NewBus() *Bus {
	return &Bus{subs: map[string][]chan Ping{}}
}

// Subscribe returns a buffered subject channel. Cancel removes and closes it.
func (b *Bus) Subscribe(subject string, buffer int) (<-chan Ping, func()) {
	if buffer < 1 {
		buffer = 1
	}
	ch := make(chan Ping, buffer)
	b.mu.Lock()
	b.subs[subject] = append(b.subs[subject], ch)
	b.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			list := b.subs[subject]
			for i, sub := range list {
				if sub == ch {
					b.subs[subject] = append(list[:i], list[i+1:]...)
					close(ch)
					return
				}
			}
		})
	}
	return ch, cancel
}

// Publish copies a ping to every current subscriber on the subject.
func (b *Bus) Publish(subject string, ping Ping) {
	if ping.SentAt.IsZero() {
		ping.SentAt = time.Now()
	}
	b.mu.RLock()
	subs := append([]chan Ping(nil), b.subs[subject]...)
	b.mu.RUnlock()
	for _, ch := range subs {
		ch <- ping
	}
}

// Report is the result of one multi-client telemetry run.
type Report struct {
	Subject    string
	Clients    int
	Updates    int
	Delivered  int
	Elapsed    time.Duration
	MaxLatency time.Duration
}

// Fanout publishes clients*updates coordinate pings concurrently and measures
// delivery latency on TelemetrySubject.
func Fanout(clients, updates int) Report {
	if clients < 1 {
		clients = 1
	}
	if updates < 1 {
		updates = 1
	}
	total := clients * updates
	bus := NewBus()
	received, cancel := bus.Subscribe(TelemetrySubject, total)
	defer cancel()

	var wg sync.WaitGroup
	wg.Add(clients)
	started := time.Now()
	for id := 0; id < clients; id++ {
		go func(id int) {
			defer wg.Done()
			for seq := 0; seq < updates; seq++ {
				bus.Publish(TelemetrySubject, Ping{
					ClientID:  "client-" + strconv.Itoa(id),
					Seq:       seq,
					Latitude:  40.061708 + float64(seq)/1e5,
					Longitude: -105.038292,
					SentAt:    time.Now(),
				})
			}
		}(id)
	}

	var maxLatency time.Duration
	for delivered := 0; delivered < total; delivered++ {
		ping := <-received
		if latency := time.Since(ping.SentAt); latency > maxLatency {
			maxLatency = latency
		}
	}
	wg.Wait()
	return Report{
		Subject:    TelemetrySubject,
		Clients:    clients,
		Updates:    updates,
		Delivered:  total,
		Elapsed:    time.Since(started),
		MaxLatency: maxLatency,
	}
}
