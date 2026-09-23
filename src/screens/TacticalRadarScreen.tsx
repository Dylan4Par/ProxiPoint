import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from '../components/radar/StatusBar';
import { NodeRadarDrawer } from '../components/radar/NodeRadarDrawer';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { useProximityStore } from '../stores/useProximityStore';
interface Props {
  tenantId?: string;
  userId?: string;
}
export const TacticalRadarScreen: React.FC<Props> = ({
  tenantId = 'tenant-alpha',
  userId = 'Ranger-F0A5ACCF',
}) => {
  // Initialize WebSocket connection
  useProximitySocket({ tenantId, userId });
  const myLocation = useProximityStore((s) => s.myLocation);
  const alerts = useProximityStore((s) => s.alerts);
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar callsign={userId} />
      {/* Map View Canvas Placeholder / Drop-in */}
      <View style={styles.mapCanvas}>
        <View style={styles.crosshair}>
          <Text style={styles.centerTargetText}>⊕</Text>
          <Text style={styles.coordsReadout}>
            Focal Center: {myLocation?.latitude.toFixed(5)}, {myLocation?.longitude.toFixed(5)}
          </Text>
          <Text style={styles.nodeCounter}>Tracking {alerts.length} peer targets in radius</Text>
        </View>
      </View>
      <NodeRadarDrawer />
    </SafeAreaView>
  );
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  mapCanvas: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshair: { alignItems: 'center' },
  centerTargetText: { color: '#0284c7', fontSize: 44, fontWeight: '200' },
  coordsReadout: { color: '#94a3b8', fontSize: 12, marginTop: 4, fontFamily: 'monospace' },
  nodeCounter: { color: '#059669', fontSize: 11, fontWeight: '700', marginTop: 4 },
});
