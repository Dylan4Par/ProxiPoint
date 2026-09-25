import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TopFilterHeader } from '../components/discovery/TopFilterHeader';
import { DiscoveryMapCanvas } from '../components/discovery/DiscoveryMapCanvas';
import { EventCardList } from '../components/discovery/EventCardList';
import { BottomNavBar } from '../components/discovery/BottomNavBar';

export const DiscoverScreen: React.FC = () => {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopFilterHeader />
      <DiscoveryMapCanvas />
      <EventCardList />
      <BottomNavBar />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1120',
  },
});
