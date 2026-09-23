import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Location from 'expo-location';

import { Text, View } from '@/components/Themed';
import { ERIE_MOCK_PING, telemetryEndpoint } from '@/constants/telemetry';

type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export default function TelemetryDiagnostics() {
  const endpoint = telemetryEndpoint();
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const [logs, setLogs] = useState<string[]>([]);
  const [permission, setPermission] = useState('checking');

  const appendLog = useCallback((line: string) => {
    const stamped = `${new Date().toISOString()}  ${line}`;
    setLogs((current) => [stamped, ...current].slice(0, 40));
  }, []);

  useEffect(() => {
    let cancelled = false;
    Location.getForegroundPermissionsAsync()
      .then((response) => {
        if (!cancelled) {
          setPermission(response.status);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermission('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const socket = new WebSocket(endpoint);
    socketRef.current = socket;
    setStatus('CONNECTING');

    socket.onopen = () => {
      if (!cancelled) {
        setStatus('CONNECTED');
        appendLog(`socket open ${endpoint}`);
      }
    };
    socket.onclose = () => {
      if (!cancelled) {
        setStatus('DISCONNECTED');
      }
    };
    socket.onerror = () => {
      if (!cancelled) {
        setStatus('ERROR');
        appendLog(`socket error ${endpoint}`);
      }
    };
    socket.onmessage = (event) => {
      if (!cancelled) {
        appendLog(`IN ${String(event.data)}`);
      }
    };

    return () => {
      cancelled = true;
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [appendLog, endpoint]);

  const sendMockPing = useCallback(() => {
    const socket = socketRef.current;
    const body = JSON.stringify(ERIE_MOCK_PING);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      appendLog(`OUT skipped (not CONNECTED) Erie (${ERIE_MOCK_PING.latitude}, ${ERIE_MOCK_PING.longitude}) ${body}`);
      return;
    }
    socket.send(body);
    appendLog(
      `OUT ping Erie (${ERIE_MOCK_PING.latitude}, ${ERIE_MOCK_PING.longitude}) ${body}`
    );
  }, [appendLog]);

  const appName = Constants.expoConfig?.name ?? 'proxipoint-mobile';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{appName}</Text>
      <Text style={styles.subtitle}>Telemetry diagnostics</Text>
      <Text style={styles.meta}>Endpoint {endpoint}</Text>
      <Text style={styles.meta}>Location permission {permission}</Text>
      <View
        style={[styles.statusPill, status === 'CONNECTED' ? styles.statusConnected : styles.statusIdle]}
        accessibilityLabel={`status ${status}`}>
        <Text style={styles.statusText}>{status}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send Mock Ping"
        disabled={status !== 'CONNECTED'}
        onPress={sendMockPing}
        style={({ pressed }) => [
          styles.button,
          status !== 'CONNECTED' && styles.buttonDisabled,
          pressed && status === 'CONNECTED' && styles.buttonPressed,
        ]}>
        <Text style={styles.buttonText}>Send Mock Ping</Text>
      </Pressable>
      <Text style={styles.logHeading}>Outbound log</Text>
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {logs.length === 0 ? (
          <Text style={styles.logLine}>Waiting for the ingest socket…</Text>
        ) : (
          logs.map((line) => (
            <Text key={line} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch',
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.8,
  },
  meta: {
    fontSize: 13,
    fontFamily: 'SpaceMono',
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
  },
  statusConnected: {
    backgroundColor: '#1b7f4a',
  },
  statusIdle: {
    backgroundColor: '#8a5a00',
  },
  statusText: {
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#2f95dc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  logHeading: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  log: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#888',
    borderRadius: 8,
  },
  logContent: {
    padding: 12,
    gap: 8,
  },
  logLine: {
    fontFamily: 'SpaceMono',
    fontSize: 12,
  },
});
