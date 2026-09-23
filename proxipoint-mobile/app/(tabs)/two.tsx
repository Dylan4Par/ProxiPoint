import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatRelativeTime, partitionContactsByRadius } from '../../src/lib/alertFeed';
import { useRadarSession } from '../../src/hooks/RadarSession';
import type { ActiveContact } from '../../src/types/telemetry';

export default function AlertFeedScreen() {
  const router = useRouter();
  const { alerts, radiusMeters, isTelemetryEnabled, profileLoading } = useRadarSession();
  const { inRange, outOfRange } = useMemo(
    () => partitionContactsByRadius(alerts, radiusMeters),
    [alerts, radiusMeters],
  );
  const [outOfRangeOpen, setOutOfRangeOpen] = useState(true);
  const now = useNow();

  const handleSelectAlert = (item: ActiveContact) => {
    router.push({
      pathname: '/(tabs)',
      params: {
        focusLat: String(item.latitude),
        focusLon: String(item.longitude),
        focusId: item.id,
        focusNonce: String(Date.now()),
      },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Radar Contacts ({radiusMeters}m Range)</Text>
      <Text style={styles.subtext}>
        {inRange.length} in range · {outOfRange.length} out of range
      </Text>
      {!profileLoading && !isTelemetryEnabled ? (
        <Text style={styles.paused}>Telemetry broadcasting is off. New contacts pause until you enable it in Settings.</Text>
      ) : null}

      <ScrollView style={styles.listView} contentContainerStyle={styles.list}>
        <Text style={styles.sectionTitle}>Active Contacts in Range</Text>
        {inRange.length === 0 ? (
          <Text style={styles.emptyText}>No contacts within {radiusMeters}m.</Text>
        ) : (
          inRange.map((item) => (
            <ContactCard key={item.id} item={item} now={now} muted={false} onPress={() => handleSelectAlert(item)} />
          ))
        )}

        {outOfRange.length > 0 ? (
          <View style={styles.outOfRangeContainer}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: outOfRangeOpen }}
              onPress={() => setOutOfRangeOpen((open) => !open)}
            >
              <Text style={styles.subHeader}>
                {outOfRangeOpen ? '▾' : '▸'} Out of Range ({outOfRange.length})
              </Text>
            </Pressable>
            {outOfRangeOpen
              ? outOfRange.map((item) => (
                  <ContactCard key={item.id} item={item} now={now} muted onPress={() => handleSelectAlert(item)} />
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function ContactCard({
  item,
  now,
  muted,
  onPress,
}: {
  item: ActiveContact;
  now: number;
  muted: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.card, muted && styles.cardMuted]}
      accessibilityRole="button"
      accessibilityLabel={`Focus ${item.label || item.id} on map`}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.identity}>
          <View style={styles.iconBadge}>
            <Text style={styles.iconGlyph}>!</Text>
          </View>
          <Text style={[styles.targetName, muted && styles.mutedText]}>{item.label || item.id}</Text>
        </View>
        <Text style={[styles.distanceBadge, muted && styles.distanceBadgeMuted]}>{item.distanceMeters.toFixed(1)} m</Text>
      </View>
      <Text style={[styles.messageText, muted && styles.mutedText]}>
        {muted ? 'Beyond the active geofence' : 'Target detected within radius'}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={styles.coordText}>
          {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
        </Text>
        <Text style={styles.timeText}>{formatRelativeTime(item.observedAt, now)}</Text>
        <Text style={styles.actionText}>Focus on Map →</Text>
      </View>
    </Pressable>
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
  sectionTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginBottom: 10 },
  subHeader: { fontSize: 14, fontWeight: '600', color: '#64748b', marginBottom: 8 },
  emptyText: { color: '#64748b', fontSize: 14, fontStyle: 'italic', marginBottom: 8 },
  listView: { flex: 1 },
  list: { gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardMuted: { opacity: 0.55, backgroundColor: '#0f172a' },
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
  distanceBadgeMuted: { backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' },
  messageText: { color: '#cbd5e1', fontSize: 13, marginTop: 6 },
  mutedText: { color: '#94a3b8' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 },
  coordText: { color: '#64748b', fontSize: 11, fontFamily: 'monospace', flexShrink: 1 },
  timeText: { color: '#94a3b8', fontSize: 11 },
  actionText: { color: '#38bdf8', fontSize: 12, fontWeight: '600' },
  outOfRangeContainer: {
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 12,
    marginTop: 8,
    gap: 12,
  },
});
