import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from '../components/radar/StatusBar';
import { NodeRadarDrawer } from '../components/radar/NodeRadarDrawer';
import { TacticalMapCanvas } from '../components/map/TacticalMapCanvas';
import { useProximitySocket } from '../hooks/useProximitySocket';

interface Props {
  tenantId?: string;
  userId?: string;
}

export const TacticalRadarScreen: React.FC<Props> = ({
  tenantId = 'tenant-alpha',
  userId = 'Ranger-F0A5ACCF',
}) => {
  useProximitySocket({ tenantId, userId });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar callsign={userId} />
      <TacticalMapCanvas />
      <NodeRadarDrawer />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
});
