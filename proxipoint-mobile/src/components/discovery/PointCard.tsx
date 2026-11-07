import React, { useEffect, useId, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Car, Check, PersonStanding, Zap } from 'lucide-react-native';
import { distanceLabel, pointTiming, showsTravelTime, type TimingKind } from '../../lib/pointCard';
import { formatDistanceWordsIn, getUnits, useUnits } from '../../lib/units';
import { AGGREGATED_TAG, isAggregated } from '../../lib/aggregated';
import type { DiscoveryNode } from '../../stores/useDiscoveryStore';
import type { ExtraPillKind } from '../../lib/cardExtraPill';
import { nearestCityLabel } from '../../lib/mapArea';
import { CITY_LIST } from '../../lib/places';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * The Point card used on Discover and the Explore Map list:
 *
 *   photo▓▒░ #Tag  [⚡]                                City
 *   photo▓▒░ Title
 *   photo▓▒░ Venue
 *   photo▓▒░ [● LIVE NOW] [540m • 7 min walk 🚶]    [✓ RSVP]
 *
 * Photo: the event's own cover photo down the card's left edge, at full strength with a long, smooth
 * fade to the card's color over its right side. The details start clear of it: no text on the photo.
 * No cover photo = no photo column, and the details start at the card's normal padding.
 *
 * Pills keep fixed light colors in dark mode (like the design) and soft tints in light mode.
 */

/** Width of the photo column on the card's left edge (fixed, so it's the same on every phone). */
const PHOTO_WIDTH = 98;
/**
 * Where the details start when there's a photo. The photo's fade has all but finished by here
 * (about 1% photo at the first letter), so no text sits on the photo itself.
 */
const PHOTO_CONTENT_INSET = 92;
/** Photo strength (the same across the photo, apart from the fade on its left edge). */
const PHOTO_OPACITY = 1;
/** Share of the photo's width, at its right edge, that fades out from PHOTO_OPACITY to 0. */
const PHOTO_FADE = 0.42;
/**
 * Gradient stops for the cover over the photo: even (1 - PHOTO_OPACITY) up to the fade, then an
 * eased ramp to solid, reaching it a little before the edge so no sliver of photo shows there.
 * Eased (smoothstep) rather than straight, so the fade has no visible start line.
 */
const FADE_STOPS: { offset: number; opacity: number }[] = (() => {
  const start = 1 - PHOTO_FADE;
  const end = 0.96;
  const steps = [0, 0.25, 0.5, 0.75, 1];
  return [
    { offset: 0, opacity: 1 - PHOTO_OPACITY },
    ...steps.map((t) => ({
      offset: start + (end - start) * t,
      opacity: 1 - PHOTO_OPACITY + PHOTO_OPACITY * t * t * (3 - 2 * t),
    })),
    { offset: 1, opacity: 1 },
  ];
})();

