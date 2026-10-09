import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppearanceStore } from '../src/stores/useAppearanceStore';
import '../src/tasks/backgroundLocation';

export default function RootLayout() {
  const colors = useAppearanceStore((s) => s.colors);
  return (
    <>
      <StatusBar style={colors.statusBar === 'dark-content' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.screen } }} />
    </>
  );
}
