import React, { useEffect, useId, useRef, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Car, Check, Info, PersonStanding, Zap } from 'lucide-react-native';
import { CategoryBadge } from './CategoryBadge';
import { hostAvatarUri } from '../../lib/hostProfiles';
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
 *   (badge)  #Tag  [⚡ BOOSTED]                  ░▒▓ photo
 *            Title                               ░▒▓
 *            Venue                               ░▒▓
 *   [● LIVE NOW] [540m • 7 min walk 🚶]               [✓ RSVP]
 *
 * Badge: the host's profile picture, or the tag's icon when they have none.
 * Photo: the event's own cover photo fills the right side behind the text and buttons at an even
 * 60%, with a short soft fade to nothing along its left edge. No cover photo = plain card.
 *
 * Pills keep fixed light colors in dark mode (like the design) and soft tints in light mode.
 */

/** Share of the card's width the background photo covers, from the right edge. */
const PHOTO_WIDTH = '20%';
/** Photo strength (the same across the photo, apart from the fade on its left edge). */
const PHOTO_OPACITY = 0.6;
/** Share of the photo's width, from its left edge, that fades in from 0 to PHOTO_OPACITY. */
const PHOTO_FADE = 0.3;

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
  /** Paid Boost: labeled; with onWhyBoosted the label also explains why. */
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
  const avatar = hostAvatarUri(node.host);
  const photo = node.coverPhotoLargeUri ?? node.coverPhotoUri ?? null;
  // SVG ids must be plain names; useId gives ":r1:"-style ones.
  const fadeId = `pc-fade-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[node.title, timing?.label, where, distance, node.facts?.priceLabel, boosted ? 'Boosted' : null].filter(Boolean).join('. ')}
      accessibilityHint="Opens the details"
      testID={testID ?? `point-card-${node.id}`}
    >
      {photo ? (
        // Drawn first, so everything else sits on top. The photo is fully opaque and a gradient
        // in the card's own color covers it: solid at the left edge, 40% over the rest. Same look as
        // fading the photo itself, without an SVG mask (unreliable on some Android versions).
        <View style={styles.photoWrap} pointerEvents="none" testID="point-card-photo">
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={c.surface} stopOpacity={1} />
                <Stop offset={PHOTO_FADE} stopColor={c.surface} stopOpacity={1 - PHOTO_OPACITY} />
                <Stop offset="1" stopColor={c.surface} stopOpacity={1 - PHOTO_OPACITY} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fadeId})`} />
          </Svg>
        </View>
      ) : null}
      {city ? (
        <Text style={[styles.city, photo ? styles.onPhoto : null]} numberOfLines={1} testID="point-card-city">
          {city}
        </Text>
      ) : null}
      <View style={styles.top}>
        <CategoryBadge tag={tag} title={node.title} photoUri={avatar} size={46} />
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
                <Zap size={10} color={pills.boosted.fg} fill={pills.boosted.fg} strokeWidth={2.5} />
                <Text style={[styles.boostedText, { color: pills.boosted.fg }]}>BOOSTED</Text>
                {onWhyBoosted ? <Info size={11} color={pills.boosted.fg} strokeWidth={2.5} /> : null}
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
      // Keeps the background photo inside the rounded corners.
      overflow: 'hidden',
    },
    photoWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, width: PHOTO_WIDTH },
    // Small text over the photo: a soft halo in the card's color keeps it readable.
    onPhoto: { textShadowColor: c.surface, textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 } },
    // Selected on the map: a soft green outline, like the design's middle card.
    cardSelected: { borderColor: c.green, borderWidth: 1.5 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copy: { flex: 1, minWidth: 0, gap: 1 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    // Leaves room for the city in the card's top-right corner.
    tagRowWithCity: { paddingRight: 92 },
    city: {
      position: 'absolute',
      top: 9,
      right: 12,
      maxWidth: 110,
      zIndex: 1,
      // Full text color (not muted) so it reads over the photo.
      color: c.text,
      fontSize: 11,
      fontWeight: '700',
    },
    tag: { color: c.accent, fontSize: 12, fontWeight: '800', flexShrink: 1 },
    boosted: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
      borderWidth: 1,
    },
    boostedText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
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