/** Pill colors per mode. They're fixed (not theme tokens) because the light theme inverts tokens. */
const PILLS = {
  dark: {
    live: { bg: '#bbf7d0', fg: '#14532d', dot: '#16a34a' },
    soon: { bg: '#166534', fg: '#dcfce7', dot: '#86efac' },
    later: { bg: '#1e293b', fg: '#cbd5e1', dot: '#94a3b8' },
    distance: { bg: '#cfe3ff', fg: '#0f2a4a' },
    rsvp: { bg: '#f1f5f9', fg: '#0f172a' },
    boosted: { bg: 'rgba(245, 158, 11, 0.14)', border: '#b45309', fg: '#fbbf24' },
  },
  light: {
    live: { bg: '#dcfce7', fg: '#14532d', dot: '#16a34a' },
    soon: { bg: '#166534', fg: '#f0fdf4', dot: '#86efac' },
    later: { bg: '#e2e8f0', fg: '#334155', dot: '#64748b' },
    distance: { bg: '#dbeafe', fg: '#1e3a8a' },
    rsvp: { bg: '#0f172a', fg: '#ffffff' },
    boosted: { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e' },
  },
} as const;

export const PointCard: React.FC<{
  node: DiscoveryNode;
  onOpen: () => void;
  onToggleRsvp: () => void;
  /** Paid Boost: a small lightning-bolt pill; with onWhyBoosted, tapping it explains why. */
  boosted?: boolean;
  onWhyBoosted?: () => void;
  /** Selected on the map (Explore Map list). */
  selected?: boolean;
  /** Distance to show instead of the distance from you (search: from the searched area). */
  distanceMeters?: number | null;
  now?: number;
  /** Discover: just the distance, in words ("12 miles"), no travel time. */
  distanceOnly?: boolean;
  /**
   * Discover: a third pill (price, New Host or Popular; lib/cardExtraPill), shown only when it
   * fits on the row beside the others without crowding RSVP. Replaces the plain price pill.
   */
  extra?: { kind: ExtraPillKind; label: string } | null;
  testID?: string;
}> = ({ node, onOpen, onToggleRsvp, boosted = false, onWhyBoosted, selected = false, distanceMeters, now, distanceOnly = false, extra, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c, mode } = useTheme();
  const pills = PILLS[mode === 'light' ? 'light' : 'dark'];
  useUnits(); // re-render when Settings switches km / miles
  const tag = node.tags?.[0] ?? node.tag;
  const where = node.locationPrivacy?.regionName ? `In ${node.locationPrivacy.regionName}` : node.venue;
  const timing = pointTiming(node, now);
  // City, top right ("Boulder, CO"); the closest listed city within about 15 mi.
  const city = nearestCityLabel(node, CITY_LIST);
  const distance = distanceOnly
    ? formatDistanceWordsIn(distanceMeters ?? node.distanceMeters, getUnits())
    : distanceLabel(distanceMeters ?? node.distanceMeters, distanceMeters == null ? node.eta : null);
  // The extra pill is laid out (invisible) first; it stays only if its right edge is inside the
  // pills' row, so it never wraps under or pushes against RSVP.
  const [extraFits, setExtraFits] = useState<boolean | null>(null);
  const pillsWidth = useRef(0);
  const extraEdge = useRef(0);
  const extraKey = extra ? `${extra.kind}:${extra.label}` : '';
  useEffect(() => setExtraFits(null), [extraKey]);
  const judgeExtra = () => {
    if (!pillsWidth.current || !extraEdge.current) return;
    setExtraFits(extraEdge.current <= pillsWidth.current + 0.5);
  };
  const TravelIcon = node.etaMode === 'drive' ? Car : PersonStanding;
  const timingColors = timing ? pills[timing.kind as TimingKind] : null;
  const photo = node.coverPhotoLargeUri ?? node.coverPhotoUri ?? null;
  // SVG ids must be plain names; useId gives ":r1:"-style ones.
  const fadeId = `pc-fade-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.card, photo ? styles.cardWithPhoto : null, selected && styles.cardSelected]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[node.title, timing?.label, where, distance, node.facts?.priceLabel, boosted ? 'Boosted' : null].filter(Boolean).join('. ')}
      accessibilityHint="Opens the details"
      testID={testID ?? `point-card-${node.id}`}
    >
      {photo ? (
        // Drawn first, so everything else sits on top. The photo is fully opaque and a gradient
        // in the card's own color covers it: clear over the left half, easing to solid on the right. Same look
        // as fading the photo itself, without an SVG mask (unreliable on some Android versions).
        <View style={styles.photoWrap} pointerEvents="none" testID="point-card-photo">
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
                {FADE_STOPS.map((st) => (
                  <Stop key={st.offset} offset={st.offset} stopColor={c.surface} stopOpacity={st.opacity} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fadeId})`} />
          </Svg>
        </View>
      ) : null}
      {city ? (
        <View style={styles.city} pointerEvents="none">
          <Text style={styles.cityText} numberOfLines={1} testID="point-card-city">
            {city}
          </Text>
        </View>
      ) : null}
      <View style={styles.top}>
        <View style={styles.copy}>
          <View style={[styles.tagRow, city ? styles.tagRowWithCity : null]}>
            {tag ? (
              <Text style={styles.tag} numberOfLines={1}>
                {tag}
              </Text>
            ) : null}
            {boosted ? (
              <TouchableOpacity
                style={[styles.boosted, { backgroundColor: pills.boosted.bg, borderColor: pills.boosted.border }]}
                onPress={onWhyBoosted}
                disabled={!onWhyBoosted}
                hitSlop={8}
                accessibilityRole={onWhyBoosted ? 'button' : 'text'}
                accessibilityLabel={onWhyBoosted ? 'Boosted. Why am I seeing this?' : 'Boosted'}
              >
                <Zap size={11} color={pills.boosted.fg} fill={pills.boosted.fg} strokeWidth={2.5} />
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {node.title}
          </Text>
          {where || isAggregated(node) ? (
            <Text style={styles.venue} numberOfLines={1}>
              {where}
              {/* Listed by @LocalRadar from a public source, not posted by the venue. */}
              {isAggregated(node) ? <Text style={styles.via}>{where ? ' · ' : ''}{AGGREGATED_TAG}</Text> : null}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.bottom}>
        <View
          style={[styles.pills, extra !== undefined && styles.pillsOneRow]}
          onLayout={(e) => {
            pillsWidth.current = e.nativeEvent.layout.width;
            judgeExtra();
          }}
        >
          {timing && timingColors ? (
            <View style={[styles.pill, { backgroundColor: timingColors.bg }]}>
              {timing.kind === 'live' ? <View style={[styles.dot, { backgroundColor: timingColors.dot }]} /> : null}
              <Text style={[styles.pillText, { color: timingColors.fg }]} numberOfLines={1}>
                {timing.label}
              </Text>
            </View>
          ) : null}
          {distance ? (
            <View style={[styles.pill, { backgroundColor: pills.distance.bg }]}>
              <Text style={[styles.pillText, styles.pillTextPlain, { color: pills.distance.fg }]} numberOfLines={1}>
                {distance}
              </Text>
              {!distanceOnly && distanceMeters == null && node.eta && showsTravelTime(node.distanceMeters) ? <TravelIcon size={13} color={pills.distance.fg} strokeWidth={2.25} /> : null}
            </View>
          ) : null}
          {extra !== undefined ? (
            extra && extraFits !== false ? (
              <View
                style={[styles.pill, { backgroundColor: pills.later.bg }, extraFits === null && styles.measuring]}
                onLayout={(e) => {
                  extraEdge.current = e.nativeEvent.layout.x + e.nativeEvent.layout.width;
                  judgeExtra();
                }}
                testID={`point-card-${extra.kind}`}
              >
                <Text style={[styles.pillText, styles.pillTextPlain, { color: pills.later.fg }]} numberOfLines={1}>
                  {extra.label}
                </Text>
              </View>
            ) : null
          ) : node.facts?.priceLabel ? (
            <View style={[styles.pill, { backgroundColor: pills.later.bg }]} testID="point-card-price">
              <Text style={[styles.pillText, styles.pillTextPlain, { color: pills.later.fg }]} numberOfLines={1}>
                {node.facts.priceLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.rsvp, { backgroundColor: node.isRsvpd ? c.accent : pills.rsvp.bg }]}
            onPress={onToggleRsvp}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityState={{ selected: node.isRsvpd }}
            accessibilityLabel={node.isRsvpd ? `Going to ${node.title}. Cancel RSVP` : `RSVP to ${node.title}`}
          >
            <Check size={14} color={node.isRsvpd ? c.onAccent : pills.rsvp.fg} strokeWidth={3} />
            <Text style={[styles.rsvpText, { color: node.isRsvpd ? c.onAccent : pills.rsvp.fg }]}>
              {node.isRsvpd ? 'Going' : 'RSVP'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      // Keeps the photo inside the rounded corners.
      overflow: 'hidden',
    },
    // Details move right to make room for the photo column.
    cardWithPhoto: { paddingLeft: PHOTO_CONTENT_INSET },
    photoWrap: { position: 'absolute', top: 0, left: 0, bottom: 0, width: PHOTO_WIDTH },
    // Selected on the map: a soft green outline, like the design's middle card.
    cardSelected: { borderColor: c.green, borderWidth: 1.5 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copy: { flex: 1, minWidth: 0, gap: 1 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    // Leaves room for the city in the card's top-right corner.
    tagRowWithCity: { paddingRight: 100 },
    city: { position: 'absolute', top: 9, right: 12, maxWidth: 118, zIndex: 1 },
    cityText: {
      // Full text color, a size up and heavy.
      color: c.text,
      fontSize: 12,
      fontWeight: '900',
    },
    tag: { color: c.accent, fontSize: 12, fontWeight: '800', flexShrink: 1 },
    // Just the bolt in a small pill, so it fits beside the #tag without wrapping the row.
    boosted: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
    },
    title: { color: c.text, fontSize: 16, fontWeight: '800', lineHeight: 20 },
    venue: { color: c.textMuted, fontSize: 12 },
    via: { color: c.textFaint, fontStyle: 'italic' },
    bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
    // Discover: one row; anything that doesn't fit is left out rather than wrapped.
    pillsOneRow: { flexWrap: 'nowrap', overflow: 'hidden' },
    measuring: { opacity: 0 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 14,
      maxWidth: '100%',
    },
    dot: { width: 7, height: 7, borderRadius: 4 },
    pillText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2, flexShrink: 1 },
    pillTextPlain: { fontWeight: '600', letterSpacing: 0 },
    actions: { flexDirection: 'row', alignItems: 'center' },
    rsvp: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
    },
    rsvpText: { fontSize: 13, fontWeight: '800' },
  });
