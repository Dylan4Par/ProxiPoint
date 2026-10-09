import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatRelativeTime } from '../../lib/alertFeed';
import { useAlertHistory } from '../../hooks/useAlertHistory';
import { RadarEmptyState, RADAR_EMPTY_MESSAGE } from './RadarEmptyState';

export const ActivityPanel: React.FC = () => {
  const { entries, loading } = useAlertHistory();
  const now = Date.now();

  return (
    <View style={styles.screen}>
      <Text style={styles.header}>Activity</Text>
      <Text style={styles.subtext}>Signals your network has already seen</Text>
      {loading ? (
        <Text style={styles.loading}>Scanning saved contacts…</Text>
      ) : entries.length === 0 ? (
        <RadarEmptyState kicker="ACTIVITY" message={RADAR_EMPTY_MESSAGE} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {entries.map((entry) => (
            <View key={`${entry.targetEntityId}-${entry.seenAt}`} style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.title} numberOfLines={1}>
                  {entry.targetName || entry.targetEntityId}
                </Text>
                <Text style={styles.distance}>{Math.round(entry.distanceMeters)}m</Text>
              </View>
              <Text style={styles.meta}>
                {entry.latitude.toFixed(4)}, {entry.longitude.toFixed(4)} · {formatRelativeTime(entry.seenAt, now)}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#070b13',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  header: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  subtext: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  loading: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 24,
    textAlign: 'center',
  },
  list: {
    gap: 10,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  distance: {
    color: '#6ee7b7',
    fontSize: 12,
    fontWeight: '800',
  },
  meta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 6,
  },
});
