import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { BRAND_CYAN, BRAND_NAVY, BRAND_TILE, PIN_TIP, ProxiPointLogo } from './ProxiPointLogo';

/**
 * Fills the parent edge to edge. Written out by hand because StyleSheet.absoluteFillObject
 * was removed in newer React Native, which silently drops the positioning.
 */
const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;

const LOGO = 180; // tile size on screen
const TILE_RADIUS = LOGO * (27 / 120);
const RING = 28; // ripple ring size before it grows

/**
 * Launch animation, the same "Point landing" as the Drop Point sheet:
 *   1. a cyan pin drops in, squashes and bounces, and its shadow lands  (0 – 0.95 s)
 *   2. two ripples spread from the tip                                   (0.52 – 1.55 s)
 *   3. the app-icon tile grows behind it and the pin turns navy           (1.15 – 1.55 s)
 *   4. "ProxiPoint" rises in underneath, then the "Powered by" note        (1.5 – 1.85 s)
 *   5. a short hold, then the whole screen fades out and onFinish runs    (~2.9 s)
 * With Reduce Motion on, it shows the finished logo for a moment and fades.
 */
export const AnimatedSplash: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const dropY = useRef(new Animated.Value(-170)).current;
  const scaleX = useRef(new Animated.Value(1)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const pinOpacity = useRef(new Animated.Value(0)).current;
  const shadow = useRef(new Animated.Value(0)).current;
  const ripple1 = useRef(new Animated.Value(0)).current;
  const ripple2 = useRef(new Animated.Value(0)).current;
  const tile = useRef(new Animated.Value(0)).current; // 0 = cyan pin alone, 1 = finished icon
  const word = useRef(new Animated.Value(0)).current;
  const screen = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    // Fade out once, then hand over to the app. Runs even if the fade itself gets interrupted.
    const finish = () => {
      if (finished) return;
      finished = true;
      Animated.timing(screen, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => {
        if (!cancelled) onFinish();
      });
      setTimeout(() => {
        if (!cancelled) onFinish();
      }, 600);
    };
    // Safety net: never stay on screen longer than this, even if an animation is cut short
    // (e.g. the app was backgrounded, or a hot reload happened mid-animation).
    const safety = setTimeout(finish, 4500);

    const t = (value: Animated.Value, toValue: number, duration: number, easing = Easing.out(Easing.quad)) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });

    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        [dropY, ripple1, ripple2].forEach((v) => v.setValue(v === dropY ? 0 : 1));
        [pinOpacity, shadow, tile, word].forEach((v) => v.setValue(1));
        setTimeout(finish, 900);
        return;
      }

      Animated.sequence([
        Animated.parallel([
          // Fall
          t(dropY, 0, 520, Easing.in(Easing.quad)),
          t(pinOpacity, 1, 120),
          t(shadow, 1, 520),
        ]),
        // Squash on landing
        Animated.parallel([t(scaleX, 1.25, 85), t(scaleY, 0.72, 85)]),
        // Bounce up
        Animated.parallel([t(dropY, -12, 135), t(scaleX, 0.94, 135), t(scaleY, 1.06, 135)]),
        // Land again
        Animated.parallel([t(dropY, 0, 115, Easing.in(Easing.quad)), t(scaleX, 1.06, 115), t(scaleY, 0.94, 115)]),
        // Settle
        Animated.parallel([t(scaleX, 1, 95), t(scaleY, 1, 95)]),
        Animated.delay(150),
        // The icon forms: tile grows in behind, pin turns navy
        t(tile, 1, 400, Easing.out(Easing.back(1.4))),
        // Name rises in
        t(word, 1, 350, Easing.out(Easing.cubic)),
        Animated.delay(700),
      ]).start(() => {
        // Finish whether the sequence completed or was interrupted.
        if (!cancelled) finish();
      });

      // Ripples from the tip as the pin lands (same timing as the in-app drop).
      Animated.sequence([Animated.delay(520), t(ripple1, 1, 850)]).start();
      Animated.sequence([Animated.delay(700), t(ripple2, 1, 850)]).start();
    });

    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Squash/stretch around the tip (bottom) rather than the middle.
  const pinHeight = LOGO * (85 / 120);
  const squashShift = scaleY.interpolate({
    inputRange: [0.72, 1, 1.06],
    outputRange: [pinHeight * 0.14, 0, -pinHeight * 0.03],
    extrapolate: 'clamp',
  });

  const ring = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 0.95, 0] }),
    transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 5] }) }],
  });

  const tipLeft = LOGO * PIN_TIP.x;
  const tipTop = LOGO * PIN_TIP.y;

  return (
    <Animated.View style={[styles.screen, { opacity: screen }]} pointerEvents="none" accessibilityLabel="ProxiPoint">
      <View style={styles.stage}>
        {/* Tile grows in behind the pin */}
        <Animated.View
          style={[
            styles.tile,
            {
              opacity: tile,
              transform: [{ scale: tile.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
            },
          ]}
        />

        {/* Ripples and shadow at the pin's tip (fade away once the tile covers them) */}
        <Animated.View style={[styles.ring, { left: tipLeft - RING / 2, top: tipTop - RING / 2 }, ring(ripple1)]} />
        <Animated.View style={[styles.ring, { left: tipLeft - RING / 2, top: tipTop - RING / 2 }, ring(ripple2)]} />
        <Animated.View
          style={[
            styles.shadow,
            {
              left: tipLeft - 14,
              top: tipTop - 4,
              opacity: Animated.multiply(
                shadow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }),
                tile.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              ),
              transform: [{ scale: shadow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
            },
          ]}
        />

        {/* The pin: cyan while it drops (like the in-app drop), navy once the tile forms */}
        <Animated.View
          style={[
            ABS_FILL,
            {
              opacity: pinOpacity,
              transform: [
                { translateY: Animated.add(dropY, squashShift) },
                { scaleX },
                { scaleY },
              ],
            },
          ]}
        >
          <Animated.View style={[ABS_FILL, { opacity: tile.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
            <ProxiPointLogo size={LOGO} variant="pin" pinColor={BRAND_CYAN} letterColor={BRAND_NAVY} />
          </Animated.View>
          <Animated.View style={[ABS_FILL, { opacity: tile }]}>
            <ProxiPointLogo size={LOGO} variant="pin" pinColor={BRAND_NAVY} letterColor={BRAND_TILE} />
          </Animated.View>
        </Animated.View>
      </View>

      <Animated.Text
        style={[
          styles.word,
          {
            opacity: word,
            transform: [{ translateY: word.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          },
        ]}
      >
        ProxiPoint
      </Animated.Text>

      {/* Credit line at the bottom of the screen, fading in just after the name. */}
      <Animated.Text
        style={[styles.poweredBy, { opacity: word.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }) }]}
        accessibilityLabel="Powered by Call Sign Solutions Cloud Services"
      >
        Powered by <Text style={styles.poweredByName}>Call Sign Solutions™</Text> Cloud Services
      </Animated.Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  screen: {
    ...ABS_FILL,
    zIndex: 1000,
    backgroundColor: BRAND_NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: { width: LOGO, height: LOGO },
  tile: {
    ...ABS_FILL,
    borderRadius: TILE_RADIUS,
    backgroundColor: BRAND_TILE,
  },
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: BRAND_CYAN,
  },
  shadow: {
    position: 'absolute',
    width: 28,
    height: 8,
    borderRadius: 14,
    backgroundColor: '#000',
  },
  poweredBy: {
    position: 'absolute',
    left: 24,
    right: 24,
    // Clear of the Android gesture bar / iPhone home indicator.
    bottom: 48,
    textAlign: 'center',
    color: '#64748b',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  poweredByName: {
    color: '#94a3b8',
    fontWeight: '700',
  },
  word: {
    marginTop: 26,
    color: '#f8fafc',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
