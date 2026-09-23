import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useProximityStore } from '../../stores/useProximityStore';
interface Props {
  callsign: string;
}
export const StatusBar: React.FC<Props> = ({ callsign }) => {
  const isConnected = useProximityStore((s) => s.isConnected);
  const alertCount = useProximityStore((s) => s.alerts.length);
  const activeRadius = useProximityStore((s) => s.activeRadiusMeters);
  return (
    <View style={styles.container}>
      <View style={styles.leftGroup}>
        <View style={[styles.statusDot, isConnected ? styles.online : styles.offline]} />
        <Text style={styles.callsignText}>{callsign}</Text>
      </View>
      <View style={styles.rightGroup}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{activeRadius}m Perimeter</Text>
        </View>
        <View style={[styles.badge, alertCount > 0 ? styles.badgeAlert : styles.badgeMuted]}>
          <Text style={styles.badgeText}>{alertCount} Active Nodes</Text>
        </View>
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  leftGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  online: { backgroundColor: '#10b981' },
  offline: { backgroundColor: '#ef4444' },
  callsignText: { color: '#f8fafc', fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  rightGroup: { flexDirection: 'row', gap: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#1e293b',
  },
  badgeMuted: { backgroundColor: '#1e293b' },
  badgeAlert: { backgroundColor: '#0284c7' },
  badgeText: { color: '#f8fafc', fontSize: 11, fontWeight: '600' },
});
