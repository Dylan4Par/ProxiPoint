import React from 'react';
import { StyleSheet, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { DropPointSheet } from '../components/discovery/DropPointSheet';
import { BottomNavBar } from '../components/discovery/BottomNavBar';

export const DiscoverScreen: React.FC = () => {
  // Live duplex telemetry socket hook
  useProximitySocket();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.stage}>
        <TopFilterHeader />
        <DiscoveryMapCanvas />
        <EventCardList />
        <DropPointSheet />
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
});
