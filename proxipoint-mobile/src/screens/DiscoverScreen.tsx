import React from 'react';
import { StyleSheet, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { DropPointSheet } from '../components/discovery/DropPointSheet';
import { ActivitySheet } from '../components/discovery/ActivitySheet';
import { BottomNavBar } from '../components/discovery/BottomNavBar';
import { useAppearanceStore } from '../stores/useAppearanceStore';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

export const DiscoverScreen: React.FC = () => {
  const colors = useAppearanceStore((s) => s.colors);
  const detailOpen = useDiscoveryStore((s) => Boolean(s.detailNodeId));
  // Live duplex telemetry socket hook
  useProximitySocket();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.screen }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={colors.statusBar} translucent backgroundColor="transparent" />
      <View style={styles.stage}>
        <TopFilterHeader />
        <View style={detailOpen ? styles.mapPeek : styles.mapFlex}>
          <DiscoveryMapCanvas />
        </View>
        <EventCardList />
        <DropPointSheet />
        <ActivitySheet />
      </View>
      <BottomNavBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070b13',
  },
  stage: {
    flex: 1,
    position: 'relative',
  },
  mapFlex: {
    flex: 1,
    minHeight: 0,
  },
  mapPeek: {
    height: 132,
  },
});
