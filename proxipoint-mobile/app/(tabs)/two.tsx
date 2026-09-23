import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatRelativeTime, sortAlertsByDistance } from '../../src/lib/alertFeed';
import { useRadarSession } from '../../src/hooks/RadarSession';
import type { ActiveContact } from '../../src/types/telemetry';

export default function AlertFeedScreen() {
  const router = useRouter();
  const { alerts, isTelemetryEnabled, profileLoading } = useRadarSession();
  const alertList = sortAlertsByDistance(alerts);
  const now = useNow();

  const handleSelectAlert = (item: ActiveContact) => {
    router.push({
      pathname: '/(tabs)',
      params: {
        focusLat: String(item.latitude),
        focusLon: String(item.longitude),
        focusId: item.id,
      },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Active Radar Contacts</Text>
      <Text style={styles.subtext}>
        {alertList.length} {alertList.length === 1 ? 'contact' : 'contacts'} currently in range
      </Text>
      {!profileLoading && !isTelemetryEnabled ? (
        <Text style={styles.paused}>Telemetry broadcasting is off. New contacts pause until you enable it in Settings.</Text>
      ) : null}

      {alertList.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No active contacts within your geofence.</Text>
        </View>
      ) : (
        <FlatList
          data={alertList}
          keyExtractor={(item) => item.id}
          style={styles.listView}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`Focus ${item.label || item.id} on map`}
              onPress={() => handleSelectAlert(item)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.identity}>
                  <View style={styles.iconBadge}>
                    <Text style={styles.iconGlyph}>!</Text>
                  </View>
                  <Text style={styles.targetName}>{item.label || item.id}</Text>
                </View>
                <Text style={styles.distanceBadge}>{item.distanceMeters.toFixed(1)} m</Text>
              </View>
              <Text style={styles.messageText}>Target detected within radius</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.coordText}>
                  {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                </Text>
                <Text style={styles.timeText}>{formatRelativeTime(item.observedAt, now)}</Text>
                <Text style={styles.actionText}>Focus on Map →</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070b12', padding: 16, paddingTop: 48 },
  header: { fontSize: 22, fontWeight: '700', color: '#f8fafc' },
  subtext: { color: '#94a3b8', fontSize: 13, marginTop: 4, marginBottom: 16 },
  paused: { color: '#facc15', fontSize: 13, marginTop: -8, marginBottom: 16 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 14, fontStyle: 'italic' },
  listView: { flex: 1 },
  list: { gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.45)',
  },
  iconGlyph: { color: '#facc15', fontWeight: '800', fontSize: 16 },
  targetName: { color: '#f8fafc', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  distanceBadge: {
    backgroundColor: 'rgba(250, 204, 21, 0.15)',
    color: '#facc15',
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  messageText: { color: '#cbd5e1', fontSize: 13, marginTop: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 },
  coordText: { color: '#64748b', fontSize: 11, fontFamily: 'monospace', flexShrink: 1 },
  timeText: { color: '#94a3b8', fontSize: 11 },
  actionText: { color: '#38bdf8', fontSize: 12, fontWeight: '600' },
});
