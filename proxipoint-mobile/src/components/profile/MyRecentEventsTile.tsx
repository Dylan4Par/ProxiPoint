import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, History, RotateCcw } from 'lucide-react-native';
import { cleanVenueLabel, endedSummary, pointStatus, recentEndedPoints, type DroppedPoint } from '../../lib/droppedPoint';
import { useBoosts } from '../../lib/boost';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** How many ended events the tile lists before "See all past events". */
const SHOWN = 3;

/**
 * Profile → MY RECENT EVENTS: events you created that have ended, newest first.
 * Tap one to open it (Manage sheet, read-only once ended), or "Again" to drop it again.
 */
export const MyRecentEventsTile: React.FC<{
  drops: DroppedPoint[];
  onOpen: (id: string) => void;
  onDropAgain: (id: string) => void;
  /** My Drops, which lists every past event. */
  onSeeAll: () => void;
}> = ({ drops, onOpen, onDropAgain, onSeeAll }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // Ticks every 30s, so an event moves in here as soon as it ends.
  const clock = useBoosts();
  const now = new Date(clock);
  const recent = recentEndedPoints(drops, now, SHOWN);
  const pastCount = drops.filter((drop) => pointStatus(drop, now) === 'past').length;

  if (recent.length === 0) {
    return (
      <View style={[styles.tile, styles.emptyTile]} testID="profile-recent-events-empty">
        <History size={18} color={c.textFaint} strokeWidth={2} />
        <Text style={styles.empty}>Events you create show up here after they end.</Text>
      </View>
    );
  }

  return (
    <View style={styles.tile} testID="profile-recent-events">
      {recent.map((drop, index) => (
        <TouchableOpacity
          key={drop.id}
          style={[styles.row, index > 0 && styles.rowDivider]}
          onPress={() => onOpen(drop.id)}
          accessibilityRole="button"
          accessibilityLabel={`${drop.title}, ${endedSummary(drop)}`}
          testID={`profile-recent-${drop.id}`}
        >
          <View style={styles.photo}>
            {drop.coverPhotoUri ? (
              <Image source={{ uri: drop.coverPhotoUri }} style={styles.photoImage} />
            ) : (
              <Text style={styles.photoInitial}>{drop.title.trim().charAt(0).toUpperCase() || '•'}</Text>
            )}
          </View>
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
          {/* Its own button, so tapping the rest of the row still opens the event. */}
          <TouchableOpacity
            style={styles.againBtn}
            onPress={() => onDropAgain(drop.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Create ${drop.title} again`}
            testID={`profile-recent-again-${drop.id}`}
          >
            <RotateCcw size={13} color={c.accent} strokeWidth={2.5} />
            <Text style={styles.againText}>Again</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}

      {pastCount > SHOWN ? (
        <TouchableOpacity
          style={styles.seeAll}
          onPress={onSeeAll}
          accessibilityRole="button"
          testID="profile-recent-see-all"
        >
          <Text style={styles.seeAllText}>See all {pastCount} past events</Text>
          <ChevronRight size={16} color={c.accent} strokeWidth={2.5} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    tile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    emptyTile: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
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
      opacity: 0.8,
    },
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
    seeAll: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
    seeAllText: { color: c.accent, fontSize: 13, fontWeight: '800' },
  });
