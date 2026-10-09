package sim

import (
	"testing"
	"time"
)

func TestConcurrentTelemetryFanoutStaysUnderOneSecond(t *testing.T) {
	report := Fanout(32, 40)
	if report.Subject != TelemetrySubject {
		t.Fatalf("subject = %s", report.Subject)
	}
	if report.Delivered != 32*40 {
		t.Fatalf("delivered = %d", report.Delivered)
	}
	if report.MaxLatency >= time.Second || report.Elapsed >= time.Second {
		t.Fatalf("elapsed %s max latency %s", report.Elapsed, report.MaxLatency)
	}
	t.Logf("delivered %d in %s, max latency %s", report.Delivered, report.Elapsed, report.MaxLatency)
}

func TestSubjectReachesEverySubscriber(t *testing.T) {
	bus := NewBus()
	left, cancelLeft := bus.Subscribe(TelemetrySubject, 8)
	right, cancelRight := bus.Subscribe(TelemetrySubject, 8)
	defer cancelLeft()
	defer cancelRight()

	sent := time.Now()
	bus.Publish(TelemetrySubject, Ping{ClientID: "solo", Seq: 1, Latitude: 40.06, Longitude: -105.03, SentAt: sent})

	for _, ch := range []<-chan Ping{left, right} {
		select {
		case ping := <-ch:
			if ping.ClientID != "solo" || time.Since(ping.SentAt) >= time.Second {
				t.Fatalf("ping = %+v", ping)
			}
		case <-time.After(time.Second):
			t.Fatal("subscriber missed telemetry.pings")
		}
	}
}
