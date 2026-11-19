import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, History, RotateCcw, Users } from 'lucide-react-native';
import { formatBeaconTime } from '../../lib/beaconWindow';
import {
  attendeeSummary,
  cleanVenueLabel,
  endedSummary,
  liveDroppedPoints,
  pointStatus,
  recentEndedPoints,
  type DroppedPoint,
} from '../../lib/droppedPoint';
import { useBoosts } from '../../lib/boost';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** How many ended Points RECENT POINTS lists before the "View all past points" link. */
const RECENT_SHOWN = 2;

/**
 * Profile → MY EVENTS.
 * - LIVE NOW (only while one of your Points is on): cyan card, blinking dot, attendee count.
 * - RECENT POINTS (always): the last 1–2 ended Points with Drop Again, then a link to all past ones.
 */
export const MyEventsTile: React.FC<{
  drops: DroppedPoint[];
  /** Opens one of your Points (Manage sheet). */
  onOpen: (id: string) => void;
  onDropAgain: (id: string) => void;
  /** My Drops, which lists every past Point. */
  onSeeAll: () => void;
}> = ({ drops, onOpen, onDropAgain, onSeeAll }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // Ticks every 30s, so Points move from LIVE NOW to RECENT POINTS as they end.
  const now = new Date(useBoosts());
  const live = liveDroppedPoints(drops, now);
  const recent = recentEndedPoints(drops, now, RECENT_SHOWN);
  const pastCount = drops.filter((drop) => pointStatus(drop, now) === 'past').length;

  return (
    <View style={styles.wrap} testID="profile-my-events">
      {live.length > 0 ? (
        <View style={styles.group} testID="profile-live-now">
          <View style={styles.subHeader}>
            <BlinkingDot />
            <Text style={[styles.subLabel, styles.subLabelLive]}>LIVE NOW</Text>
          </View>
          {live.map((drop) => (
            <TouchableOpacity
              key={drop.id}
              style={styles.liveCard}
              onPress={() => onOpen(drop.id)}
              accessibilityRole="button"
              accessibilityLabel={`${drop.title}, live now until ${formatBeaconTime(new Date(drop.endsAt))}, ${attendeeSummary(drop)}`}
              testID={`profile-live-${drop.id}`}
            >
              <Avatar drop={drop} live />
              <View style={styles.copy}>
                <Text style={styles.title} numberOfLines={1}>
                  {drop.title}
                </Text>
                <Text style={styles.liveMeta} numberOfLines={1}>
                  Until {formatBeaconTime(new Date(drop.endsAt))} · {cleanVenueLabel(drop.venue)}
                </Text>
                <View style={styles.attendees}>
                  <Users size={12} color={c.accent} strokeWidth={2.5} />
                  <Text style={styles.attendeesText} testID={`profile-live-attendees-${drop.id}`}>
                    {attendeeSummary(drop)}
                  </Text>
                </View>
              </View>
              <Text style={styles.manage}>Manage</Text>
              <ChevronRight size={16} color={c.accent} strokeWidth={2.5} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.group} testID="profile-recent-points">
        <View style={styles.subHeader}>
          <Text style={styles.subLabel}>RECENT POINTS</Text>
        </View>
        <View style={styles.tile}>
          {recent.length === 0 ? (
            <View style={styles.emptyRow} testID="profile-recent-empty">
              <History size={18} color={c.textFaint} strokeWidth={2} />
              <Text style={styles.empty}>Points you create show up here after they end.</Text>
            </View>
          ) : (
            recent.map((drop, index) => (
              <TouchableOpacity
                key={drop.id}
                style={[styles.row, index > 0 && styles.rowDivider]}
                onPress={() => onOpen(drop.id)}
                accessibilityRole="button"
                accessibilityLabel={`${drop.title}, ${endedSummary(drop)}`}
                testID={`profile-recent-${drop.id}`}
              >
                <Avatar drop={drop} />
                <View style={styles.copy}>
                  <Text style={styles.title} numberOfLines={1}>
                    {drop.title}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {endedSummary(drop)}
                  </Text>
                  <Text style={styles.venue} numberOfLines={1}>
                    {cleanVenueLabel(drop.venue)}
                  </Text>
                </View>
                {/* Its own button, so tapping the rest of the row still opens the Point. */}
                <TouchableOpacity
                  style={styles.againBtn}
                  onPress={() => onDropAgain(drop.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Drop ${drop.title} again`}
                  testID={`profile-recent-again-${drop.id}`}
                >
                  <RotateCcw size={13} color={c.accent} strokeWidth={2.5} />
                  <Text style={styles.againText}>Drop Again</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))
          )}
        </View>
        {pastCount > 0 ? (
          <TouchableOpacity
            style={styles.viewAll}
            onPress={onSeeAll}
            hitSlop={{ top: 6, bottom: 6 }}
            accessibilityRole="link"
            testID="profile-recent-view-all"
          >
            <Text style={styles.viewAllText}>View all past points ({pastCount})</Text>
            <ChevronRight size={15} color={c.accent} strokeWidth={2.5} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const Avatar: React.FC<{ drop: DroppedPoint; live?: boolean }> = ({ drop, live = false }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.photo, live ? styles.photoLive : styles.photoPast]}>
      {drop.coverPhotoUri ? (
        <Image source={{ uri: drop.coverPhotoUri }} style={styles.photoImage} />
      ) : (
        <Text style={styles.photoInitial}>{drop.title.trim().charAt(0).toUpperCase() || '•'}</Text>
      )}
    </View>
  );
};

/** Cyan dot that blinks; holds steady when the system "Reduce motion" setting is on. */
const BlinkingDot: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const blink = useRef(new Animated.Value(1)).current;
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
      blink.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.2, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink, reduced]);

  return <Animated.View style={[styles.liveDot, { opacity: blink }]} accessibilityElementsHidden />;
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: 14 },
    group: { gap: 8 },
    subHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    subLabel: { color: c.textFaint, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
    subLabelLive: { color: c.accent },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
    liveCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: c.accent,
      backgroundColor: c.accentTint,
    },
    liveMeta: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    attendees: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    attendeesText: { color: c.accent, fontSize: 12, fontWeight: '800' },
    manage: { color: c.accent, fontSize: 13, fontWeight: '800' },
    tile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    empty: { flex: 1, color: c.textFaint, fontSize: 13 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    photo: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.accentTint,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    photoLive: { borderWidth: 1.5, borderColor: c.accent },
    photoPast: { opacity: 0.8 },
    photoImage: { width: '100%', height: '100%' },
    photoInitial: { color: c.accent, fontSize: 16, fontWeight: '800' },
    copy: { flex: 1, gap: 1 },
    title: { color: c.text, fontSize: 15, fontWeight: '700' },
    meta: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    venue: { color: c.textFaint, fontSize: 12 },
    againBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    againText: { color: c.accent, fontSize: 12, fontWeight: '800' },
    viewAll: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, paddingVertical: 2 },
    viewAllText: { color: c.accent, fontSize: 13, fontWeight: '700' },
  });
