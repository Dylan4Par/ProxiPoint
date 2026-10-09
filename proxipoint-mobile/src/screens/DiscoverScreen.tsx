import React, { useState } from 'react';
import { StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { BottomNavBar } from '../components/discovery/BottomNavBar';
import { DropPointModal } from '../components/discovery/DropPointModal';

export const DiscoverScreen: React.FC = () => {
  // Live duplex telemetry socket hook
  useProximitySocket();
  const [dropOpen, setDropOpen] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <TopFilterHeader />
      <DiscoveryMapCanvas />
      <EventCardList />
      <DropPointModal visible={dropOpen} onClose={() => setDropOpen(false)} />
      <BottomNavBar onDropPoint={() => setDropOpen((open) => !open)} dropActive={dropOpen} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b13',
  },
});
