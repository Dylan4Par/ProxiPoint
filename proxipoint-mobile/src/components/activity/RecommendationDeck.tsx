import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Car, Check, ChevronLeft, ChevronRight, Flame, PersonStanding, Sparkles, Zap } from 'lucide-react-native';
import { CategoryBadge } from '../discovery/CategoryBadge';
import { LiveBadge } from '../drops/LiveBadge';
import type { DeckMode, PriorityPick } from '../../lib/recommend';
import { distanceLabel, pointTiming } from '../../lib/pointCard';
import { formatClock } from '../../lib/calendarRange';
import { formatCount } from '../../lib/discoverFeed';
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
const CARD_HEIGHT = 162;
const ARROW_SIZE = 30;

/**
 * Discover → FEATURED RECOMMENDATIONS: a stack of picks that turns to the next card every 5 seconds,
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
  const cardHeight = CARD_HEIGHT;

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
  const featured = mode === 'boosted' && pick.boosted;
  const timing = pick.live ? null : pointTiming(node);
  const endsAt = pick.live && node.endsAt ? new Date(node.endsAt) : null;
  const distance = distanceLabel(node.distanceMeters, node.eta)?.replace(' • ', ' · ') ?? null;
  const TravelIcon = node.etaMode === 'drive' ? Car : PersonStanding;
  const going = node.attendeeCount && node.attendeeCount > 0 ? ` (${formatCount(node.attendeeCount)})` : '';

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
            {/* Icon tile · #tag · venue / title, with the Featured (or Popular) badge on the right. */}
            <View style={styles.main}>
              <CategoryBadge tag={mainTag} title={node.title} photoUri={node.coverPhotoUri ?? null} size={44} />
              <View style={styles.copy}>
                <Text style={styles.tagLine} numberOfLines={1}>
                  {mainTag ? <Text style={styles.tag}>{mainTag}</Text> : null}
                  {mainTag && where ? <Text style={styles.where}>{'  ·  '}</Text> : null}
                  {where ? <Text style={styles.where}>{where}</Text> : null}
                </Text>
                <Text style={styles.title} numberOfLines={1}>
                  {node.title}
                </Text>
              </View>
              {featured ? (
                <View style={styles.badge}>
                  <Zap size={11} color={GOLD} fill={GOLD} strokeWidth={2} />
                  <Text style={styles.badgeText}>FEATURED</Text>
                </View>
              ) : mode === 'popular' ? (
                <View style={[styles.badge, styles.badgePopular]}>
                  <Flame size={11} color={c.accent} strokeWidth={2.5} />
                  <Text style={[styles.badgeText, styles.badgeTextPopular]}>POPULAR</Text>
                </View>
              ) : null}
            </View>

            {/* LIVE NOW · Ends 9:30 PM · 1.4 mi · 6 min drive */}
            <View style={styles.meta}>
              {pick.live ? (
                <LiveBadge label="LIVE NOW" />
              ) : timing ? (
                <View style={styles.timePill}>
                  <Text style={styles.timeText}>{timing.label}</Text>
                </View>
              ) : null}
              {endsAt ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaText}>Ends {formatClock(endsAt)}</Text>
                </>
              ) : null}
              {distance ? (
                <>
                  <Text style={styles.metaDot}>·</Text>
                  <TravelIcon size={13} color={c.textMuted} strokeWidth={2.25} />
                  <Text style={[styles.metaText, styles.metaShrink]} numberOfLines={1}>
                    {distance}
                  </Text>
                </>
              ) : null}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => onOpenPoint(node.id)}
                accessibilityRole="button"
                testID="activity-rec-view"
              >
                <Text style={styles.viewText}>VIEW DROP</Text>
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
                <Check size={15} color={node.isRsvpd ? c.accent : c.onAccent} strokeWidth={3} />
                <Text style={[styles.rsvpText, node.isRsvpd && styles.rsvpTextOn]}>
                  {node.isRsvpd ? 'GOING' : 'RSVP'}
                  {going}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Animated.View>
        {/* Arrows on the card's sides: step back / forward by hand (also restarts the 5s timer). */}
        {count > 1 ? (
          <>
            <TouchableOpacity
              style={[styles.arrow, styles.arrowLeft, { top: cardHeight / 2 - ARROW_SIZE / 2 }]}
              onPress={() => flip(-1)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Previous recommendation"
              testID="recs-prev"
            >
              <ChevronLeft size={18} color={c.accent} strokeWidth={2.75} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.arrow, styles.arrowRight, { top: cardHeight / 2 - ARROW_SIZE / 2 }]}
              onPress={() => flip(1)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Next recommendation"
              testID="recs-next"
            >
              <ChevronRight size={18} color={c.accent} strokeWidth={2.75} />
            </TouchableOpacity>
          </>
        ) : null}
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
    // Small round arrows straddling the card's left and right edges.
    arrow: {
      position: 'absolute',
      zIndex: 5,
      width: ARROW_SIZE,
      height: ARROW_SIZE,
      borderRadius: ARROW_SIZE / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.accentBorder,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 4,
    },
    arrowLeft: { left: -12 },
    arrowRight: { right: -12 },
    ghostMid: { top: 7, transform: [{ scaleX: 0.95 }], opacity: 0.7, borderColor: c.border },
    ghostBack: { top: 14, transform: [{ scaleX: 0.9 }], opacity: 0.45, borderColor: c.border },
    front: { position: 'absolute', top: 0, left: 0, right: 0 },
    frontCard: { padding: 14, gap: 12, justifyContent: 'space-between' },
    cardBoosted: { borderColor: 'rgba(245, 158, 11, 0.7)' },
    emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1, borderColor: c.border },
    emptyText: { flex: 1, color: c.textMuted, fontSize: 13, lineHeight: 18 },
    main: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copy: { flex: 1, gap: 2 },
    tagLine: { fontSize: 12.5 },
    tag: { color: c.accent, fontWeight: '800' },
    where: { color: c.textMuted, fontWeight: '600' },
    title: { color: c.text, fontSize: 17, fontWeight: '800' },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.6)',
    },
    badgeText: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
    badgePopular: { backgroundColor: c.accentTint, borderColor: c.accentBorder },
    badgeTextPopular: { color: c.accent },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
    metaDot: { color: c.textFaint, fontSize: 12, fontWeight: '800' },
    metaText: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    metaShrink: { flexShrink: 1 },
    timePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: c.accentTint,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    timeText: { color: c.accent, fontSize: 11, fontWeight: '800' },
    actions: { flexDirection: 'row', gap: 10 },
    // View Drop: outlined; RSVP: filled (the main action).
    viewBtn: {
      flex: 1,
      minHeight: 42,
      borderRadius: 12,
      backgroundColor: c.base,
      borderWidth: 1,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
    rsvpBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 42,
      borderRadius: 12,
      backgroundColor: c.accent,
      borderWidth: 1,
      borderColor: c.accent,
    },
    rsvpBtnOn: { backgroundColor: c.accentTint, borderColor: c.accentBorder },
    rsvpText: { color: c.onAccent, fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
    rsvpTextOn: { color: c.accent },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6, minHeight: 12 },
    dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.borderStrong },
    dotOn: { width: 18, backgroundColor: c.accent },
    dotBoosted: { backgroundColor: GOLD },
  });
