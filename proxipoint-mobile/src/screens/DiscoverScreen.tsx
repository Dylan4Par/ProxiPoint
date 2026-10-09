import React from 'react';
import { StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { ActivityPanel } from '../components/discovery/ActivityPanel';
import { BottomNavBar } from '../components/discovery/BottomNavBar';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

export const DiscoverScreen: React.FC = () => {
  // Live duplex telemetry socket hook
  useProximitySocket();
  const shellTab = useDiscoveryStore((s) => s.shellTab);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {shellTab === 'activity' ? (
        <ActivityPanel />
      ) : (
        <>
          <TopFilterHeader />
          <DiscoveryMapCanvas />
          <EventCardList />
        </>
      )}
      <BottomNavBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b13',
  },
});
