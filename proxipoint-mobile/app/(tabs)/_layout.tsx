import React from 'react';
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' }, // Hide default tab bar in favor of custom BottomNavBar
      }}
    >
      <Tabs.Screen name="index" />
    </Tabs>
  );
}
