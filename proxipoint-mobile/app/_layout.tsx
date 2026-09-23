import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import '../src/tasks/backgroundLocation';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#070b12' } }} />
    </>
  );
}
