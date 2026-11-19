import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import '../src/tasks/backgroundLocation';
import { AnimatedSplash } from '../src/components/brand/AnimatedSplash';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

/**
 * Fills the parent edge to edge. Written out by hand because StyleSheet.absoluteFillObject
 * was removed in newer React Native, which silently drops the positioning.
 */
const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Status bar icons and screen background follow day / night mode. */
function ThemedStack() {
  const { mode, colors } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.base } }} />
    </>
  );
}

export default function RootLayout() {
  // The launch animation plays once on top of the app, then removes itself.
  const [splashDone, setSplashDone] = useState(false);

  return (
    <ThemeProvider>
      {/* The app always fills the whole screen... */}
      <View style={styles.fill}>
        <ThemedStack />
        {/* ...and the launch animation floats on top of it (never beside or under it). */}
        {!splashDone ? (
          <View style={styles.splashLayer} pointerEvents="none">
            <AnimatedSplash onFinish={() => setSplashDone(true)} />
          </View>
        ) : null}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  splashLayer: { ...ABS_FILL, zIndex: 1000, elevation: 1000 },
});
