package events

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
)

// RedisDeduper claims alert keys with SET key 1 NX EX 21600.
type RedisDeduper struct {
	addr     string
	password string
	dial     func(ctx context.Context, address string) (net.Conn, error)
}

func NewRedisDeduper(rawURL string) *RedisDeduper {
	addr, password := parseRedisURL(rawURL)
	return &RedisDeduper{
		addr:     addr,
		password: password,
		dial: func(ctx context.Context, address string) (net.Conn, error) {
			var dialer net.Dialer
			return dialer.DialContext(ctx, "tcp", address)
		},
	}
}

func parseRedisURL(raw string) (string, string) {
	raw = strings.TrimSpace(raw)
	if !strings.Contains(raw, "://") {
		return raw, ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw, ""
	}
	host := parsed.Host
	if parsed.Port() == "" && parsed.Hostname() != "" {
		host = net.JoinHostPort(parsed.Hostname(), "6379")
	}
	password, _ := parsed.User.Password()
	if password == "" {
		password = parsed.User.Username()
	}
	return host, password
}

func (r *RedisDeduper) Ping(ctx context.Context) error {
	reply, err := r.command(ctx, "PING")
	if err != nil {
		return err
	}
	if reply != "PONG" {
		return fmt.Errorf("redis: ping %q", reply)
	}
	return nil
}

func (r *RedisDeduper) Claim(ctx context.Context, userID, beaconID string) (bool, error) {
	key := AlertSentKey(userID, beaconID)
	reply, err := r.command(ctx, "SET", key, "1", "NX", "EX", strconv.Itoa(int(alertTTL.Seconds())))
	if err != nil {
		return false, err
	}
	return reply == "OK", nil
}

func (r *RedisDeduper) command(ctx context.Context, args ...string) (string, error) {
	conn, err := r.dial(ctx, r.addr)
	if err != nil {
		return "", err
	}
	defer conn.Close()
	deadline, ok := ctx.Deadline()
	if ok {
		_ = conn.SetDeadline(deadline)
	}
	reader := bufio.NewReader(conn)
	if r.password != "" {
		if _, err := conn.Write([]byte(encodeRESP([]string{"AUTH", r.password}))); err != nil {
			return "", err
		}
		if _, err := readRESP(reader); err != nil {
			return "", err
		}
	}
	if _, err := conn.Write([]byte(encodeRESP(args))); err != nil {
		return "", err
	}
	return readRESP(reader)
}

func readRESP(reader *bufio.Reader) (string, error) {
	prefix, err := reader.ReadByte()
	if err != nil {
		return "", err
	}
	line, err := reader.ReadString('\n')
	if err != nil {
		return "", err
	}
	line = strings.TrimRight(line, "\r\n")
	switch prefix {
	case '+':
		return line, nil
	case '-':
		return "", fmt.Errorf("redis: %s", line)
	case '$':
		size, err := strconv.Atoi(line)
		if err != nil {
			return "", err
		}
		if size < 0 {
			return "", nil
		}
		buf := make([]byte, size+2)
		if _, err := reader.Read(buf); err != nil {
			return "", err
		}
		return string(buf[:size]), nil
	default:
		return "", fmt.Errorf("redis: unexpected reply %q", string(prefix))
	}
}

func encodeRESP(args []string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "*%d\r\n", len(args))
	for _, arg := range args {
		fmt.Fprintf(&b, "$%d\r\n%s\r\n", len(arg), arg)
	}
	return b.String()
}
