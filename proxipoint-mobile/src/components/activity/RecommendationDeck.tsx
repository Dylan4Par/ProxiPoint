import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, Sparkles, Zap } from 'lucide-react-native';
import { CategoryBadge } from '../discovery/CategoryBadge';
import { LiveBadge } from '../drops/LiveBadge';
import type { DeckMode, PriorityPick } from '../../lib/recommend';
import { activeBoost, formatTimeLeft } from '../../lib/boost';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const GOLD = '#f59e0b';
/** Cards in the deck. */
const MAX_CARDS = 6;
/** Auto-advance every 5 seconds. */
const ROTATE_MS = 5000;

/** Stable 0–1 number for a card, different for every visit (seed). */
function shuffleKey(seed: number, id: string): number {
  let h = Math.floor(seed * 2147483647) ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return (h >>> 0) / 4294967296;
}
/** Card height without the reason chips, and with them (only when some card has any). */
const CARD_HEIGHT = 170;
const CARD_HEIGHT_WITH_REASONS = 206;

/** Live / start time already show as the badge under the title, so they aren't repeated as chips. */
const extraReasons = (pick: PriorityPick) =>
  pick.reasons.filter((reason) => reason !== 'Live now' && reason !== pick.node.status).slice(0, 3);

/**
 * Channels → Feed → RECOMMENDATIONS: a stack of picks that turns to the next card every 5 seconds,
 * in a new random order each time you open Activity. ‹ › flip by hand (the timer restarts after a flip), holding a card pauses it, and
 * it stays still when the phone's Reduce motion setting is on.
 */
