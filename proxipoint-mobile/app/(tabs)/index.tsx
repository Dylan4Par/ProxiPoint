import React, { useEffect } from 'react';
import { View } from 'react-native';
import { DiscoverScreen } from '../../src/screens/DiscoverScreen';
import { AuthFlow } from '../../src/screens/auth/AuthFlow';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useColors } from '../../src/theme/ThemeContext';

/**
 * Signed in and onboarded: Discover. Otherwise: welcome / sign in / sign up / onboarding.
 * Discover (and its location tracking) only mounts once someone is signed in.
 */
export default function TabOneScreen() {
  const status = useAuthStore((s) => s.status);
  const hydrate = useAuthStore((s) => s.hydrate);
  const colors = useColors();
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // The launch animation covers this brief read of the saved session.
  if (status === 'loading') return <View style={{ flex: 1, backgroundColor: colors.base }} />;
  if (status !== 'signedIn') return <AuthFlow />;
  return <DiscoverScreen />;
}
