import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';

import ProximityMap from '@/components/ProximityMap';
import { ERIE_LATITUDE, ERIE_LONGITUDE, telemetryEndpoint } from '@/constants/telemetry';
import { useProximitySocket } from '../../src/hooks/useProximitySocket';

const WS_ENDPOINT = telemetryEndpoint();
const MOCK_USER_ID = 'dev-device-01';
const DEFAULT_RADIUS_METERS = 100;

export default function LiveMapScreen() {
  const [gpsPermission, setGpsPermission] = useState<boolean | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [hudOpen, setHudOpen] = useState(true);
  const [pingNote, setPingNote] = useState<string | null>(null);
  const [currentCoords, setCurrentCoords] = useState({ lat: ERIE_LATITUDE, lon: ERIE_LONGITUDE });

  const { status, lastAlert, sendLocationPing } = useProximitySocket({
    url: WS_ENDPOINT,
    userId: MOCK_USER_ID,
  });

  useEffect(() => {
    let cancelled = false;
    Location.requestForegroundPermissionsAsync()
      .then(({ status: permStatus }) => {
        if (!cancelled) setGpsPermission(permStatus === 'granted');
      })
      .catch(() => {
        if (!cancelled) setGpsPermission(false);
      });
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
          const { latitude, longitude, accuracy, speed, heading } = loc.coords;
          setCurrentCoords({ lat: latitude, lon: longitude });
          sendLocationPing(latitude, longitude, accuracy, speed, heading);
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
          setIsTracking(false);
        });
    }

    return () => {
      cancelled = true;
      subscriber?.remove();
    };
  }, [isTracking, gpsPermission, sendLocationPing]);

  const handleSendMock = () => {
    const lat = ERIE_LATITUDE;
    const lon = ERIE_LONGITUDE;
    setCurrentCoords({ lat, lon });
    const sent = sendLocationPing(lat, lon, 5.0);
    setPingNote(sent ? null : 'Socket not open — mock ping was not sent');
  };

  const radiusMeters = lastAlert?.thresholdMeters ?? DEFAULT_RADIUS_METERS;
  const target = lastAlert
    ? {
        lat: lastAlert.latitude,
        lon: lastAlert.longitude,
        name: lastAlert.targetName || 'Target',
      }
    : null;
  const statusColor =
    status === 'connected' ? '#16a34a' : status === 'connecting' || status === 'reconnecting' ? '#d97706' : '#dc2626';
  const distanceLabel = lastAlert ? `${lastAlert.distanceMeters.toFixed(1)} m` : '—';

  return (
    <View style={styles.container}>
      <ProximityMap user={currentCoords} radiusMeters={radiusMeters} target={target} />

      <View style={styles.hudPanel}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle telemetry diagnostics"
          onPress={() => setHudOpen((open) => !open)}
          style={styles.row}>
          <Text style={styles.brandTitle}>ProxiPoint Radar</Text>
          <View style={styles.rowRight}>
            <View style={[styles.statusPill, { backgroundColor: statusColor }]}>
              <Text style={styles.statusPillText}>{status.toUpperCase()}</Text>
            </View>
            <Text style={styles.chevron}>{hudOpen ? '▾' : '▸'}</Text>
          </View>
        </Pressable>
        <Text style={styles.distanceText}>Last distance {distanceLabel}</Text>

        {hudOpen ? (
          <View>
            <Text style={styles.coordsText}>
              Position: {currentCoords.lat.toFixed(4)}, {currentCoords.lon.toFixed(4)}
            </Text>
            <Text style={styles.metaText}>
              Geofence {radiusMeters.toFixed(0)} m · GPS{' '}
              {gpsPermission === null ? 'checking' : gpsPermission ? 'granted' : 'unavailable'}
            </Text>
            {lastAlert ? (
              <View style={styles.alertBanner}>
                <Text style={styles.alertHeading}>PROXIMITY DETECTED</Text>
                <Text style={styles.alertDetail}>{lastAlert.targetName || 'Target'}</Text>
                <Text style={styles.alertSub}>
                  {lastAlert.distanceMeters.toFixed(1)}m away
                  {lastAlert.message ? ` (${lastAlert.message})` : ''}
                </Text>
              </View>
            ) : null}
            {pingNote ? <Text style={styles.note}>{pingNote}</Text> : null}
            <View style={styles.buttonRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isTracking ? 'Stop Tracking' : 'Start GPS Tracking'}
                style={[styles.btn, isTracking ? styles.btnActive : styles.btnPrimary]}
                onPress={() => setIsTracking((tracking) => !tracking)}
                disabled={!gpsPermission}>
                <Text style={styles.btnText}>{isTracking ? 'Stop Tracking' : 'Start GPS Tracking'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send Mock Ping"
                style={[styles.btn, styles.btnSecondary]}
                onPress={handleSendMock}>
                <Text style={styles.btnTextSecondary}>Send Mock Ping</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d',
  },
  hudPanel: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  chevron: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  distanceText: {
    color: '#e2e8f0',
    fontSize: 12,
    marginTop: 6,
    marginBottom: 8,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  coordsText: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
  },
  metaText: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 10,
  },
  alertBanner: {
    backgroundColor: 'rgba(250, 204, 21, 0.12)',
    borderColor: '#eab308',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginBottom: 12,
  },
  alertHeading: {
    color: '#facc15',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  alertDetail: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  alertSub: {
    color: '#cbd5e1',
    fontSize: 12,
    marginTop: 2,
  },
  note: {
    color: '#fca5a5',
    fontSize: 12,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
  },
  btnActive: {
    backgroundColor: '#dc2626',
  },
  btnSecondary: {
    backgroundColor: '#334155',
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  btnTextSecondary: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 13,
  },
});
