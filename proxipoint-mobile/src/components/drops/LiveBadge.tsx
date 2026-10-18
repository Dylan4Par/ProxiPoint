import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Pulsing "LIVE" badge: the outline glow breathes and a ring ripples out from the dot.
 * Holds still (a steady glow) when the system "Reduce motion" setting is on.
 */
export const LiveBadge: React.FC<{ label?: string; testID?: string }> = ({ label = 'LIVE', testID }) => {
  const styles = useThemedStyles(createStyles);
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduced(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduced) {
      pulse.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });

  return (
    <View style={styles.badge} accessibilityLabel="Live now" testID={testID}>
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
      />
      <View style={styles.dotWrap}>
        {reduced ? null : (
          <Animated.View style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
        )}
        <View style={styles.dot} />
      </View>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
};

/** Still "ENDED" badge for Points that are over (My Drops → Past). */
export const EndedBadge: React.FC<{ label?: string; testID?: string }> = ({ label = 'ENDED', testID }) => {
  const styles = useThemedStyles(createStyles);
  const { mode } = useTheme();
  return (
    <View style={[styles.ended, mode === 'light' && styles.endedLight]} accessibilityLabel="Ended" testID={testID}>
      <View style={styles.endedDot} />
      <Text style={styles.endedText}>{label}</Text>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
      backgroundColor: 'rgba(52, 211, 153, 0.14)',
    },
    glow: {
      position: 'absolute',
      top: -2,
      left: -2,
      right: -2,
      bottom: -2,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: c.green,
      backgroundColor: 'rgba(52, 211, 153, 0.12)',
      shadowColor: c.green,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 8,
    },
    dotWrap: {
      width: 8,
      height: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ring: {
      position: 'absolute',
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: c.green,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.green,
    },
    text: {
      color: c.green,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
    ended: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: 'rgba(248, 113, 113, 0.6)',
      backgroundColor: 'rgba(248, 113, 113, 0.12)',
    },
    endedLight: {
      borderColor: 'rgba(220, 38, 38, 0.5)',
      backgroundColor: 'rgba(220, 38, 38, 0.08)',
    },
    endedDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.red,
    },
    endedText: {
      color: c.red,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
  });
