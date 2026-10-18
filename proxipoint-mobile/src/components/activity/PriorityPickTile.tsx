import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Check, ChevronRight, Sparkles, Zap } from 'lucide-react-native';
import { CategoryBadge } from '../discovery/CategoryBadge';
import { LiveBadge } from '../drops/LiveBadge';
import type { PriorityPick } from '../../lib/recommend';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const GOLD = '#f59e0b';

/**
 * Activity → PRIORITY RECOMMENDATION: the best Point for your #tags right now, why it was
 * picked, and the next two runners-up.
 */
export const PriorityPickTile: React.FC<{
  picks: PriorityPick[];
  onOpenPoint: (id: string) => void;
  onToggleRsvp: (id: string) => void;
}> = ({ picks, onOpenPoint, onToggleRsvp }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [top, ...rest] = picks;

  if (!top) {
    return (
      <View style={[styles.tile, styles.tileEmpty]} testID="activity-priority-empty">
        <Sparkles size={18} color={c.textMuted} strokeWidth={2} />
        <Text style={styles.emptyText}>Nothing matches your #tags right now. Check back soon.</Text>
      </View>
    );
  }

  const { node } = top;
  const where = node.locationPrivacy?.regionName ? `Somewhere in ${node.locationPrivacy.regionName}` : node.venue ?? '';
  const mainTag = (Array.isArray(node.tags) && node.tags[0]) || node.tag || '';

  return (
    <View style={[styles.tile, top.boosted && styles.tileBoosted]} testID="activity-priority">
      <TouchableOpacity
        style={styles.main}
        activeOpacity={0.85}
        onPress={() => onOpenPoint(node.id)}
        accessibilityRole="button"
        accessibilityLabel={`Top pick: ${node.title}. ${top.reasons.join(', ')}`}
      >
        <CategoryBadge tag={mainTag} title={node.title} photoUri={node.coverPhotoUri ?? null} size={56} />
        <View style={styles.copy}>
          <View style={styles.kickerRow}>
            <Text style={styles.kicker}>TOP PICK FOR YOU</Text>
            {top.boosted ? (
              <View style={styles.boostChip}>
                <Zap size={10} color={GOLD} fill={GOLD} strokeWidth={2} />
                <Text style={styles.boostText}>BOOSTED</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {node.title}
          </Text>
          {where ? (
            <Text style={styles.where} numberOfLines={1}>
              {where}
            </Text>
          ) : null}
          {top.live ? <LiveBadge label="LIVE NOW" /> : node.status ? <Text style={styles.when}>{node.status}</Text> : null}
        </View>
      </TouchableOpacity>

      <View style={styles.reasons}>
        {top.reasons.map((reason) => (
          <View key={reason} style={styles.reason}>
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => onOpenPoint(node.id)}
          accessibilityRole="button"
          testID="activity-priority-view"
        >
          <Text style={styles.viewText}>VIEW POINT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.rsvpBtn, node.isRsvpd && styles.rsvpBtnOn]}
          onPress={() => onToggleRsvp(node.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: Boolean(node.isRsvpd) }}
          testID="activity-priority-rsvp"
        >
          {node.isRsvpd ? <Check size={15} color={c.accent} strokeWidth={3} /> : null}
          <Text style={styles.rsvpText}>{node.isRsvpd ? 'GOING' : 'RSVP'}</Text>
        </TouchableOpacity>
      </View>

      {rest.length ? (
        <View style={styles.more}>
          <Text style={styles.moreLabel}>ALSO FOR YOU</Text>
          {rest.slice(0, 2).map((pick) => (
            <TouchableOpacity
              key={pick.node.id}
              style={styles.moreRow}
              onPress={() => onOpenPoint(pick.node.id)}
              accessibilityRole="button"
            >
              {pick.boosted ? <Zap size={12} color={GOLD} fill={GOLD} strokeWidth={2} /> : null}
              <Text style={styles.moreTitle} numberOfLines={1}>
                {pick.node.title}
              </Text>
              <Text style={styles.moreWhen} numberOfLines={1}>
                {pick.live ? 'Live now' : pick.node.status ?? ''}
              </Text>
              <ChevronRight size={14} color={c.iconFaint} strokeWidth={2.25} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    tile: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: c.accentBorder,
      padding: 14,
      gap: 12,
    },
    tileBoosted: { borderColor: GOLD },
    tileEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.border },
    emptyText: { flex: 1, color: c.textMuted, fontSize: 13, lineHeight: 18 },
    main: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    copy: { flex: 1, gap: 3, alignItems: 'flex-start' },
    kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    kicker: { color: c.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
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
    title: { color: c.text, fontSize: 18, fontWeight: '800' },
    where: { color: c.textMuted, fontSize: 12 },
    when: { color: c.accentSoft, fontSize: 12, fontWeight: '700' },
    reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
    more: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 2 },
    moreLabel: { color: c.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 2 },
    moreRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
    moreTitle: { flex: 1, color: c.text, fontSize: 14, fontWeight: '700' },
    moreWhen: { color: c.textMuted, fontSize: 12, maxWidth: 120 },
  });
