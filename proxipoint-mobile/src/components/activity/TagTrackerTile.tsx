import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Zap } from 'lucide-react-native';
import type { TagStats } from '../../lib/recommend';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const GOLD = '#f59e0b';

/**
 * Activity → TAG TRACKER: for each #tag you follow, how many Points use it right now
 * (live / starting within 3 hours / later) and how many are boosted.
 * Tapping a row shows that #tag on Discover.
 */
export const TagTrackerTile: React.FC<{
  stats: TagStats[];
  onOpenTag: (tag: string) => void;
}> = ({ stats, onOpenTag }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // Busiest first; quiet tags stay listed so you can see they're being watched.
  const rows = [...stats].sort((a, b) => b.live - a.live || b.total - a.total);

  return (
    <View style={styles.tile} testID="activity-tag-tracker">
      <View style={styles.legend}>
        <Legend color={c.green} label="Live" />
        <Legend color={c.sky} label="Within 3h" />
        <Legend color={c.borderStrong} label="Later" />
      </View>
      {rows.map((row, index) => (
        <TouchableOpacity
          key={row.tag}
          style={[styles.row, index > 0 && styles.rowDivider]}
          onPress={() => onOpenTag(row.tag)}
          accessibilityRole="button"
          accessibilityLabel={`${row.tag}: ${row.live} live, ${row.soon} within 3 hours, ${row.later} later${row.boosted ? `, ${row.boosted} boosted` : ''}. Show on Discover.`}
          testID={`tag-tracker-${row.tag}`}
        >
          <View style={styles.rowTop}>
            <Text style={styles.tag} numberOfLines={1}>
              {row.tag}
            </Text>
            {row.boosted ? (
              <View style={styles.boost}>
                <Zap size={10} color={GOLD} fill={GOLD} strokeWidth={2} />
                <Text style={styles.boostText}>{row.boosted}</Text>
              </View>
            ) : null}
            <Text style={styles.summary}>
              {row.total === 0
                ? 'Nothing right now'
                : [row.live ? `${row.live} live` : null, row.soon ? `${row.soon} soon` : null, row.later ? `${row.later} later` : null]
                    .filter(Boolean)
                    .join(' · ')}
            </Text>
            <ChevronRight size={15} color={c.iconFaint} strokeWidth={2.25} />
          </View>
          <View style={styles.bar}>
            {row.total === 0 ? null : (
              <>
                {row.live ? <View style={{ flex: row.live, backgroundColor: c.green }} /> : null}
                {row.soon ? <View style={{ flex: row.soon, backgroundColor: c.sky }} /> : null}
                {row.later ? <View style={{ flex: row.later, backgroundColor: c.borderStrong }} /> : null}
              </>
            )}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
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
      paddingVertical: 10,
    },
    legend: { flexDirection: 'row', gap: 14, paddingBottom: 6 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { color: c.textMuted, fontSize: 11, fontWeight: '600' },
    row: { paddingVertical: 10, gap: 7 },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tag: { flexShrink: 1, color: c.accent, fontSize: 14, fontWeight: '800' },
    boost: {
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
    boostText: { color: GOLD, fontSize: 10, fontWeight: '900' },
    summary: { flex: 1, textAlign: 'right', color: c.textMuted, fontSize: 12, fontWeight: '600' },
    bar: {
      flexDirection: 'row',
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: c.base,
      gap: 2,
    },
  });
