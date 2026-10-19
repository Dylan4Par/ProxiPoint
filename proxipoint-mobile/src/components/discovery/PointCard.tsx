import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Car, Check, Info, PersonStanding, User, Zap } from 'lucide-react-native';
import { CategoryBadge } from './CategoryBadge';
import { distanceLabel, goingLabel, pointTiming, type TimingKind } from '../../lib/pointCard';
import type { DiscoveryNode } from '../../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * The Point card used on Discover and the Explore Map list:
 *
 *   (photo)  #Tag  [⚡ BOOSTED]
 *            Title
 *            Venue
 *   [● LIVE NOW] [540m • 7 min walk 🚶]        (faces 12+) [✓ RSVP]
 *
 * Pills keep fixed light colors in dark mode (like the design) and soft tints in light mode.
 */

/** Pill colors per mode. They're fixed (not theme tokens) because the light theme inverts tokens. */
const PILLS = {
  dark: {
    live: { bg: '#bbf7d0', fg: '#14532d', dot: '#16a34a' },
    soon: { bg: '#166534', fg: '#dcfce7', dot: '#86efac' },
    later: { bg: '#1e293b', fg: '#cbd5e1', dot: '#94a3b8' },
    distance: { bg: '#cfe3ff', fg: '#0f2a4a' },
    rsvp: { bg: '#f1f5f9', fg: '#0f172a' },
    boosted: { bg: 'rgba(245, 158, 11, 0.14)', border: '#b45309', fg: '#fbbf24' },
    face: ['#c4b5fd', '#fdba74'],
    count: { bg: '#cbd5e1', fg: '#0f172a' },
  },
  light: {
    live: { bg: '#dcfce7', fg: '#14532d', dot: '#16a34a' },
    soon: { bg: '#166534', fg: '#f0fdf4', dot: '#86efac' },
    later: { bg: '#e2e8f0', fg: '#334155', dot: '#64748b' },
    distance: { bg: '#dbeafe', fg: '#1e3a8a' },
    rsvp: { bg: '#0f172a', fg: '#ffffff' },
    boosted: { bg: '#fef3c7', border: '#f59e0b', fg: '#92400e' },
    face: ['#ddd6fe', '#fed7aa'],
    count: { bg: '#e2e8f0', fg: '#0f172a' },
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
  testID?: string;
}> = ({ node, onOpen, onToggleRsvp, boosted = false, onWhyBoosted, selected = false, distanceMeters, now, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c, mode } = useTheme();
  const pills = PILLS[mode === 'light' ? 'light' : 'dark'];
  const tag = node.tags?.[0] ?? node.tag;
  const where = node.locationPrivacy?.regionName ? `In ${node.locationPrivacy.regionName}` : node.venue;
  const timing = pointTiming(node, now);
  const distance = distanceLabel(distanceMeters ?? node.distanceMeters, distanceMeters == null ? node.eta : null);
  const going = goingLabel(node.attendeeCount);
  const TravelIcon = node.etaMode === 'drive' ? Car : PersonStanding;
  const timingColors = timing ? pills[timing.kind as TimingKind] : null;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={[node.title, timing?.label, where, distance, boosted ? 'Boosted' : null].filter(Boolean).join('. ')}
      accessibilityHint="Opens the details"
      testID={testID ?? `point-card-${node.id}`}
    >
      <View style={styles.top}>
        <CategoryBadge tag={tag} title={node.title} photoUri={node.coverPhotoUri} size={46} />
        <View style={styles.copy}>
          <View style={styles.tagRow}>
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
          {where ? (
            <Text style={styles.venue} numberOfLines={1}>
              {where}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.bottom}>
        <View style={styles.pills}>
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
              {distanceMeters == null && node.eta ? <TravelIcon size={13} color={pills.distance.fg} strokeWidth={2.25} /> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.actions}>
          {going ? (
            <View style={styles.faces} accessibilityLabel={`${going} going`}>
              {pills.face.map((bg, i) => (
                <View key={bg} style={[styles.face, { backgroundColor: bg }, i > 0 && styles.faceOverlap]}>
                  <User size={12} color="#334155" strokeWidth={2.25} />
                </View>
              ))}
              <View style={[styles.face, styles.faceOverlap, styles.count, { backgroundColor: pills.count.bg }]}>
                <Text style={[styles.countText, { color: pills.count.fg }]} numberOfLines={1} adjustsFontSizeToFit>
                  {going}
                </Text>
              </View>
            </View>
          ) : null}
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
    },
    // Selected on the map: a soft green outline, like the design's middle card.
    cardSelected: { borderColor: c.green, borderWidth: 1.5 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copy: { flex: 1, minWidth: 0, gap: 1 },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
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
    bottom: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
    pills: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 },
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
    // Going faces stacked above the RSVP button, both right-aligned.
    actions: { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
    faces: { flexDirection: 'row', alignItems: 'center' },
    face: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    faceOverlap: { marginLeft: -8 },
    count: { width: 30, paddingHorizontal: 2 },
    countText: { fontSize: 9, fontWeight: '800' },
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
