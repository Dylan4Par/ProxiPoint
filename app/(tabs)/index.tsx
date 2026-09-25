import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useProximitySocket } from '../../src/hooks/useProximitySocket';

// Point this to your Go WebSocket endpoint (use your machine's LAN IP for physical device testing)
const WS_ENDPOINT = 'ws://127.0.0.1:8080/ws/telemetry';
const MOCK_USER_ID = 'dev-device-01';

export default function DiagnosticScreen() {
  const [gpsPermission, setGpsPermission] = useState<boolean | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const { status, lastAlert, lastSentPing, sendLocationPing } = useProximitySocket({
    url: WS_ENDPOINT,
    userId: MOCK_USER_ID,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
      if (!cancelled) {
        setGpsPermission(permStatus === 'granted');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;
    let cancelled = false;

    if (isTracking && gpsPermission) {
      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 1,
        },
        (loc) => {
          sendLocationPing(
            loc.coords.latitude,
            loc.coords.longitude,
            loc.coords.accuracy,
            loc.coords.speed,
            loc.coords.heading,
          );
        },
      )
        .then((sub) => {
          if (cancelled) {
            sub.remove();
            return;
          }
          subscriber = sub;
        })
        .catch(() => {
          // The watcher can reject if permission changes or the platform denies updates.
        });
    }

    return () => {
      cancelled = true;
      subscriber?.remove();
    };
  }, [isTracking, gpsPermission, sendLocationPing]);

  const getStatusColor = (currentStatus: string) => {
    switch (currentStatus) {
      case 'connected':
        return '#16a34a';
      case 'connecting':
      case 'reconnecting':
        return '#d97706';
      default:
        return '#dc2626';
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>ProxiPoint Telemetry Monitor</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Ingestion Stream:</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(status) }]}>
            <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.subtext}>Endpoint: {WS_ENDPOINT}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Location Controls</Text>
        <Text style={styles.subtext}>
          Permission: {gpsPermission === null ? 'Checking...' : gpsPermission ? 'Granted' : 'Denied'}
        </Text>

        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.button, isTracking ? styles.buttonActive : styles.buttonPrimary]}
            onPress={() => setIsTracking(!isTracking)}
            disabled={!gpsPermission}
          >
            <Text style={styles.buttonText}>{isTracking ? 'Stop Streaming' : 'Start Live GPS Stream'}</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={() => sendLocationPing(40.0503, -105.0497, 5.0)}
          >
            <Text style={styles.buttonTextSecondary}>Send Mock Ping</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Last Outbound Ping</Text>
        {lastSentPing ? (
          <View style={styles.codeBox}>
            <Text style={styles.codeText}>Lat: {lastSentPing.latitude.toFixed(6)}</Text>
            <Text style={styles.codeText}>Lon: {lastSentPing.longitude.toFixed(6)}</Text>
            <Text style={styles.codeText}>Accuracy: ±{lastSentPing.accuracy ?? 'N/A'} m</Text>
            <Text style={styles.codeText}>Time: {lastSentPing.timestamp}</Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>No telemetry sent yet.</Text>
        )}
      </View>

      <View style={[styles.card, lastAlert && styles.alertCard]}>
        <Text style={styles.cardTitle}>Last Inbound Alert</Text>
        {lastAlert ? (
          <View style={styles.codeBox}>
            <Text style={styles.alertText}>Target: {lastAlert.targetName || lastAlert.targetEntityId}</Text>
            <Text style={styles.codeText}>Distance: {lastAlert.distanceMeters.toFixed(1)} m</Text>
            <Text style={styles.codeText}>Threshold: {lastAlert.thresholdMeters} m</Text>
            <Text style={styles.codeText}>Triggered: {lastAlert.triggeredAt}</Text>
          </View>
        ) : (
          <Text style={styles.emptyText}>Listening for proximity triggers...</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: Platform.OS === 'web' ? 24 : 50,
    backgroundColor: '#0f172a',
    flexGrow: 1,
  },
  header: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  alertCard: {
    borderColor: '#3b82f6',
    backgroundColor: '#1e294f',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
  },
  subtext: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#2563eb',
  },
  buttonActive: {
    backgroundColor: '#dc2626',
  },
  buttonSecondary: {
    backgroundColor: '#334155',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonTextSecondary: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 13,
  },
  codeBox: {
    backgroundColor: '#090d16',
    padding: 12,
    borderRadius: 6,
    gap: 4,
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#38bdf8',
    fontSize: 12,
  },
  alertText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#facc15',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyText: {
    color: '#64748b',
    fontStyle: 'italic',
    fontSize: 13,
  },
});
