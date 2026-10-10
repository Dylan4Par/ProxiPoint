import React, { useMemo } from 'react';
import { StyleSheet, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { ActivityPanel } from '../components/discovery/ActivityPanel';
import { BottomNavBar } from '../components/discovery/BottomNavBar';
import { HostFeedbackModal } from '../components/discovery/HostFeedbackModal';
import { useDiscoveryStore, type DiscoveryNode } from '../stores/useDiscoveryStore';
import type { ProxiEvent } from '../lib/trust';

function toProxiEvent(node: DiscoveryNode, selectedId: string | null): ProxiEvent {
  return {
    id: node.id,
    tag: node.tag,
    title: node.title,
    venue: node.venue,
    hostCallsign: node.hostCallsign,
    hostDrops: node.hostDrops,
    hostUpvotes: node.hostUpvotes,
    attendeeCount: node.attendeeCount,
    status: node.status,
    startsAt: node.startsAt,
    distanceMeters: node.distanceMeters,
    isRsvpd: node.isRsvpd,
    selected: node.id === selectedId,
  };
}

export const DiscoverScreen: React.FC = () => {
  // Live duplex telemetry socket hook
  useProximitySocket();
  const shellTab = useDiscoveryStore((s) => s.shellTab);
  const pendingFeedback = useDiscoveryStore((s) => s.pendingFeedback);
  const upvoteHost = useDiscoveryStore((s) => s.upvoteHost);
  const skipHostFeedback = useDiscoveryStore((s) => s.skipHostFeedback);
  const nodes = useDiscoveryStore((s) => s.nodes);
  const viewportBounds = useDiscoveryStore((s) => s.viewportBounds);
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const selectedNodeId = useDiscoveryStore((s) => s.selectedNodeId);
  const getVisibleNodes = useDiscoveryStore((s) => s.getVisibleNodes);
  const setSelectedNodeId = useDiscoveryStore((s) => s.setSelectedNodeId);
  const toggleRsvp = useDiscoveryStore((s) => s.toggleRsvp);
  const events = useMemo(
    () => getVisibleNodes().map((node) => toProxiEvent(node, selectedNodeId)),
    [getVisibleNodes, nodes, viewportBounds, activeTab, selectedTag, selectedNodeId],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      {shellTab === 'activity' ? (
        <ActivityPanel />
      ) : (
        <>
          <TopFilterHeader />
          <DiscoveryMapCanvas />
          <EventCardList
            events={events}
            onSelectEvent={(event) => setSelectedNodeId(event.id)}
            onToggleRsvp={toggleRsvp}
          />
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
