import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useProximityStore } from '../../stores/useProximityStore';
import { ProximityAlertItem } from '../../types/proximity';
const RADII = [250, 500, 1000];
export const NodeRadarDrawer: React.FC = () => {
  const alerts = useProximityStore((s) => s.alerts);
  const activeRadius = useProximityStore((s) => s.activeRadiusMeters);
  const setRadius = useProximityStore((s) => s.setRadius);
  const selectedNodeId = useProximityStore((s) => s.selectedNodeId);
  const selectNode = useProximityStore((s) => s.selectNode);
  const renderItem = ({ item }: { item: ProximityAlertItem }) => {
    const isSelected = item.id === selectedNodeId;
    const isClose = item.distanceMeters < 150;
    return (
      <TouchableOpacity
        style={[styles.nodeCard, isSelected && styles.nodeCardSelected]}
        onPress={() => selectNode(isSelected ? null : item.id)}
      >
        <View>
          <Text style={styles.nodeTitle}>{item.label || item.id}</Text>
          <Text style={styles.nodeCoords}>
            {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
          </Text>
        </View>
        <View style={[styles.distBadge, isClose ? styles.distDanger : styles.distNormal]}>
          <Text style={styles.distText}>{Math.round(item.distanceMeters)}m</Text>
        </View>
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.drawer}>
      <View style={styles.radiusSelector}>
        <Text style={styles.selectorLabel}>Perimeter:</Text>
        <View style={styles.pillRow}>
          {RADII.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.pill, activeRadius === r && styles.pillActive]}
              onPress={() => setRadius(r)}
            >
              <Text style={[styles.pillText, activeRadius === r && styles.pillTextActive]}>
                {r >= 1000 ? `${r / 1000}km` : `${r}m`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No mesh nodes within {activeRadius}m</Text>
          </View>
        }
      />
    </View>
  );
};
const styles = StyleSheet.create({
  drawer: {
    maxHeight: 280,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
  },
  radiusSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  selectorLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: '#1e293b',
  },
  pillActive: { backgroundColor: '#0284c7' },
  pillText: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  pillTextActive: { color: '#ffffff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  nodeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  nodeCardSelected: { borderColor: '#0284c7', backgroundColor: '#172554' },
  nodeTitle: { color: '#f8fafc', fontSize: 13, fontWeight: '700' },
  nodeCoords: { color: '#64748b', fontSize: 10, marginTop: 2 },
  distBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  distNormal: { backgroundColor: '#0369a1' },
  distDanger: { backgroundColor: '#dc2626' },
  distText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  emptyState: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { color: '#64748b', fontSize: 12 },
});