export const RecommendationDeck: React.FC<{
  picks: PriorityPick[];
  /** 'boosted' = only boosted Points; 'popular' = most people going (when nothing is boosted). */
  mode?: DeckMode;
  onOpenPoint: (id: string) => void;
  onToggleRsvp: (id: string) => void;
}> = ({ picks, mode = 'boosted', onOpenPoint, onToggleRsvp }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // Shuffled once per visit to the Feed (this deck remounts each time), and kept in that order
  // while you're here, even as the list refreshes.
  const [seed] = useState(() => Math.random());
  const cards = picks
    .slice(0, MAX_CARDS)
    .map((pick) => ({ pick, key: shuffleKey(seed, pick.node.id) }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.pick);
  const count = cards.length;
  const withReasons = cards.some((pick) => extraReasons(pick).length > 0);
  const cardHeight = withReasons ? CARD_HEIGHT_WITH_REASONS : CARD_HEIGHT;

  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const slide = useRef(new Animated.Value(0)).current; // -1 … 0 … 1
  const animating = useRef(false);
  const [timerKey, setTimerKey] = useState(0); // bump to restart the 5s timer

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => mounted && setReducedMotion(on));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Keep the index valid when the list changes.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const go = useCallback(
    (step: 1 | -1) => {
      if (count < 2 || animating.current) return;
      if (reducedMotion) {
        setIndex((i) => (i + step + count) % count);
        return;
      }
      animating.current = true;
      // Out to one side, swap, in from the other.
      Animated.timing(slide, {
        toValue: -step,
        duration: 170,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setIndex((i) => (i + step + count) % count);
        slide.setValue(step);
        Animated.timing(slide, {
          toValue: 0,
          duration: 230,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          animating.current = false;
        });
      });
    },
    [count, reducedMotion, slide],
  );

  // Auto-rotate.
  useEffect(() => {
    if (count < 2 || held || reducedMotion) return;
    const timer = setInterval(() => go(1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [count, held, reducedMotion, go, timerKey]);

  const flip = (step: 1 | -1) => {
    go(step);
    setTimerKey((k) => k + 1);
  };

  // Swipe the card left / right to move through the picks (the dots show where you are).
  // Only claims clearly sideways drags, so scrolling the page up and down still works.
  const flipRef = useRef(flip);
  flipRef.current = flip;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -40) flipRef.current(1);
        else if (g.dx >= 40) flipRef.current(-1);
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current;

  if (count === 0) {
    return (
      <View style={[styles.card, styles.emptyCard]} testID="activity-recs-empty">
        <Sparkles size={18} color={c.textMuted} strokeWidth={2} />
        <Text style={styles.emptyText}>Nothing coming up nearby right now. Check back soon.</Text>
      </View>
    );
  }

  const pick = cards[Math.min(index, count - 1)];
  const { node } = pick;
  const where = node.locationPrivacy?.regionName ? `Somewhere in ${node.locationPrivacy.regionName}` : node.venue ?? '';
  const mainTag = (Array.isArray(node.tags) && node.tags[0]) || node.tag || '';
  const boost = pick.boosted ? activeBoost(node.id) : null;
  const kicker =
    mode === 'boosted'
      ? `BOOSTED · ${index + 1} OF ${count}`
      : `POPULAR · ${index + 1} OF ${count}`;

  const frontStyle = {
    opacity: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
    transform: [
      { translateX: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [-46, 0, 46] }) },
      { rotate: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-3deg', '0deg', '3deg'] }) },
    ],
  };

  return (
    <View testID="activity-recs">
      <View style={[styles.stack, { height: cardHeight + 14 }]}>
        {/* The cards "behind", peeking out under the front one */}
        {count > 2 ? <View style={[styles.card, styles.ghost, styles.ghostBack, { height: cardHeight }]} /> : null}
        {count > 1 ? <View style={[styles.card, styles.ghost, styles.ghostMid, { height: cardHeight }]} /> : null}

        <Animated.View style={[styles.front, frontStyle]} {...(count > 1 ? swipe.panHandlers : {})}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => onOpenPoint(node.id)}
            onPressIn={() => setHeld(true)}
            onPressOut={() => setHeld(false)}
            style={[styles.card, styles.frontCard, { height: cardHeight }, pick.boosted && styles.cardBoosted]}
            accessibilityRole="button"
            accessibilityLabel={`Recommendation ${index + 1} of ${count}: ${node.title}. ${pick.reasons.join(', ')}`}
            accessibilityHint="Opens the Point on Discover"
            testID={`activity-rec-${node.id}`}
          >
            <View style={styles.main}>
              <CategoryBadge tag={mainTag} title={node.title} photoUri={node.coverPhotoUri ?? null} size={56} />
              <View style={styles.copy}>
                <View style={styles.kickerRow}>
                  <Text style={[styles.kicker, mode === 'boosted' && styles.kickerBoosted]}>{kicker}</Text>
                  {boost ? (
                    <View style={styles.boostChip}>
                      <Zap size={10} color={GOLD} fill={GOLD} strokeWidth={2} />
                      <Text style={styles.boostText}>{formatTimeLeft(boost.endsAt)} LEFT</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {node.title}
                </Text>
                {where ? (
                  <Text style={styles.where} numberOfLines={1}>
                    {where}
                  </Text>
                ) : null}
                {pick.live ? (
                  <LiveBadge label="LIVE NOW" />
                ) : node.status ? (
                  <Text style={styles.when}>{node.status}</Text>
                ) : null}
              </View>
            </View>

            {extraReasons(pick).length ? (
            <View style={styles.reasons}>
              {extraReasons(pick).map((reason) => (
                <View key={reason} style={styles.reason}>
                  <Text style={styles.reasonText} numberOfLines={1}>
                    {reason}
                  </Text>
                </View>
              ))}
            </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => onOpenPoint(node.id)}
                accessibilityRole="button"
                testID="activity-rec-view"
              >
                <Text style={styles.viewText}>VIEW POINT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rsvpBtn, node.isRsvpd && styles.rsvpBtnOn]}
                onPress={() => {
                  onToggleRsvp(node.id);
                  setTimerKey((k) => k + 1); // give them a moment before it turns
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: Boolean(node.isRsvpd) }}
                testID="activity-rec-rsvp"
              >
                {node.isRsvpd ? <Check size={15} color={c.accent} strokeWidth={3} /> : null}
                <Text style={styles.rsvpText}>{node.isRsvpd ? 'GOING' : 'RSVP'}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {count > 1 ? (
        <View
          style={styles.controls}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={`Recommendation ${index + 1} of ${count}. Swipe the card for more.`}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => flip(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          testID="activity-recs-dots"
        >
          <View style={styles.dots}>
            {cards.map((card, i) => (
              <View
                key={card.node.id}
                style={[styles.dot, i === index && styles.dotOn, i === index && card.boosted && styles.dotBoosted]}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    stack: {},
    card: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: c.accentBorder,
    },
    // Peeking cards: narrower and lower, so the stack reads as a deck.
    ghost: { position: 'absolute', left: 0, right: 0 },
    ghostMid: { top: 7, transform: [{ scaleX: 0.95 }], opacity: 0.7, borderColor: c.border },
    ghostBack: { top: 14, transform: [{ scaleX: 0.9 }], opacity: 0.45, borderColor: c.border },
    front: { position: 'absolute', top: 0, left: 0, right: 0 },
    frontCard: { padding: 14, gap: 12, justifyContent: 'space-between' },
    cardBoosted: { borderColor: GOLD },
    emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: c.border },
    emptyText: { flex: 1, color: c.textMuted, fontSize: 13, lineHeight: 18 },
    main: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copy: { flex: 1, gap: 3, alignItems: 'flex-start' },
    kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    kicker: { color: c.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
    kickerBoosted: { color: GOLD },
    boostChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      backgroundColor: 'rgba(245, 158, 11, 0.14)',
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.55)',
    },
    boostText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
    title: { color: c.text, fontSize: 18, fontWeight: '800', alignSelf: 'stretch' },
    where: { color: c.textMuted, fontSize: 12, alignSelf: 'stretch' },
    when: { color: c.accentSoft, fontSize: 12, fontWeight: '700' },
    reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxHeight: 56, overflow: 'hidden' },
    reason: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: c.base,
      borderWidth: 1,
      borderColor: c.border,
    },
    reasonText: { color: c.textSecondary, fontSize: 11, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 10 },
    viewBtn: {
      flex: 1,
      minHeight: 42,
      borderRadius: 21,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
    rsvpBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 42,
      paddingHorizontal: 20,
      borderRadius: 21,
      borderWidth: 1.5,
      borderColor: c.accent,
    },
    rsvpBtnOn: { backgroundColor: c.accentTint },
    rsvpText: { color: c.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1.2 },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, minHeight: 20 },
    dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
    dotOn: { width: 18, backgroundColor: c.accent },
    dotBoosted: { backgroundColor: GOLD },
  });
