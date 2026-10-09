import React from 'react';
import { StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { ActivityPanel } from '../components/discovery/ActivityPanel';
import { BottomNavBar } from '../components/discovery/BottomNavBar';
import { HostFeedbackModal } from '../components/discovery/HostFeedbackModal';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

export const DiscoverScreen: React.FC = () => {
  // Live duplex telemetry socket hook
  useProximitySocket();
  const shellTab = useDiscoveryStore((s) => s.shellTab);
  const pendingFeedback = useDiscoveryStore((s) => s.pendingFeedback);
  const upvoteHost = useDiscoveryStore((s) => s.upvoteHost);
  const skipHostFeedback = useDiscoveryStore((s) => s.skipHostFeedback);

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
      <HostFeedbackModal
        visible={pendingFeedback !== null}
        callsign={pendingFeedback?.hostCallsign ?? ''}
        onUpvote={() => {
          if (pendingFeedback) upvoteHost(pendingFeedback.beaconId);
        }}
        onSkip={() => {
          if (pendingFeedback) skipHostFeedback(pendingFeedback.beaconId);
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b13',
  },
});
