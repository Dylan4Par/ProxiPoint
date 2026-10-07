import React from 'react';
import { StyleSheet, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProximitySocket } from '../hooks/useProximitySocket';
import { DiscoveryLeafletMap } from '../components/discovery/DiscoveryLeafletMap';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { EventCardList } from '../components/discovery/EventCardList';
import { BottomNavBar } from '../components/discovery/BottomNavBar';
import { DropPointSheet } from '../components/discovery/DropPointSheet';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

export const DiscoverScreen: React.FC = () => {
  useProximitySocket();
  const setHeaderHeight = useDiscoveryStore((state) => state.setHeaderHeight);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.stage}>
        <View style={styles.mapLayer}>
          <DiscoveryLeafletMap />
        </View>
        <View style={styles.chrome} pointerEvents="box-none">
          <View
            pointerEvents="box-none"
            onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
          >
            <TopFilterHeader />
          </View>
          <View style={styles.chromeGap} pointerEvents="none" />
          <EventCardList />
          <BottomNavBar />
        </View>
      </View>
      <DropPointSheet />
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
  },
  mapLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  chrome: {
    flex: 1,
  },
  chromeGap: {
    flex: 1,
  },
});
