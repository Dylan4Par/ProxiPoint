import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { maskPath, padRect, placeCard, type Rect, type TourStep } from '../../lib/tour';
import { measureTourTarget } from './tourTargets';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const SPOT_PAD = 6;
/** Spelled out: StyleSheet.absoluteFill(Object) isn't reliable in newer React Native. */
const ABS_FILL = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } as const;
const CARD_ESTIMATE = 220;

/**
 * Spotlight tour: dims the screen, cuts a rounded hole around each of the step's targets
 * (with a pulsing cyan ring), and shows a card with the step's text and Back / Next / Skip.
 * Touches outside the card are blocked so the tour can't be left half-way by accident.
 */
export const TourOverlay: React.FC<{
  steps: TourStep[];
  /** Current step, or null when the tour isn't showing. */
  index: number | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}> = ({ steps, index, onNext, onBack, onSkip }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const root = useRef<View>(null);
  const [screen, setScreen] = useState({ width: 0, height: 0 });
  const [holes, setHoles] = useState<Rect[]>([]);
  const [cardHeight, setCardHeight] = useState(CARD_ESTIMATE);
  const [reduced, setReduced] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const step = index != null ? steps[index] : null;

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => mounted && setReduced(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Find the step's targets. The Create Event sheet slides in, so wait for it and retry a few times.
  useEffect(() => {
    if (!step || screen.width === 0) return;
    let cancelled = false;
    setHoles([]);
    fade.setValue(0);
    const measure = async (attempt: number) => {
      const origin = await new Promise<{ x: number; y: number }>((resolve) => {
        if (!root.current) return resolve({ x: 0, y: 0 });
        root.current.measureInWindow((x, y) => resolve({ x, y }));
      });
      const rects = await Promise.all(step.targets.map(measureTourTarget));
      if (cancelled) return;
      const found = rects.filter((r): r is Rect => r != null);
      if (found.length < step.targets.length && attempt < 8) {
        setTimeout(() => void measure(attempt + 1), 150);
        return;
      }
      setHoles(found.map((r) => padRect({ ...r, x: r.x - origin.x, y: r.y - origin.y }, SPOT_PAD, screen)));
      Animated.timing(fade, {
        toValue: 1,
        duration: reduced ? 0 : 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    };
    const timer = setTimeout(() => void measure(0), step.needsCreateSheet ? 420 : 140);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [step, screen, fade, reduced]);

  // Pulsing ring around the spotlight (still with Reduce motion).
  useEffect(() => {
    if (!step || reduced) {
      pulse.setValue(0.5);
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
  }, [step, reduced, pulse]);

  // Android back: previous step, or skip from the first one.
  useEffect(() => {
    if (index == null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) onBack();
      else onSkip();
      return true;
    });
    return () => sub.remove();
  }, [index, onBack, onSkip]);

  if (!step || index == null) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setScreen((s) => (s.width === width && s.height === height ? s : { width, height }));
  };
  const spot = holes.length
    ? holes.reduce((u, h) => {
        const x = Math.min(u.x, h.x);
        const y = Math.min(u.y, h.y);
        return {
          x,
          y,
          width: Math.max(u.x + u.width, h.x + h.width) - x,
          height: Math.max(u.y + u.height, h.y + h.height) - y,
        };
      })
    : null;
  const { top } = placeCard(spot, cardHeight, screen.height);
  const isLast = index === steps.length - 1;
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });

  return (
    <View
      ref={root}
      collapsable={false}
      style={ABS_FILL}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      accessibilityViewIsModal
      testID="tour-overlay"
    >
      {screen.width > 0 ? (
        <Svg width={screen.width} height={screen.height} style={ABS_FILL} pointerEvents="none">
          <Path d={maskPath(screen, holes)} fill="rgba(2, 6, 23, 0.72)" fillRule="evenodd" />
        </Svg>
      ) : null}

      {holes.map((hole, i) => (
        <Animated.View
          key={`${step.id}-${i}`}
          pointerEvents="none"
          style={[
            styles.ring,
            {
              left: hole.x,
              top: hole.y,
              width: hole.width,
              height: hole.height,
              borderRadius: Math.min(14, hole.width / 2, hole.height / 2),
              opacity: Animated.multiply(fade, ringOpacity),
            },
          ]}
        />
      ))}

      <Animated.View
        style={[styles.card, { top, opacity: fade }]}
        onLayout={(event) => setCardHeight(Math.round(event.nativeEvent.layout.height))}
        accessibilityLiveRegion="polite"
        testID={`tour-step-${step.id}`}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.stepLabel}>{step.label}</Text>
          <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <View key={s.id} style={[styles.dot, i === index && styles.dotOn, i < index && styles.dotDone]} />
            ))}
          </View>
        </View>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
        <View style={styles.actions}>
          {isLast ? (
            <View />
          ) : (
            <TouchableOpacity onPress={onSkip} hitSlop={10} accessibilityRole="button" testID="tour-skip">
              <Text style={styles.skip}>Skip tour</Text>
            </TouchableOpacity>
          )}
          <View style={styles.navBtns}>
            {index > 0 ? (
              <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button" testID="tour-back">
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.nextBtn} onPress={onNext} accessibilityRole="button" testID="tour-next">
              <Text style={[styles.nextText, { color: c.onAccent }]}>{isLast ? 'Let’s go' : 'Next'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    ring: {
      position: 'absolute',
      borderWidth: 2,
      borderColor: c.accent,
      shadowColor: c.accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.9,
      shadowRadius: 10,
    },
    card: {
      position: 'absolute',
      left: 16,
      right: 16,
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.accent,
      padding: 16,
      gap: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 12,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    stepLabel: { color: c.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
    dots: { flexDirection: 'row', gap: 5 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
    dotOn: { width: 18, backgroundColor: c.accent },
    dotDone: { backgroundColor: c.accentBorder },
    title: { color: c.text, fontSize: 18, fontWeight: '800' },
    body: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
    skip: { color: c.textFaint, fontSize: 13, fontWeight: '700' },
    navBtns: { flexDirection: 'row', gap: 8 },
    backBtn: {
      paddingHorizontal: 16,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backText: { color: c.accent, fontSize: 14, fontWeight: '800' },
    nextBtn: {
      paddingHorizontal: 22,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nextText: { fontSize: 14, fontWeight: '800' },
  });
