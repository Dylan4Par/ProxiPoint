import { Tabs } from 'expo-router';
import { RadarSessionProvider } from '../../src/hooks/RadarSession';

export default function TabLayout() {
  return (
    <RadarSessionProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#070b12',
            borderTopColor: '#1e293b',
          },
          tabBarActiveTintColor: '#38bdf8',
          tabBarInactiveTintColor: '#64748b',
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Radar' }} />
        <Tabs.Screen name="two" options={{ title: 'Alerts' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    </RadarSessionProvider>
  );
}
